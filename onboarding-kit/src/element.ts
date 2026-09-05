/**
 * `<onboarding-tour>`: a self-contained product tour overlay.
 *
 * Feed it a scenario — via the `.scenario` property, or a `src` attribute pointing at a JSON file
 * — and it renders a dimmed backdrop, a spotlight, and an anchored tooltip inside its own shadow
 * root, driven by the headless state machine in `lib/tour.ts`. One element, full-screen, no build
 * step required.
 *
 * Importing this module registers the element wherever there is a DOM, and does nothing anywhere
 * else, so a component file that is also evaluated on a server — an SSG build, an SSR render —
 * can import it at the top like any other module.
 *
 * @example
 * ```html ignore
 * <onboarding-tour src="/tours/main.json"></onboarding-tour>
 * ```
 *
 * @example
 * ```ts ignore
 * import { createOnboardingTour } from "@kuboon/onboarding-kit/element";
 *
 * let el = createOnboardingTour();
 * document.body.append(el);
 * el.scenario = scenario; // starts, unless this tour is already recorded as done
 * ```
 */

import {
  createTour,
  isTourVisible,
  resolveStepOptions,
  type Tour,
} from "./lib/tour.ts";
import type { TourScenario, TourStopReason } from "./lib/types.ts";
import { parseScenario } from "./schema.ts";
import { anchor } from "./lib/anchor.ts";
import { trackRect } from "./lib/track.ts";

/** The tag `defineOnboardingTour` registers unless it is given another one. */
export const DEFAULT_TAG_NAME = "onboarding-tour";

const DEFAULT_LABELS = {
  next: "Next",
  back: "Back",
  skip: "Skip",
  done: "Done",
  progress: "{index} / {total}",
};

const STYLE = `
:host { all: initial; }
.root { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
.backdrop, .backdrop.dim { position: fixed; inset: 0; pointer-events: auto; }
.backdrop.dim { background: rgb(0 0 0 / 0.55); }
.spotlight {
  position: fixed;
  top: 0; left: 0; width: 0; height: 0;
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55);
  outline: 2px solid rgb(255 255 255 / 0.9);
  outline-offset: 0;
  pointer-events: none;
  transition: top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease;
}
.tooltip {
  position: fixed;
  margin: 0;
  width: max-content;
  max-width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid rgb(0 0 0 / 0.1);
  border-radius: 10px;
  background: #fff;
  color: #111;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.24);
  font: 14px/1.5 system-ui, sans-serif;
  pointer-events: auto;
}
@media (prefers-color-scheme: dark) {
  .tooltip { background: #1c1c1e; color: #f2f2f2; border-color: rgb(255 255 255 / 0.14); }
  .primary { background: #f2f2f2; color: #111; }
}
.title { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.body { margin: 0; opacity: 0.85; }
.footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.progress { font-size: 12px; opacity: 0.6; font-variant-numeric: tabular-nums; }
.actions { display: flex; gap: 6px; }
button { border: 0; font: inherit; cursor: pointer; border-radius: 6px; }
.ghost { padding: 5px 10px; background: transparent; color: inherit; }
.ghost:hover:not(:disabled) { background: rgb(127 127 127 / 0.16); }
.ghost:disabled { opacity: 0.4; cursor: default; }
.primary { padding: 5px 12px; background: #111; color: #fff; font-weight: 600; }
.primary:hover { opacity: 0.85; }
`;

/**
 * A self-contained tour overlay: the element's own API on top of `HTMLElement`.
 *
 * This is a type, not a class, because the class behind it cannot exist until there is an
 * `HTMLElement` to extend — see {@link defineOnboardingTour}. Reach for `instanceof` through
 * `customElements.get(DEFAULT_TAG_NAME)` if you need it.
 *
 * The element fires `tour-change` (a `CustomEvent<TourState>`) on every state transition,
 * mirroring the underlying {@link Tour}'s own `change` event.
 */
export interface OnboardingTourElement extends HTMLElement {
  /**
   * The active tour's scenario, or `null` before one is set.
   *
   * Assigning replaces any tour already running on the element and starts the new one — unless the
   * store says this tour, at this version, is already done. Assigning `null` tears it down.
   */
  scenario: TourScenario | null;
  /** The underlying headless {@link Tour}, for direct access to its full API and `state`. */
  readonly tour: Tour | null;
  /**
   * (Re)starts the current scenario from its first resolvable step.
   *
   * `force` shows a tour the store has already recorded as done, which is what a "show me this
   * again" control in the app's own chrome needs — and it leaves the record alone, so the tour
   * still does not come back by itself on the next visit. Use {@link reset} for that.
   */
  start(options?: { force?: boolean }): Promise<void>;
  next(): Promise<void>;
  back(): Promise<void>;
  goto(id: string): Promise<void>;
  stop(reason: TourStopReason): Promise<void>;
  /** Forgets that this tour was completed, so it auto-starts again. */
  reset(): Promise<void>;
}

