/**
 * Putting the panel on the screen, for the host that just wants a button.
 *
 * Opening the chat is the host page's job — where the button goes, what it looks like, whether it
 * is in the header or floating in a corner. What this can usefully do is the part after the
 * click, which is the same everywhere: a `<dialog>` in the top layer, a `<chat-panel>` in it, and a
 * handle to open and close it again.
 *
 * Non-modal by default, deliberately. A chat explaining how to use a screen is a chat the person
 * has to be able to use the screen alongside — and point at it; `showModal()` puts an inert
 * backdrop over the very thing being explained. Pass `modal` when the chat *is* the task.
 *
 * Call it once and keep the handle. The conversation lives in the session behind it, so a second
 * call is a second conversation.
 *
 * @module
 */

import { createChatPanel } from "./element.ts";
import type { ChatPanelElement } from "./element.ts";
import { pickElementTool } from "./picker.ts";
import { ChatSession } from "./session.ts";
import type { ChatSessionOptions } from "./session.ts";

/** Options for {@link openChat}. */
export interface OpenChatOptions extends ChatSessionOptions {
  /** The panel's heading. Defaults to the language's word for "Help". */
  title?: string;
  /** What it says before the person has typed anything. */
  greeting?: string;
  /** Placeholder for the composer. */
  placeholder?: string;
  /**
   * An existing conversation to show, instead of starting one.
   *
   * When it is given, the transport and tool options are ignored — the session already has them.
   */
  session?: ChatSession;
  /**
   * Offer the model a `pick_element` tool, so it can ask the person to point at something on the
   * page. Defaults to `false`. The button beside the composer is there either way.
   */
  pickElementTool?: boolean;
  /**
   * Show it modally, over an inert page. Defaults to `false`.
   *
   * Modal buys `Escape` to dismiss and a focus trap, and costs the ability to touch the page the
   * chat is about.
   */
  modal?: boolean;
  /** Where the `<dialog>` goes. Defaults to `document.body`. */
  container?: HTMLElement;
}

/** The panel, once it is on the screen. */
export interface ChatDialog {
  /** The conversation. Keep it across open and close; that is what makes the button a toggle. */
  readonly session: ChatSession;
  /** The element it is drawn in, for a host that wants to position or restyle it. */
  readonly dialog: HTMLDialogElement;
  /** The `<chat-panel>` inside it. */
  readonly panel: ChatPanelElement;
  /** Whether it is showing. */
  readonly open: boolean;
  /** Shows it. */
  show(): void;
  /** Hides it, keeping the conversation. */
  close(): void;
  /** Hides it and removes the element. */
  dispose(): void;
}

/**
 * Opens the chat panel in a `<dialog>`.
 *
 * @param options Where the controller is, what this page can do, and how the panel is framed
 * @returns The handle, for the button to toggle
 *
 * @example
 * ```ts ignore
 * const chat = openChat({ transport: "/helper-agent", pickElementTool: true });
 * button.addEventListener("click", () => chat.open ? chat.close() : chat.show());
 * ```
 */
export function openChat(options: OpenChatOptions): ChatDialog {
  const {
    title,
    greeting,
    placeholder,
    modal = false,
    container = document.body,
  } = options;

  const dialog = document.createElement("dialog");
  dialog.style.cssText = modal ? MODAL_STYLE : PANEL_STYLE;

  const session = options.session ?? new ChatSession({
    ...options,
    tools: options.pickElementTool
      ? [
        ...options.tools ?? [],
        pickElementTool({ ignore: () => [dialog] }),
      ]
      : options.tools,
  });

  const panel = createChatPanel(session);
  panel.closable = true;
  if (title !== undefined) panel.heading = title;
  if (greeting !== undefined) panel.greeting = greeting;
  if (placeholder !== undefined) panel.placeholder = placeholder;

  dialog.append(panel);
  container.append(dialog);

  const handle: ChatDialog = {
    session,
    dialog,
    panel,
    get open() {
      return dialog.open;
    },
    show() {
      if (dialog.open) return;
      if (modal) dialog.showModal();
      else dialog.show();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    dispose() {
      handle.close();
      dialog.remove();
    },
  };

  panel.addEventListener("close", () => handle.close());

  handle.show();
  return handle;
}

/** A corner panel: over the page, but not on top of it. */
const PANEL_STYLE = [
  "position: fixed",
  "inset: auto 1rem 1rem auto",
  "width: min(24rem, calc(100vw - 2rem))",
  "height: min(32rem, calc(100vh - 2rem))",
  "max-width: none",
  "max-height: none",
  "margin: 0",
  "padding: 0",
  "border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas)",
  "border-radius: 0.75rem",
  "box-shadow: 0 1rem 3rem rgb(0 0 0 / 0.2)",
  "overflow: hidden",
].join("; ");

/** The modal variant: centred, with the page inert behind it. */
const MODAL_STYLE = [
  "width: min(36rem, calc(100vw - 2rem))",
  "height: min(40rem, calc(100vh - 2rem))",
  "max-width: none",
  "max-height: none",
  "padding: 0",
  "border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas)",
  "border-radius: 0.75rem",
  "overflow: hidden",
].join("; ");
