/**
 * `<share-dialog>`: a share panel, as a plain block of markup.
 *
 * Feed it a URL (and an explanatory message, shown only inside the panel — never passed to a
 * share target) and call `.open()`. It lines up X, LINE, and Threads share buttons, plus either a
 * native share-sheet button (where `navigator.share` exists) or a "copy URL" fallback.
 *
 * All four are monochrome icons drawn in `currentColor`, so they take the color the page gives the
 * button and need nothing said twice for dark mode. What a button is called lives on as its
 * `aria-label` and its tooltip rather than as text on it — see {@link ShareDialogLabels}.
 *
 * The URL always ends up somewhere the reader can use it. A share sheet that the platform refuses
 * to open — no registered target, an insecure context, a gesture the browser did not count —
 * falls through to the clipboard, and a clipboard that refuses says so on the button. The one
 * rejection that is not a failure is the reader closing the sheet, which is left alone.
 *
 * It is a plain `<div>`-like element, not a `<dialog>`: no backdrop, no focus trap, no top layer,
 * no opinion on how it's positioned. `.open()`/`.close()` only toggle its `hidden` attribute —
 * whether that's a popover, a fixed-position overlay, an inline panel, or something else entirely
 * is for the page's own markup and CSS to decide.
 *
 * Rendered in light DOM with plain, low-specificity (`:where()`) default styles under
 * `.share-dialog__*` classes, so a page's own stylesheet can restyle any part of it by writing a
 * same-or-higher-specificity rule for that class — no shadow DOM to pierce. The defaults are
 * unlayered, though, so a page that uses `@layer` has to write its overrides unlayered too:
 * unlayered CSS outranks every layer, and `:where()` counting for nothing does not change that.
 *
 * Importing this module registers the element wherever there is a DOM, and does nothing anywhere
 * else, so a component file that is also evaluated on a server — an SSG build, an SSR render —
 * can import it at the top like any other module.
 *
 * @example
 * ```html ignore
 * <share-dialog id="share"></share-dialog>
 * ```
 *
 * @example
 * ```ts ignore
 * import { createShareDialog } from "@kuboon/share-element";
 *
 * let el = createShareDialog();
 * document.body.append(el);
 * el.open({ url: "https://example.com/posts/1", text: "この記事をシェアしよう" });
 * ```
 */

import { lineShareUrl, threadsShareUrl, xShareUrl } from "./share_urls.ts";

export { lineShareUrl, threadsShareUrl, xShareUrl } from "./share_urls.ts";

/** The tag `defineShareDialog` registers unless it is given another one. */
export const DEFAULT_TAG_NAME = "share-dialog";

/**
 * Button and close-action labels. All optional; unset fields keep their current value.
 *
 * Every share button is icon-only, so these are what a button is *called* rather than what it
 * shows: each becomes the button's `aria-label` and its hover tooltip. `close` is the exception —
 * that button is still words.
 */
export type ShareDialogLabels = {
  x?: string;
  line?: string;
  threads?: string;
  share?: string;
  copy?: string;
  copied?: string;
  /** Shown when the URL could not be handed over at all — neither shared nor copied. */
  copyFailed?: string;
  close?: string;
};

const DEFAULT_LABELS: Required<ShareDialogLabels> = {
  x: "X",
  line: "LINE",
  threads: "Threads",
  share: "Share",
  copy: "Copy URL",
  copied: "Copied!",
  copyFailed: "Couldn't copy",
  close: "Close",
};

/** Options for {@link ShareDialogElement.open}. */
export type ShareDialogOpenOptions = {
  /** The URL every button shares. Falls back to the `url` attribute, then the last value used. */
  url?: string;
  /** Explanatory text shown inside the panel only. Falls back to the `text` attribute. */
  text?: string;
};

/**
 * One monochrome glyph, as `<path>` data on a 24×24 grid.
 *
 * Every button is icon-only, so the label a button used to show is now the thing screen readers
 * and a hover tooltip get instead — see {@link ShareDialogLabels}.
 *
 * Two shapes of drawing, because the two sets these come from differ: a brand mark is a filled
 * silhouette, and the generic marks are stroked outlines. Both are drawn in `currentColor`, which
 * is what makes them monochrome and what makes them follow whatever color the page gives the
 * button — no palette here, and nothing to restyle for dark mode.
 */