/** Built once, on the first {@link defineOnboardingTour} call in a DOM. */
let elementClass: (new () => OnboardingTourElement) | undefined;

function buildElementClass(): new () => OnboardingTourElement {
  if (elementClass !== undefined) return elementClass;

  elementClass = class extends HTMLElement implements OnboardingTourElement {
    #tour: Tour | null = null;
    #rootEl: HTMLDivElement;
    #backdropEl: HTMLDivElement;
    #spotlightEl: HTMLDivElement;
    #tooltipEl: HTMLDivElement;
    #titleEl: HTMLParagraphElement;
    #bodyEl: HTMLParagraphElement;
    #progressEl: HTMLSpanElement;
    #skipButton: HTMLButtonElement;
    #backButton: HTMLButtonElement;
    #nextButton: HTMLButtonElement;
    #detachAnchor: (() => void) | null = null;
    #detachTrack: (() => void) | null = null;

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = STYLE;

      this.#rootEl = document.createElement("div");
      this.#rootEl.className = "root";
      this.#rootEl.hidden = true;

      this.#backdropEl = document.createElement("div");
      this.#backdropEl.className = "backdrop";

      this.#spotlightEl = document.createElement("div");
      this.#spotlightEl.className = "spotlight";
      this.#spotlightEl.hidden = true;

      this.#tooltipEl = document.createElement("div");
      this.#tooltipEl.className = "tooltip";
      this.#tooltipEl.setAttribute("popover", "manual");
      this.#tooltipEl.setAttribute("role", "dialog");
      this.#tooltipEl.setAttribute("aria-live", "polite");

      this.#titleEl = document.createElement("p");
      this.#titleEl.className = "title";
      this.#bodyEl = document.createElement("p");
      this.#bodyEl.className = "body";

      const footer = document.createElement("div");
      footer.className = "footer";
      this.#progressEl = document.createElement("span");
      this.#progressEl.className = "progress";

      const actions = document.createElement("div");
      actions.className = "actions";
      this.#skipButton = document.createElement("button");
      this.#skipButton.type = "button";
      this.#skipButton.className = "ghost";
      this.#skipButton.addEventListener("click", () => void this.stop("skip"));
      this.#backButton = document.createElement("button");
      this.#backButton.type = "button";
      this.#backButton.className = "ghost";
      this.#backButton.addEventListener("click", () => void this.back());
      this.#nextButton = document.createElement("button");
      this.#nextButton.type = "button";
      this.#nextButton.className = "primary";
      this.#nextButton.addEventListener("click", () => {
        const state = this.#tour?.state;
        if (state === undefined) return;
        void (state.index >= state.total - 1
          ? this.stop("complete")
          : this.next());
      });
      actions.append(this.#skipButton, this.#backButton, this.#nextButton);
      footer.append(this.#progressEl, actions);

      this.#tooltipEl.append(this.#titleEl, this.#bodyEl, footer);
      this.#rootEl.append(this.#backdropEl, this.#spotlightEl, this.#tooltipEl);
      root.append(style, this.#rootEl);
    }

    connectedCallback(): void {
      const src = this.getAttribute("src");
      if (src !== null && this.#tour === null) void this.#loadFrom(src);
    }

    disconnectedCallback(): void {
      this.#clearPositioning();
      this.#tour?.dispose();
    }

    async #loadFrom(url: string): Promise<void> {
      const response = await fetch(url);
      this.scenario = parseScenario(await response.json());
    }

    get scenario(): TourScenario | null {
      return this.#tour?.scenario ?? null;
    }

    set scenario(value: TourScenario | null) {
      this.#clearPositioning();
      this.#tour?.dispose();
      this.#tour = value === null ? null : createTour(value);

      if (this.#tour !== null) {
        const tour = this.#tour;
        tour.addEventListener("change", () => {
          this.#sync();
          this.dispatchEvent(
            new CustomEvent("tour-change", { detail: tour.state }),
          );
        });
        void tour.start({ force: this.hasAttribute("force") });
      }
      this.#sync();
    }

    get tour(): Tour | null {
      return this.#tour;
    }

    start(options?: { force?: boolean }): Promise<void> {
      return this.#tour?.start(options) ?? Promise.resolve();
    }

    next(): Promise<void> {
      return this.#tour?.next() ?? Promise.resolve();
    }

    back(): Promise<void> {
      return this.#tour?.back() ?? Promise.resolve();
    }

    goto(id: string): Promise<void> {
      return this.#tour?.goto(id) ?? Promise.resolve();
    }

    stop(reason: TourStopReason): Promise<void> {
      return this.#tour?.stop(reason) ?? Promise.resolve();
    }

    reset(): Promise<void> {
      return this.#tour?.reset() ?? Promise.resolve();
    }

    #clearPositioning(): void {
      this.#detachAnchor?.();
      this.#detachAnchor = null;
      this.#detachTrack?.();
      this.#detachTrack = null;
    }

    #sync(): void {
      this.#clearPositioning();

      const tour = this.#tour;
      if (tour === null) {
        this.#rootEl.hidden = true;
        hidePopover(this.#tooltipEl);
        return;
      }

      const { status, step, index, total, target } = tour.state;
      const visible = isTourVisible(status) && step !== null;

      this.#rootEl.hidden = !visible;
      this.#rootEl.setAttribute("data-tour", tour.scenario.name);
      this.#rootEl.setAttribute("data-tour-status", status);

      if (!visible || step === null) {
        hidePopover(this.#tooltipEl);
        return;
      }

      const options = resolveStepOptions(tour.scenario, step);
      const labels = { ...DEFAULT_LABELS, ...tour.scenario.labels };
      const isLast = index >= total - 1;
      // Either the spotlight's ring-shaped shadow dims the page, or — when there is nothing to cut
      // out — the backdrop does it itself. Never both, or the overlap reads as two different greys.
      const spotlit = options.spotlight && target !== null;

      this.#backdropEl.classList.toggle("dim", !spotlit);
      this.#spotlightEl.hidden = !spotlit;

      this.#titleEl.hidden = step.title === undefined;
      this.#titleEl.textContent = step.title ?? "";
      this.#bodyEl.hidden = step.body === undefined;
      this.#bodyEl.textContent = step.body ?? "";
      this.#progressEl.textContent = labels.progress
        .replace("{index}", String(index + 1))
        .replace("{total}", String(total));
      this.#skipButton.textContent = labels.skip;
      this.#backButton.textContent = labels.back;
      this.#backButton.disabled = index <= 0;
      this.#nextButton.textContent = isLast ? labels.done : labels.next;

      showPopover(this.#tooltipEl);

      if (target === null) {
        centerFloating(this.#tooltipEl);
        return;
      }

      this.#tooltipEl.style.transform = "";
      this.#detachAnchor = anchor(this.#tooltipEl, target, {
        placement: options.placement,
        offset: options.offset,
      });

      if (spotlit) {
        const spotlightEl = this.#spotlightEl;
        const pad = options.spotlightPadding;
        this.#detachTrack = trackRect(target, (rect) => {
          spotlightEl.style.top = `${rect.top - pad}px`;
          spotlightEl.style.left = `${rect.left - pad}px`;
          spotlightEl.style.width = `${rect.width + pad * 2}px`;
          spotlightEl.style.height = `${rect.height + pad * 2}px`;
        });
      }
    }
  };

  return elementClass;
}

