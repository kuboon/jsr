/**
 * `<chat-panel>`: a chat over one {@link ChatSession}.
 *
 * The element is a render function and nothing more. It listens to the session's `change` event,
 * draws the transcript the session exposes, and calls `send` — all of the conversation's behaviour
 * is in `session.ts`, so an app that wants a chat of its own shape takes the session and leaves
 * this behind.
 *
 * Beside the composer is a button that lets the person point at something on the page instead of
 * describing it: the page is outlined under the pointer, the click picks rather than presses, and
 * the element's CSS path lands in the composer where they can see it and edit it before sending.
 * The path is all that goes in — see `picker.ts`.
 *
 * Rendered in light DOM with default styles under single `.chat-panel__*` classes, and colored
 * from custom properties on the element — `--chat-panel-bg`, `-fg`, `-muted`, `-border`,
 * `-accent`, `-on-accent`, `-radius` — so a page restyles it with its own stylesheet, no shadow
 * DOM to pierce. One class each rather than `:where()`, because the panel is dropped into pages
 * that style `button`, `textarea` and `header` globally, and a page's bare tag rules should not
 * reach into it; a page that means to restyle a part writes a rule for that part's class.
 *
 * Importing this module registers the element wherever there is a DOM and does nothing anywhere
 * else, so a module that is also evaluated on a server can import it at the top.
 *
 * @module
 */

import type { ChatMessage, ToolCall, ToolResult } from "./protocol.ts";
import type { ChatSession } from "./session.ts";
import { elementPath, pickElement } from "./picker.ts";

/** The tag {@link defineChatPanel} registers unless it is given another one. */
export const DEFAULT_TAG_NAME = "chat-panel";

/** What the panel's controls are called. All optional; unset fields keep their language's. */
export type ChatPanelLabels = {
  /** The heading, when the `heading` attribute does not give one. */
  heading?: string;
  /** The composer's placeholder, when the `placeholder` attribute does not give one. */
  placeholder?: string;
  send?: string;
  stop?: string;
  close?: string;
  /** The button that lets the person point at an element on the page. */
  pick?: string;
};

/**
 * What the controls are called, by language — the page's `lang`, or the element's own.
 *
 * Adding a key registers a language: `CHAT_PANEL_LABELS.fr = { … }` before the panel is built.
 */
export const CHAT_PANEL_LABELS: Record<string, Required<ChatPanelLabels>> = {
  en: {
    heading: "Help",
    placeholder: "Ask about this page…",
    send: "Send",
    stop: "Stop",
    close: "Close",
    pick: "Point at something on the page",
  },
  ja: {
    heading: "ヘルプ",
    placeholder: "このページについて質問…",
    send: "送信",
    stop: "停止",
    close: "閉じる",
    pick: "画面の要素を指して伝える",
  },
};

/**
 * The names for a language tag, falling back to English.
 *
 * @param lang A BCP 47 tag, such as `ja-JP`. Only the language part is read.
 * @returns The names for it
 */
export function chatPanelLabels(lang: string): Required<ChatPanelLabels> {
  const language = lang.split("-")[0].toLowerCase();
  return CHAT_PANEL_LABELS[language] ?? CHAT_PANEL_LABELS.en;
}

/**
 * Draws one of the assistant's replies — for a model that answers in Markdown, say. The default
 * is {@link linkifyReply}.
 *
 * Given the reply's text, it returns what goes in the bubble: a node (a fragment for several),
 * or a promise of one. While a promise is pending the bubble shows what it showed before, so a
 * streaming reply does not flash back to plain text on every piece; the first draw, and a
 * renderer that throws or rejects, show {@link linkifyReply}'s.
 *
 * It is called again whenever the reply changes, which while it streams is on every piece. What
 * it returns goes into the page as it is: a renderer of text a model wrote must sanitise it.
 */
export type ReplyRenderer = (content: string) => Node | Promise<Node>;

