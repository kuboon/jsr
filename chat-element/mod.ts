/**
 * A chat panel for any page, as a custom element: `<chat-panel>`.
 *
 * Three layers, each usable without the next:
 *
 * - {@link ChatSession} is the conversation — the transcript, the streamed request, and the tools
 *   this page runs when the model asks. No DOM; it posts to anything that answers a `Request`.
 * - `<chat-panel>` ({@link createChatPanel}) draws one session, with a button that lets the person
 *   point at an element on the page instead of describing it.
 * - {@link openChat} puts a panel in a `<dialog>` and hands back a toggle for the host's own button.
 *
 * {@link pickElement} and {@link elementPath} are the pointing on their own, and
 * {@link pickElementTool} offers it to the model. Only an element's CSS path ever leaves the page —
 * never its contents.
 *
 * The wire format is in `./protocol` — DOM-free, for the server half to import.
 *
 * @example
 * ```ts ignore
 * import { openChat } from "@kuboon/chat-element";
 *
 * const chat = openChat({ transport: "/chat", pickElementTool: true });
 * help.addEventListener("click", () => chat.open ? chat.close() : chat.show());
 * ```
 *
 * @module
 */

export { ChatSession, unansweredCalls } from "./session.ts";
export type {
  ChatSessionOptions,
  ChatStatus,
  ChatTransport,
  ClientTool,
} from "./session.ts";

export {
  CHAT_PANEL_LABELS,
  chatPanelLabels,
  createChatPanel,
  DEFAULT_TAG_NAME,
  defineChatPanel,
  linkifyReply,
} from "./element.ts";
export type {
  ChatPanelElement,
  ChatPanelLabels,
  ReplyRenderer,
} from "./element.ts";

export { openChat } from "./open.ts";
export type { ChatDialog, OpenChatOptions } from "./open.ts";

export { elementPath, pickElement, pickElementTool } from "./picker.ts";
export type { PickElementOptions, PickElementToolOptions } from "./picker.ts";

export type {
  AgentEvent,
  ChatMessage,
  ChatRequest,
  DoneReason,
  ToolCall,
  ToolResult,
  ToolSchema,
} from "./protocol.ts";