/**
 * Registers the custom element, if there is a DOM to register it in.
 *
 * Importing this module already calls this once, so most apps never need it; it is here for the
 * app that wants the overlay under a second tag name, and it is what makes the import itself safe
 * on a server. Calling it repeatedly, or where the tag is already taken, does nothing.
 *
 * @param tagName Tag to register. Defaults to {@link DEFAULT_TAG_NAME}
 * @returns Whether the element is registered under that name when this returns
 */
export function defineOnboardingTour(
  tagName: string = DEFAULT_TAG_NAME,
): boolean {
  if (
    typeof customElements === "undefined" || typeof HTMLElement === "undefined"
  ) {
    return false;
  }
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, buildElementClass());
  }
  return true;
}

/**
 * Creates an `<onboarding-tour>`, registering the element first if it is not already.
 *
 * Append it before setting `.scenario`: a tour that starts while its element is detached has
 * nowhere to draw its first step.
 *
 * @param tagName Tag to create. Defaults to {@link DEFAULT_TAG_NAME}
 * @returns The new element
 * @throws {Error} When there is no DOM to create it in
 */
export function createOnboardingTour(
  tagName: string = DEFAULT_TAG_NAME,
): OnboardingTourElement {
  if (!defineOnboardingTour(tagName)) {
    throw new Error(
      `createOnboardingTour("${tagName}") needs a DOM; there is no customElements here`,
    );
  }
  return document.createElement(tagName) as OnboardingTourElement;
}

/** Puts the tooltip in the middle of the viewport, undoing whatever `anchor()` left behind. */
function centerFloating(element: HTMLElement): void {
  element.style.top = "50%";
  element.style.left = "50%";
  element.style.transform = "translate(-50%, -50%)";
}

function showPopover(element: HTMLElement): void {
  if (typeof element.showPopover !== "function") return;
  try {
    if (!element.matches(":popover-open")) element.showPopover();
  } catch {
    // Not connected yet, or already open: the next sync() will settle it.
  }
}

function hidePopover(element: HTMLElement): void {
  if (typeof element.hidePopover !== "function") return;
  try {
    if (element.matches(":popover-open")) element.hidePopover();
  } catch {
    // Already closed.
  }
}

defineOnboardingTour();