/**
 * The default {@link ReplyRenderer}: the text as it is, line breaks kept, with its `http(s)` URLs
 * linked.
 *
 * Only `http:` and `https:` match, which is what makes this safe to run over text a model wrote:
 * a `javascript:` URL is not a URL here, it is a word. Trailing punctuation is left out of the
 * href, because a URL at the end of a sentence is followed by the sentence's full stop.
 */
export function linkifyReply(content: string): Node {
  const span = el("span", "chat-panel__text");
  let at = 0;

  for (const match of content.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const href = match[0].replace(/[.,;:!?)\]}'"]+$/, "");
    const start = match.index;
    if (start > at) span.append(content.slice(at, start));
    const anchor = el("a", "chat-panel__link");
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = href;
    span.append(anchor);
    at = start + href.length;
  }

  if (at < content.length) span.append(content.slice(at));
  return span;
}

/**
 * A chat panel: the element's own API on top of `HTMLElement`.
 *
 * A type rather than a class, because the class cannot exist until there is an `HTMLElement` to
 * extend — see {@link defineChatPanel}.
 *
 * Fires a non-bubbling `close` event when the person presses the close button, which is drawn only
 * when the `closable` attribute is set.
 */
export interface ChatPanelElement extends HTMLElement {
  /** The conversation to show. Until there is one, the composer is disabled. */
  session: ChatSession | null;
  /** The heading, reflected to the `heading` attribute. */
  heading: string;
  /** What it says before the person has typed anything, reflected to `greeting`. */
  greeting: string;
  /** The composer's placeholder, reflected to `placeholder`. */
  placeholder: string;
  /** Whether a close button is drawn, reflected to `closable`. */
  closable: boolean;
  /** Whether the point-at-the-page button is drawn. On unless the `no-picker` attribute is set. */
  picker: boolean;
  /** What the controls are called, overriding the names the language would give them. */
  labels: ChatPanelLabels;
  /**
   * Draws the assistant's replies; {@link linkifyReply} unless set. Set it before the
   * conversation starts: replies already drawn are not drawn again.
   */
  renderReply: ReplyRenderer;
}

/** Built once, on the first {@link defineChatPanel} call in a DOM. */
let elementClass: (new () => ChatPanelElement) | undefined;

