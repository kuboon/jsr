/**
 * `<share-dialog>`: a share panel, as a plain block of markup.
 *
 * Feed it a URL (and an explanatory message, shown only inside the panel — never passed to a
 * share target) and call `.open()`. It lines up X, LINE, and Threads share buttons, plus either a
 * native share-sheet button (where `navigator.share` exists) or a "copy URL" fallback.
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

/** Button and close-action labels. All optional; unset fields keep their current value. */
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
  padding: 0.5rem 0.75rem;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font: inherit;
}
:where(.share-dialog__button:hover) { background: #f2f2f2; }
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

    #linkButton(name: string, label: string, href: string): HTMLButtonElement {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `share-dialog__button share-dialog__button--${name}`;
      button.textContent = label;
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
        button.textContent = label;
        button.addEventListener(
          "click",
          () => void this.#shareUrl(button, label),
        );
      } else {
        const label = this.#labels.copy;
        button.className = "share-dialog__button share-dialog__button--copy";
        button.textContent = label;
        button.addEventListener(
          "click",
          () => void this.#copyUrl(button, label),
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
     * @param label What that button says when it is not reporting
     */
    async #shareUrl(button: HTMLButtonElement, label: string): Promise<void> {
      try {
        await navigator.share({ url: this.#url });
        return;
      } catch (error) {
        if (isAbortError(error)) return;
      }
      await this.#copyUrl(button, label);
    }

    /**
     * Copies the URL, and says so on the button either way.
     *
     * The failure is shown rather than swallowed: this is the end of the line — the share sheet
     * has already declined or was never there — so a button that goes back to reading "Copy URL"
     * with an empty clipboard is the one outcome a reader cannot tell from success.
     *
     * @param button The button that was pressed, which reports what happened
     * @param label What that button says when it is not reporting
     */
    async #copyUrl(button: HTMLButtonElement, label: string): Promise<void> {
      try {
        await navigator.clipboard.writeText(this.#url);
        this.#flash(button, this.#labels.copied, label);
      } catch {
        this.#flash(button, this.#labels.copyFailed, label);
      }
    }

    /** Shows a message on a button for a moment, then puts its label back. */
    #flash(button: HTMLButtonElement, message: string, label: string): void {
      this.#clearFlash();
      button.textContent = message;
      this.#flashTimer = setTimeout(() => {
        this.#flashTimer = undefined;
        button.textContent = label;
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