type Icon = {
  /** The `d` of each `<path>`. */
  paths: readonly string[];
  /** Stroked outline rather than filled silhouette. */
  stroke?: boolean;
};

/**
 * The glyphs, by the name of the button each belongs to.
 *
 * The three brand marks are [Simple Icons](https://simpleicons.org) (CC0-1.0); the four generic
 * ones are [Feather](https://feathericons.com) (MIT), redrawn as paths so one code path builds
 * them all. Each brand belongs to its owner — the marks are here to label the button that opens
 * that service, which is the use the brands themselves ask for.
 */
const ICONS = {
  x: {
    paths: [
      "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
    ],
  },
  line: {
    paths: [
      "M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314",
    ],
  },
  threads: {
    paths: [
      "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
    ],
  },
  share: {
    stroke: true,
    paths: [
      "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
      "M16 6 12 2 8 6",
      "M12 2v13",
    ],
  },
  copy: {
    stroke: true,
    paths: [
      "M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z",
      "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
    ],
  },
  copied: {
    stroke: true,
    paths: ["M20 6 9 17l-5-5"],
  },
  copyFailed: {
    stroke: true,
    paths: [
      "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
      "M12 9v4",
      "M12 17h.01",
    ],
  },
} as const satisfies Record<Exclude<keyof ShareDialogLabels, "close">, Icon>;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Draws one glyph.
 *
 * Built element by element rather than from a markup string: `innerHTML` on an SVG is the one
 * place a page's Trusted Types policy is most likely to say no, and there is nothing dynamic here
 * to be worth the risk.
 *
 * @param icon The glyph to draw
 * @returns An `<svg>` ready to put inside a button
 */
function iconElement(icon: Icon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "share-dialog__icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  // The button already carries the name; the glyph would only repeat it.
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  if (icon.stroke) {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  } else {
    svg.setAttribute("fill", "currentColor");
  }

  for (const d of icon.paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }

  return svg;
}

/**
 * Puts a glyph on a button, and the words where a button with no words needs them.
 *
 * @param button The button to fill in
 * @param icon The glyph to show
 * @param label What the button is called — its accessible name, and its tooltip
 */
function setButtonIcon(
  button: HTMLButtonElement,
  icon: Icon,
  label: string,
): void {
  button.replaceChildren(iconElement(icon));
  button.setAttribute("aria-label", label);
  button.title = label;
}

const STYLE_ID = "share-dialog-default-style";

const DEFAULT_STYLE = `
:where(.share-dialog) {
  display: block;
  padding: 1.5rem;
  border: 1px solid #d0d0d0;
  border-radius: 12px;
  max-width: 22rem;
  font: inherit;
}
:where(.share-dialog__text) { margin: 0 0 1rem; font: inherit; }
:where(.share-dialog__actions) { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0; margin: 0; }
:where(.share-dialog__button) {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  background: #fff;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
:where(.share-dialog__button:hover) { background: #f2f2f2; }
/* The glyph inherits the button's color, which is the whole of \`monochrome\` here. */
:where(.share-dialog__icon) { width: 1.25rem; height: 1.25rem; display: block; }
:where(.share-dialog__close) {
  display: block;
  margin: 1rem 0 0 auto;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
  opacity: 0.7;
}
:where(.share-dialog__close:hover) { opacity: 1; }

/*
 * Last, and the one rule here that is not \`:where()\`.
 *
 * Hiding is the element's contract rather than decoration — \`.close()\` sets \`hidden\` and
 * nothing else — so this rule has to win twice over. It cannot be left to the UA stylesheet's
 * \`[hidden] { display: none }\`, because the \`display: block\` above is author CSS and author
 * origin outranks UA origin whatever the specificity. And at zero specificity it would lose to a
 * page's own \`.share-dialog { display: flex }\`, closing the panel by attribute while leaving it
 * on screen. A page that really wants to place a closed panel itself still can, by matching
 * \`[hidden]\` in its own rule.
 */
.share-dialog[hidden] { display: none; }
`;

function ensureDefaultStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = DEFAULT_STYLE;
  document.head.append(style);
}

/**
 * Whether a rejection is the reader dismissing a share sheet rather than the platform refusing one.
 *
 * Read off `name` rather than through `instanceof DOMException`: the spec says `AbortError`, not
 * which constructor carries it, and the value reaching a `catch` is `unknown` in any case.
 *
 * @param error Whatever `navigator.share()` rejected with
 * @returns True when the reader cancelled
 */
