/// <reference lib="dom" />

import { openChat } from "@kuboon/chat-element";
import type { ChatDialog } from "@kuboon/chat-element";
import {
  encodeEvent,
  EVENT_STREAM_CONTENT_TYPE,
} from "@kuboon/chat-element/protocol";
import type { AgentEvent, ChatRequest } from "@kuboon/chat-element/protocol";

/**
 * A scripted controller, answered in the page: there is no server behind GitHub Pages, and the
 * transport takes a `fetch`, so the chat, the stream and the tool round trip are all real.
 */
function scriptedFetch(): (request: Request) => Promise<Response> {
  let id = 0;
  return async (request) => {
    const { messages } = (await request.json()) as ChatRequest;
    const last = messages.at(-1);
    let events: AgentEvent[];

    if (last?.role === "tool") {
      const result = last.results[0];
      events = result.isError
        ? words(`That did not work: ${result.content}`)
        : words(
          `You pointed at ${result.content} — only its path reached me, not its contents.`,
        );
    } else if (
      last?.role === "user" && /pick|which|どれ|指/i.test(last.content)
    ) {
      events = [
        ...words("Click the element you mean on the page (Esc to cancel)."),
        {
          type: "tool-call",
          call: { id: `demo-${id++}`, name: "pick_element", input: {} },
        },
        { type: "done", reason: "tools" },
      ];
      return stream(events);
    } else {
      const content = last?.role === "user" ? last.content : "";
      events = words(
        `You said: ${content}\n\nAsk "which one?" and I will ask you to point at it — or use the ⌖ button yourself.`,
      );
    }

    return stream([...events, { type: "done", reason: "end" }]);
  };
}

function words(text: string): AgentEvent[] {
  return text.split(/(?<= )/).map((word) => ({ type: "text", text: word }));
}

function stream(events: AgentEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(encodeEvent(event)));
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "content-type": EVENT_STREAM_CONTENT_TYPE },
  });
}

export function setupChatDemo(): void {
  const button = document.getElementById("chat-open") as HTMLButtonElement;
  let chat: ChatDialog | null = null;

  button.addEventListener("click", () => {
    if (chat === null) {
      chat = openChat({
        transport: { url: "/chat", fetch: scriptedFetch() },
        pickElementTool: true,
        greeting:
          'Try "which one?", or press ⌖ and click something on the page.',
      });
      return;
    }
    if (chat.open) chat.close();
    else chat.show();
  });
}