function buildElementClass(): new () => ChatPanelElement {
  if (elementClass !== undefined) return elementClass;

  elementClass = class extends HTMLElement implements ChatPanelElement {
    #session: ChatSession | null = null;
    #overrides: ChatPanelLabels = {};
    renderReply: ReplyRenderer = linkifyReply;
    #built = false;
    #listening: AbortController | null = null;

    #heading!: HTMLHeadingElement;
    #closeButton!: HTMLButtonElement;
    #log!: HTMLOListElement;
    #rows: { key: string; node: HTMLElement }[] = [];
    #composer!: HTMLTextAreaElement;
    #pickButton!: HTMLButtonElement;
    #sendButton!: HTMLButtonElement;
    #picking = false;

    static get observedAttributes(): string[] {
      return [
        "heading",
        "greeting",
        "placeholder",
        "closable",
        "no-picker",
        "lang",
      ];
    }

    attributeChangedCallback(): void {
      this.#render();
    }

    connectedCallback(): void {
      this.#build();
      this.#listen();
      this.#render();
    }

    disconnectedCallback(): void {
      this.#listening?.abort();
      this.#listening = null;
    }

    get session(): ChatSession | null {
      return this.#session;
    }

    set session(value: ChatSession | null) {
      if (value === this.#session) return;
      this.#session = value;
      this.#rows = [];
      this.#log?.replaceChildren();
      if (this.isConnected) this.#listen();
      this.#render();
    }

    get heading(): string {
      return this.getAttribute("heading") ?? "";
    }
    set heading(value: string) {
      this.setAttribute("heading", value);
    }

    get greeting(): string {
      return this.getAttribute("greeting") ?? "";
    }
    set greeting(value: string) {
      this.setAttribute("greeting", value);
    }

    get placeholder(): string {
      return this.getAttribute("placeholder") ?? "";
    }
    set placeholder(value: string) {
      this.setAttribute("placeholder", value);
    }

    get closable(): boolean {
      return this.hasAttribute("closable");
    }
    set closable(value: boolean) {
      this.toggleAttribute("closable", value);
    }

    get picker(): boolean {
      return !this.hasAttribute("no-picker");
    }
    set picker(value: boolean) {
      this.toggleAttribute("no-picker", !value);
    }

    get labels(): Required<ChatPanelLabels> {
      return this.#names();
    }
    set labels(value: ChatPanelLabels) {
      this.#overrides = { ...this.#overrides, ...value };
      this.#render();
    }

    #names(): Required<ChatPanelLabels> {
      const lang = this.closest("[lang]")?.getAttribute("lang") ??
        document.documentElement.lang;
      return { ...chatPanelLabels(lang), ...this.#overrides };
    }

    /**
     * Builds the frame, once, on first insertion — a custom element constructor may not add
     * children to itself, and one made by `document.createElement()` that tries never upgrades.
     */
    #build(): void {
      if (this.#built) return;
      this.#built = true;
      ensureDefaultStyle();
      this.classList.add("chat-panel");

      const header = el("div", "chat-panel__header");
      this.#heading = el("h2", "chat-panel__heading");
      this.#closeButton = button("chat-panel__icon-button", "✕");
      this.#closeButton.addEventListener(
        "click",
        () => this.dispatchEvent(new Event("close")),
      );
      header.append(this.#heading, this.#closeButton);

      this.#log = el("ol", "chat-panel__log");
      this.#log.setAttribute("aria-live", "polite");

      const form = el("form", "chat-panel__composer");
      this.#composer = el("textarea", "chat-panel__input");
      this.#composer.rows = 2;
      // Enter sends and Shift+Enter breaks the line, which is what every chat does and what a
      // `<textarea>` does the other way round by default.
      this.#composer.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
          return;
        }
        event.preventDefault();
        this.#submit();
      });

      this.#pickButton = button("chat-panel__icon-button", "⌖");
      this.#pickButton.addEventListener("click", () => this.#pick());

      this.#sendButton = button("chat-panel__send", "");
      // While a turn runs this is a `type="button"` Stop; otherwise it submits the form.
      this.#sendButton.addEventListener("click", () => {
        if (this.#session?.busy) this.#session.stop();
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.#submit();
      });
      form.append(this.#composer, this.#pickButton, this.#sendButton);

      this.replaceChildren(header, this.#log, form);
    }

    #listen(): void {
      this.#listening?.abort();
      this.#listening = null;
      if (this.#session === null) return;
      this.#listening = new AbortController();
      this.#session.addEventListener("change", () => this.#render(), {
        signal: this.#listening.signal,
      });
    }

    #submit(): void {
      if (this.#session === null || this.#session.busy) return;
      const text = this.#composer.value;
      if (text.trim() === "") return;
      this.#composer.value = "";
      this.#session.send(text);
    }

    /**
     * Lets the person point at an element, and puts its path in the composer.
     *
     * A modal dialog makes everything outside it inert, so a panel shown modally steps out of the
     * way for the pick and comes back afterwards.
     */
    async #pick(): Promise<void> {
      if (this.#picking) return;
      this.#picking = true;
      this.#render();

      const dialog = this.closest("dialog");
      const modal = dialog?.matches(":modal") ?? false;
      if (modal) dialog!.close();

      try {
        const element = await pickElement({ ignore: [dialog ?? this] });
        if (element !== null) this.#insert(`\`${elementPath(element)}\``);
      } finally {
        if (modal) dialog!.showModal();
        this.#picking = false;
        this.#render();
        this.#composer.focus();
      }
    }

    /** Puts text at the composer's cursor, with a space either side where it needs one. */
    #insert(text: string): void {
      const input = this.#composer;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      const before = input.value.slice(0, start);
      const after = input.value.slice(end);
      const lead = before === "" || /\s$/.test(before) ? "" : " ";
      const trail = /^\s/.test(after) ? "" : " ";
      input.value = before + lead + text + trail + after;
      const caret = (before + lead + text + trail).length;
      input.setSelectionRange(caret, caret);
    }

    #render(): void {
      if (!this.#built) return;
      const names = this.#names();
      const session = this.#session;
      const busy = session?.busy ?? false;

      const heading = this.heading || names.heading;
      this.#heading.textContent = heading;
      this.setAttribute("aria-label", heading);

      setIconButton(this.#closeButton, names.close);
      this.#closeButton.hidden = !this.closable;

      setIconButton(this.#pickButton, names.pick);
      this.#pickButton.hidden = !this.picker;
      this.#pickButton.disabled = session === null || this.#picking;
      this.#pickButton.toggleAttribute("aria-pressed", this.#picking);

      const placeholder = this.placeholder || names.placeholder;
      this.#composer.placeholder = placeholder;
      this.#composer.setAttribute("aria-label", placeholder);
      this.#composer.disabled = session === null;

      this.#sendButton.textContent = busy ? names.stop : names.send;
      this.#sendButton.type = busy ? "button" : "submit";
      this.#sendButton.disabled = session === null;

      this.#log.setAttribute("aria-busy", busy ? "true" : "false");
      this.#renderLog(session);
    }

    /**
     * Brings the log in line with the transcript, touching only the rows that changed.
     *
     * A streamed reply changes on every word, and rebuilding every row for each one would drop
     * the person's text selection and scroll position mid-read. Rows are compared by what they
     * show, so all that is redrawn is the bubble that is growing.
     */
    #renderLog(session: ChatSession | null): void {
      const rows = session === null ? [] : logRows(session, this.greeting);
      const atBottom =
        this.#log.scrollHeight - this.#log.scrollTop - this.#log.clientHeight <
          32;

      rows.forEach((row, index) => {
        const existing = this.#rows[index];
        if (existing?.key === row.key) return;
        const node = row.draw(existing?.node, this.renderReply);
        if (existing === undefined) this.#log.append(node);
        else existing.node.replaceWith(node);
        this.#rows[index] = { key: row.key, node };
      });
      for (const stale of this.#rows.splice(rows.length)) stale.node.remove();

      if (atBottom) this.#log.scrollTop = this.#log.scrollHeight;
    }
  };

  return elementClass;
}

