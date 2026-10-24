import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { decodeEvents, encodeEvent } from "./protocol.ts";
import type { AgentEvent } from "./protocol.ts";

/** A body that hands out exactly the chunks given, to put frame boundaries where they hurt. */
function bodyOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: readonly string[]): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of decodeEvents(bodyOf(chunks))) events.push(event);
  return events;
}

describe("the event stream", () => {
  const events: AgentEvent[] = [
    { type: "text", text: "Hello " },
    { type: "tool-call", call: { id: "a", name: "where_am_i", input: {} } },
    { type: "tool-result", result: { id: "a", content: "/settings" } },
    { type: "state", state: "[]" },
    { type: "done", reason: "end" },
  ];

  it("round trips every event", async () => {
    assertEquals(await collect(events.map(encodeEvent)), events);
  });

  it("reassembles frames split across chunks", async () => {
    const wire = events.map(encodeEvent).join("");
    const chunks = [];
    for (let at = 0; at < wire.length; at += 7) {
      chunks.push(wire.slice(at, at + 7));
    }

    assertEquals(await collect(chunks), events);
  });

  it("drops a trailing partial frame rather than half-parsing it", async () => {
    const wire = encodeEvent(events[0]) + 'data: {"type":"te';

    assertEquals(await collect([wire]), [events[0]]);
  });

  it("ignores comment and field lines a proxy may add", async () => {
    const wire = `: keep-alive\n\n${encodeEvent(events[0])}event: message\n${
      encodeEvent(events[4]).trimEnd()
    }\n\n`;

    assertEquals(await collect([wire]), [events[0], events[4]]);
  });
});