function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    (error as { name?: unknown }).name === "AbortError";
}

/**
 * A share panel: the element's own API on top of `HTMLElement`.
 *
 * This is a type, not a class, because the class behind it cannot exist until there is an
 * `HTMLElement` to extend — see {@link defineShareDialog}. Reach for `instanceof` through
 * `customElements.get(DEFAULT_TAG_NAME)` if you need it.
 */
export interface ShareDialogElement extends HTMLElement {
  /** The button/close-action labels currently in effect. */
  labels: ShareDialogLabels;
  /** Sets the shared URL and the panel's text, then clears its `hidden` attribute. */
  open(options?: ShareDialogOpenOptions): void;
  /** Sets the `hidden` attribute. */
  close(): void;
}

/** The three elements the panel is made of, built on first insertion — see `#build()`. */
type PanelParts = {
  text: HTMLParagraphElement;
  actions: HTMLDivElement;
  close: HTMLButtonElement;
};

/** Built once, on the first {@link defineShareDialog} call in a DOM. */
let elementClass: (new () => ShareDialogElement) | undefined;

function buildElementClass(): new () => ShareDialogElement {
  if (elementClass !== undefined) return elementClass;

  elementClass = class extends HTMLElement implements ShareDialogElement {
    #parts?: PanelParts;
    #labels: Required<ShareDialogLabels> = { ...DEFAULT_LABELS };
    #url = "";
    #flashTimer?: ReturnType<typeof setTimeout>;

    /**
     * Builds the panel, once, the first time it is inserted or opened.
     *
     * Deliberately not the constructor's job. A custom element constructor may not add attributes
     * or children to itself, and `document.createElement()` enforces it: a constructor that does
     * fails with `NotSupportedError: The result must not have attributes` and hands back an
     * element that never upgraded, so every method on it is missing. Building here is what lets
     * the same element be made either way — written in markup and upgraded by the parser, or
     * created from script.
     *
     * @returns The panel's three parts, built if they were not already
     */
    #build(): PanelParts {
      const built = this.#parts;
      if (built !== undefined) return built;
      ensureDefaultStyle();

      this.classList.add("share-dialog");
      this.hidden = true;

      const text = document.createElement("p");
      text.className = "share-dialog__text";

      const actions = document.createElement("div");
      actions.className = "share-dialog__actions";

      const close = document.createElement("button");
      close.type = "button";
      close.className = "share-dialog__close";
      close.addEventListener("click", () => this.close());

      this.append(text, actions, close);
      this.#parts = { text, actions, close };
      this.#renderActions();
      return this.#parts;
    }

    connectedCallback(): void {
      this.#build();
    }

    get labels(): Required<ShareDialogLabels> {
      return { ...this.#labels };
    }

    set labels(value: ShareDialogLabels) {
      this.#labels = { ...this.#labels, ...value };
      this.#renderActions();
    }

    open(options: ShareDialogOpenOptions = {}): void {
      const parts = this.#build();
      this.#url = options.url ?? this.getAttribute("url") ?? this.#url;
      parts.text.textContent = options.text ?? this.getAttribute("text") ?? "";
      this.#renderActions();
      this.hidden = false;
    }

    close(): void {
      this.hidden = true;
    }

    #renderActions(): void {
      const parts = this.#parts;
      if (parts === undefined) return;
      this.#clearFlash();
      parts.actions.replaceChildren(
        this.#linkButton("x", this.#labels.x, xShareUrl(this.#url)),
        this.#linkButton("line", this.#labels.line, lineShareUrl(this.#url)),
        this.#linkButton(
          "threads",
          this.#labels.threads,
          threadsShareUrl(this.#url),
        ),
        this.#shareOrCopyButton(),
      );
      parts.close.textContent = this.#labels.close;
    }

    #linkButton(
      name: "x" | "line" | "threads",
      label: string,
      href: string,
    ): HTMLButtonElement {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `share-dialog__button share-dialog__button--${name}`;
      setButtonIcon(button, ICONS[name], label);
      button.addEventListener("click", () => {
        globalThis.open(
          href,
          "_blank",
          "noopener,noreferrer,width=600,height=500",
        );
      });
      return button;
    }

    #shareOrCopyButton(): HTMLButtonElement {
      const button = document.createElement("button");
      button.type = "button";
      if (typeof navigator.share === "function") {
        const label = this.#labels.share;
        button.className = "share-dialog__button share-dialog__button--share";
        setButtonIcon(button, ICONS.share, label);
        button.addEventListener(
          "click",
          () => void this.#shareUrl(button, ICONS.share, label),
        );
      } else {
        const label = this.#labels.copy;
        button.className = "share-dialog__button share-dialog__button--copy";
        setButtonIcon(button, ICONS.copy, label);
        button.addEventListener(
          "click",
          () => void this.#copyUrl(button, ICONS.copy, label),
        );
      }
      return button;
    }

    /**
     * Hands the URL to the platform's share sheet, and to the clipboard when that will not have it.
     *
     * A rejection is two different events wearing one type. `AbortError` is the reader closing the
     * sheet, which is an answer — there is nothing to fall back to, and copying behind their back
     * would be the wrong thing. Everything else is the platform declining to share at all: no
     * registered target, an insecure context, a gesture the browser did not count. The URL is
     * still the thing the reader asked for, so it goes to the clipboard rather than nowhere.
     *
     * @param button The button that was pressed, which reports what happened
     * @param icon That button's own glyph, to go back to
     * @param label That button's own name, to go back to
     */
    async #shareUrl(
      button: HTMLButtonElement,
      icon: Icon,
      label: string,
    ): Promise<void> {
      try {
        await navigator.share({ url: this.#url });
        return;
      } catch (error) {
        if (isAbortError(error)) return;
      }
      await this.#copyUrl(button, icon, label);
    }

    /**
     * Copies the URL, and says so on the button either way.
     *
     * The failure is shown rather than swallowed: this is the end of the line — the share sheet
     * has already declined or was never there — so a button that goes straight back to its copy
     * glyph with an empty clipboard is the one outcome a reader cannot tell from success.
     *
     * @param button The button that was pressed, which reports what happened
     * @param icon That button's own glyph, to go back to
     * @param label That button's own name, to go back to
     */
    async #copyUrl(
      button: HTMLButtonElement,
      icon: Icon,
      label: string,
    ): Promise<void> {
      try {
        await navigator.clipboard.writeText(this.#url);
        this.#flash(button, "copied", icon, label);
      } catch {
        this.#flash(button, "copyFailed", icon, label);
      }
    }

    /**
     * Answers on the button for a moment — a tick or a warning — then puts it back as it was.
     *
     * The accessible name changes with the glyph, so the answer is not something only a sighted
     * reader gets.
     */
    #flash(
      button: HTMLButtonElement,
      outcome: "copied" | "copyFailed",
      icon: Icon,
      label: string,
    ): void {
      this.#clearFlash();
      setButtonIcon(button, ICONS[outcome], this.#labels[outcome]);
      this.#flashTimer = setTimeout(() => {
        this.#flashTimer = undefined;
        setButtonIcon(button, icon, label);
      }, 1500);
    }

    /** Drops a pending restore, so a re-render or a second press cannot be undone by an old one. */
    #clearFlash(): void {
      if (this.#flashTimer === undefined) return;
      clearTimeout(this.#flashTimer);
      this.#flashTimer = undefined;
    }
  };

  return elementClass;
}

/**
 * Registers the custom element, if there is a DOM to register it in.
 *
 * Importing this module already calls this once, so most apps never need it; it is here for the
 * app that wants the panel under a second tag name, and it is what makes the import itself safe
 * on a server. Calling it repeatedly, or where the tag is already taken, does nothing.
 *
 * @param tagName Tag to register. Defaults to {@link DEFAULT_TAG_NAME}
 * @returns Whether the element is registered under that name when this returns
 */
export function defineShareDialog(tagName: string = DEFAULT_TAG_NAME): boolean {
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
 * Creates a `<share-dialog>`, registering the element first if it is not already.
 *
 * @param tagName Tag to create. Defaults to {@link DEFAULT_TAG_NAME}
 * @returns The new element
 * @throws {Error} When there is no DOM to create it in
 */
export function createShareDialog(
  tagName: string = DEFAULT_TAG_NAME,
): ShareDialogElement {
  if (!defineShareDialog(tagName)) {
    throw new Error(
      `createShareDialog("${tagName}") needs a DOM; there is no customElements here`,
    );
  }
  return document.createElement(tagName) as ShareDialogElement;
}

defineShareDialog();