/** One line of the log: what it shows, as a key, and how to draw it in place of `previous`. */
interface Row {
  key: string;
  draw: (
    previous: HTMLElement | undefined,
    renderReply: ReplyRenderer,
  ) => HTMLElement;
}

function logRows(session: ChatSession, greeting: string): Row[] {
  const messages = session.messages;
  const results = resultsById(messages);
  const rows: Row[] = [];

  if (greeting !== "" && messages.length === 0) {
    rows.push(bubbleRow("assistant", greeting));
  }

  for (const message of messages) {
    if (message.role === "user") rows.push(bubbleRow("user", message.content));
    if (message.role !== "assistant") continue;
    if (message.content !== "") {
      rows.push(bubbleRow("assistant", message.content));
    }
    for (const call of message.toolCalls ?? []) {
      rows.push(toolRow(call, results.get(call.id)));
    }
  }

  if (session.status === "streaming" && !hasFreshText(messages)) {
    rows.push({
      key: "notice",
      draw: () => text(el("li", "chat-panel__notice"), "…"),
    });
  }

  if (session.error !== null) {
    const error = session.error;
    rows.push({
      key: `error:${error}`,
      draw: () => text(el("li", "chat-panel__error"), error),
    });
  }

  return rows;
}

function bubbleRow(role: "user" | "assistant", content: string): Row {
  return {
    key: `${role}:${content}`,
    draw: (previous, renderReply) => {
      const li = el("li", `chat-panel__bubble chat-panel__bubble--${role}`);
      if (role === "user") {
        li.append(text(el("span", "chat-panel__text"), content));
      } else drawReply(li, content, renderReply, previous);
      return li;
    },
  };
}

