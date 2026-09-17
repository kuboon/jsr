/**
 * `<share-dialog>`: a native `<dialog>`-based share sheet.
 *
 * Feed it a URL (and an explanatory message, shown only inside the dialog — never passed to a
 * share target) and call `.open()`. It lines up X, LINE, and Threads share buttons, plus either a
 * native share-sheet button (where `navigator.share` exists) or a "copy URL" fallback.
 *
 * Rendered in light DOM with plain, low-specificity (`:where()`) default styles under
 * `.share-dialog__*` classes, so a page's own stylesheet can restyle any part of it by simply
 * writing a same-or-higher-specificity rule for that class — no shadow DOM to pierce.
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
  close?: string;
};

const DEFAULT_LABELS: Required<ShareDialogLabels> = {
  x: "X",
  line: "LINE",
  threads: "Threads",
  share: "Share",
  copy: "Copy URL",
  copied: "Copied!",
  close: "Close",
};

/** Options for {@link ShareDialogElement.open}. */
export type ShareDialogOpenOptions = {
  /** The URL every button shares. Falls back to the `url` attribute, then the last value used. */
  url?: string;
  /** Explanatory text shown inside the dialog only. Falls back to the `text` attribute. */
  text?: string;
};

const STYLE_ID = "share-dialog-default-style";

const DEFAULT_STYLE = `
:where(.share-dialog) {
  padding: 1.5rem;
  border: 1px solid #d0d0d0;
  border-radius: 12px;
  max-width: 22rem;
  font: inherit;
}
:where(.share-dialog)::backdrop { background: rgb(0 0 0 / 0.4); }
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
`;

function ensureDefaultStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = DEFAULT_STYLE;
  document.head.append(style);
}

/**
 * A share sheet: the element's own API on top of `HTMLElement`.
 *
 * This is a type, not a class, because the class behind it cannot exist until there is an
 * `HTMLElement` to extend — see {@link defineShareDialog}. Reach for `instanceof` through
 * `customElements.get(DEFAULT_TAG_NAME)` if you need it.
 */
export interface ShareDialogElement extends HTMLElement {
  /** The underlying `<dialog>`, for anything this element doesn't expose directly. */
  readonly dialog: HTMLDialogElement;
  /** The button/close-action labels currently in effect. */
  labels: ShareDialogLabels;
  /** Sets the shared URL and the dialog's text, then opens it. */
  open(options?: ShareDialogOpenOptions): void;
  close(): void;
}

/** Built once, on the first {@link defineShareDialog} call in a DOM. */
let elementClass: (new () => ShareDialogElement) | undefined;

function buildElementClass(): new () => ShareDialogElement {
  if (elementClass !== undefined) return elementClass;

  elementClass = class extends HTMLElement implements ShareDialogElement {
    #dialog: HTMLDialogElement;
    #textEl: HTMLParagraphElement;
    #actions: HTMLDivElement;
    #closeButton: HTMLButtonElement;
    #labels: Required<ShareDialogLabels> = { ...DEFAULT_LABELS };
    #url = "";

    constructor() {
      super();
      ensureDefaultStyle();

      this.#dialog = document.createElement("dialog");
      this.#dialog.className = "share-dialog";
      // A click landing on the dialog element itself (not its content) is a backdrop click,
      // since ::backdrop isn't a real event target.
      this.#dialog.addEventListener("click", (event) => {
        if (event.target === this.#dialog) this.#dialog.close();
      });

      this.#textEl = document.createElement("p");
      this.#textEl.className = "share-dialog__text";

      this.#actions = document.createElement("div");
      this.#actions.className = "share-dialog__actions";

      this.#closeButton = document.createElement("button");
      this.#closeButton.type = "button";
      this.#closeButton.className = "share-dialog__close";
      this.#closeButton.addEventListener("click", () => this.#dialog.close());

      this.#dialog.append(this.#textEl, this.#actions, this.#closeButton);
      this.append(this.#dialog);
    }

    connectedCallback(): void {
      this.#renderActions();
    }

    get dialog(): HTMLDialogElement {
      return this.#dialog;
    }

    get labels(): Required<ShareDialogLabels> {
      return { ...this.#labels };
    }

    set labels(value: ShareDialogLabels) {
      this.#labels = { ...this.#labels, ...value };
      this.#renderActions();
    }

    open(options: ShareDialogOpenOptions = {}): void {
      this.#url = options.url ?? this.getAttribute("url") ?? this.#url;
      this.#textEl.textContent = options.text ?? this.getAttribute("text") ??
        "";
      this.#renderActions();
      this.#dialog.showModal();
    }

    close(): void {
      this.#dialog.close();
    }

    #renderActions(): void {
      this.#actions.replaceChildren(
        this.#linkButton("x", this.#labels.x, xShareUrl(this.#url)),
        this.#linkButton("line", this.#labels.line, lineShareUrl(this.#url)),
        this.#linkButton(
          "threads",
          this.#labels.threads,
          threadsShareUrl(this.#url),
        ),
        this.#shareOrCopyButton(),
      );
      this.#closeButton.textContent = this.#labels.close;
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
        button.className = "share-dialog__button share-dialog__button--share";
        button.textContent = this.#labels.share;
        button.addEventListener("click", () => {
          navigator.share({ url: this.#url }).catch(() => {
            // The user cancelled the share sheet, or the platform refused it — nothing to recover.
          });
        });
      } else {
        button.className = "share-dialog__button share-dialog__button--copy";
        button.textContent = this.#labels.copy;
        button.addEventListener("click", () => void this.#copyUrl(button));
      }
      return button;
    }

    async #copyUrl(button: HTMLButtonElement): Promise<void> {
      try {
        await navigator.clipboard.writeText(this.#url);
        const original = this.#labels.copy;
        button.textContent = this.#labels.copied;
        setTimeout(() => {
          button.textContent = original;
        }, 1500);
      } catch {
        // Clipboard access denied or unavailable in this context — nothing more we can do.
      }
    }
  };

  return elementClass;
}

/**
 * Registers the custom element, if there is a DOM to register it in.
 *
 * Importing this module already calls this once, so most apps never need it; it is here for the
 * app that wants the dialog under a second tag name, and it is what makes the import itself safe
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
 * Append it before calling `.open()`: a `<dialog>` that is not connected to the document cannot
 * be shown modally.
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