/** A reply through the renderer — see {@link ReplyRenderer}. */
function drawReply(
  li: HTMLLIElement,
  content: string,
  renderReply: ReplyRenderer,
  previous: HTMLElement | undefined,
): void {
  const plain = () => li.replaceChildren(linkifyReply(content));
  let result: Node | Promise<Node>;
  try {
    result = renderReply(content);
  } catch {
    plain();
    return;
  }
  if (!(result instanceof Promise)) {
    li.append(result);
    return;
  }
  // Until it resolves: the reply as it was drawn a piece ago, while it streams in.
  if (previous?.classList.contains("chat-panel__bubble--assistant")) {
    li.append(...Array.from(previous.childNodes, (n) => n.cloneNode(true)));
  } else {
    plain();
  }
  result.then((node) => li.replaceChildren(node), plain);
}

function toolRow(call: ToolCall, result: ToolResult | undefined): Row {
  const mark = result === undefined ? "⋯" : result.isError ? "✕" : "✓";
  return {
    key: `tool:${call.id}:${mark}:${result?.isError ? result.content : ""}`,
    draw: () => {
      const li = el("li", "chat-panel__tool");
      const icon = text(el("span"), mark);
      icon.setAttribute("aria-hidden", "true");
      li.append(icon, " ", text(el("code"), call.name));
      if (result?.isError) {
        li.append(
          " ",
          text(el("span", "chat-panel__tool-error"), result.content),
        );
      }
      return li;
    },
  };
}

function resultsById(
  messages: readonly ChatMessage[],
): ReadonlyMap<string, ToolResult> {
  const byId = new Map<string, ToolResult>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const result of message.results) byId.set(result.id, result);
  }
  return byId;
}

/** Whether the turn arriving has said anything yet — if not, the waiting mark is shown. */
function hasFreshText(messages: readonly ChatMessage[]): boolean {
  const last = messages.at(-1);
  return last?.role === "assistant" && last.content !== "";
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== undefined) element.className = className;
  return element;
}

function text<T extends HTMLElement>(element: T, content: string): T {
  element.textContent = content;
  return element;
}

function button(className: string, content: string): HTMLButtonElement {
  const element = text(el("button", className), content);
  element.type = "button";
  return element;
}

function setIconButton(element: HTMLButtonElement, label: string): void {
  element.setAttribute("aria-label", label);
  element.title = label;
}

const STYLE_ID = "chat-panel-default-style";

/**
 * The defaults. Each custom property is read with its fallback rather than declared on the panel,
 * so a page that sets `--chat-panel-accent` on `:root`, or on the element around the panel, reaches
 * it — a declaration here would sit closer and win.
 */
const DEFAULT_STYLE = `
.chat-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  font: inherit;
  color: var(--chat-panel-fg, CanvasText);
  background: var(--chat-panel-bg, Canvas);
}
.chat-panel__header {
  display: flex;
  margin: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--chat-panel-border, color-mix(in srgb, CanvasText 20%, Canvas));
}
.chat-panel__heading { font: inherit; font-weight: 600; margin: 0; }
.chat-panel__icon-button {
  font: inherit;
  line-height: 1;
  cursor: pointer;
  padding: 0.5rem;
  border: 0;
  border-radius: var(--chat-panel-radius, 0.75rem);
  background: transparent;
  color: var(--chat-panel-muted, color-mix(in srgb, CanvasText 55%, Canvas));
}
.chat-panel__icon-button:hover, .chat-panel__icon-button[aria-pressed] {
  color: var(--chat-panel-fg, CanvasText);
}
.chat-panel__icon-button[hidden] { display: none; }
.chat-panel__log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 1rem;
}
.chat-panel__bubble {
  max-width: 85%;
  padding: 0.5rem 0.75rem;
  border-radius: var(--chat-panel-radius, 0.75rem);
  overflow-wrap: anywhere;
}
.chat-panel__bubble--user {
  align-self: flex-end;
  background: var(--chat-panel-accent, AccentColor);
  color: var(--chat-panel-on-accent, AccentColorText);
}
.chat-panel__bubble--assistant {
  align-self: flex-start;
  border: 1px solid var(--chat-panel-border, color-mix(in srgb, CanvasText 20%, Canvas));
}
.chat-panel__bubble > :first-child { margin-top: 0; }
.chat-panel__bubble > :last-child { margin-bottom: 0; }
.chat-panel__text { white-space: pre-wrap; }
.chat-panel__link { color: inherit; overflow-wrap: anywhere; }
.chat-panel__tool {
  align-self: flex-start;
  font-size: 0.85em;
  color: var(--chat-panel-muted, color-mix(in srgb, CanvasText 55%, Canvas));
}
.chat-panel__tool-error { color: color-mix(in srgb, red 60%, CanvasText); }
.chat-panel__notice { align-self: flex-start; color: var(--chat-panel-muted, color-mix(in srgb, CanvasText 55%, Canvas)); }
.chat-panel__error {
  align-self: stretch;
  font-size: 0.9em;
  padding: 0.5rem 0.75rem;
  border-radius: var(--chat-panel-radius, 0.75rem);
  border: 1px solid color-mix(in srgb, red 40%, transparent);
  color: color-mix(in srgb, red 60%, CanvasText);
}
.chat-panel__composer {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--chat-panel-border, color-mix(in srgb, CanvasText 20%, Canvas));
}
.chat-panel__input {
  flex: 1;
  width: auto;
  height: auto;
  min-height: 0;
  margin: 0;
  font: inherit;
  resize: none;
  color: inherit;
  background: transparent;
  padding: 0.5rem;
  border: 1px solid var(--chat-panel-border, color-mix(in srgb, CanvasText 20%, Canvas));
  border-radius: var(--chat-panel-radius, 0.75rem);
}
.chat-panel__send {
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: var(--chat-panel-radius, 0.75rem);
  background: var(--chat-panel-accent, AccentColor);
  color: var(--chat-panel-on-accent, AccentColorText);
}
.chat-panel__send:disabled, .chat-panel__icon-button:disabled {
  cursor: default;
  opacity: 0.5;
}
`;

function ensureDefaultStyle(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = DEFAULT_STYLE;
  document.head.append(style);
}

/**
 * Registers the element, once.
 *
 * Called on import, so a page only needs this to pick another tag name.
 *
 * @param tagName The tag to register it under
 * @returns `false` where there is no DOM to register in, `true` otherwise
 */
export function defineChatPanel(tagName: string = DEFAULT_TAG_NAME): boolean {
  if (typeof HTMLElement === "undefined" || !globalThis.customElements) {
    return false;
  }
  if (customElements.get(tagName) === undefined) {
    // A subclass per extra tag: one constructor cannot be registered under two names.
    const base = buildElementClass();
    customElements.define(
      tagName,
      tagName === DEFAULT_TAG_NAME ? base : class extends base {},
    );
  }
  return true;
}

/**
 * Makes a panel from script.
 *
 * @param session The conversation to show
 * @returns The element, not yet in the document
 */
export function createChatPanel(
  session: ChatSession | null = null,
): ChatPanelElement {
  if (!defineChatPanel()) {
    throw new Error("createChatPanel needs a DOM");
  }
  const element = document.createElement(DEFAULT_TAG_NAME) as ChatPanelElement;
  element.session = session;
  return element;
}

defineChatPanel();
