/**
 * The conversation, against a scripted controller in this same process.
 *
 * The transport takes a `fetch`, so the thing answering is a function here — the same code path a
 * page takes when the controller runs in the browser.
 */

import { assert, assertEquals, assertMatch } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

import { encodeEvent, EVENT_STREAM_CONTENT_TYPE } from "./protocol.ts";
import type { AgentEvent, ChatRequest } from "./protocol.ts";
import { ChatSession, unansweredCalls } from "./session.ts";
import type { ClientTool } from "./session.ts";

const ENDPOINT = "http://localhost/chat";

/** A session whose controller answers each request with what `script` says. */
function sessionOver(
  script: (request: ChatRequest) => AgentEvent[],
  tools: readonly ClientTool[] = [],
): ChatSession {
  return new ChatSession({
    tools,
    transport: {
      url: ENDPOINT,
      fetch: async (request) => {
        const events = script(await request.json());
        return new Response(events.map(encodeEvent).join(""), {
          headers: { "content-type": EVENT_STREAM_CONTENT_TYPE },
        });
      },
    },
  });
}

const whereAmI: ClientTool = {
  name: "where_am_i",
  description: "The page the person is looking at",
  inputSchema: { type: "object", properties: {} },
  run: () => "/settings",
};

describe("ChatSession", () => {
  it("holds the conversation and fires change as it arrives", async () => {
    const session = sessionOver(() => [
      { type: "text", text: "Two " },
      { type: "text", text: "words." },
      { type: "done", reason: "end" },
    ]);
    let changes = 0;
    session.addEventListener("change", () => changes++);

    await session.send("hello");

    assertEquals(session.messages, [
      { role: "user", content: "hello" },
      { role: "assistant", content: "Two words." },
    ]);
    assertEquals(session.status, "idle");
    assertEquals(session.error, null);
    assert(changes > 2);
  });

  it("runs this page's tools and answers the same turn with their results", async () => {
    const session = sessionOver(
      ({ messages, tools }) => {
        assertEquals(tools?.map((tool) => tool.name), ["where_am_i"]);
        return messages.at(-1)?.role === "tool"
          ? [{ type: "text", text: "Settings." }, {
            type: "done",
            reason: "end",
          }]
          : [
            {
              type: "tool-call",
              call: { id: "a", name: "where_am_i", input: {} },
            },
            { type: "done", reason: "tools" },
          ];
      },
      [whereAmI],
    );

    await session.send("where am I?");

    assertEquals(session.messages, [
      { role: "user", content: "where am I?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "a", name: "where_am_i", input: {} }],
      },
      { role: "tool", results: [{ id: "a", content: "/settings" }] },
      { role: "assistant", content: "Settings." },
    ]);
  });

  it("reports a tool this page does not have rather than stalling", async () => {
    const session = sessionOver(({ messages }) =>
      messages.at(-1)?.role === "tool"
        ? [{ type: "text", text: "Oh." }, { type: "done", reason: "end" }]
        : [
          { type: "tool-call", call: { id: "a", name: "fly", input: {} } },
          { type: "done", reason: "tools" },
        ]
    );

    await session.send("fly");

    assertEquals(session.messages[2], {
      role: "tool",
      results: [{
        id: "a",
        content: "This page has no fly tool",
        isError: true,
      }],
    });
  });

  it("keeps the agent state alongside the message it belongs to", async () => {
    const session = sessionOver(() => [
      { type: "text", text: "hi" },
      { type: "state", state: "[]" },
      { type: "done", reason: "end" },
    ]);
    await session.send("hello");

    assertEquals(session.messages.at(-1), {
      role: "assistant",
      content: "hi",
      state: "[]",
    });
  });

  it("reports a failure without losing what had already arrived", async () => {
    const session = sessionOver(() => [
      { type: "text", text: "as far as " },
      { type: "error", message: "the model is down" },
    ]);
    await session.send("hello");

    assertEquals(session.status, "error");
    assertEquals(session.error, "the model is down");
    assertEquals(session.messages.at(-1), {
      role: "assistant",
      content: "as far as ",
    });
  });

  it("reports a controller that refuses the turn", async () => {
    const session = new ChatSession({
      transport: {
        url: ENDPOINT,
        fetch: () => Promise.resolve(new Response("Sign in", { status: 401 })),
      },
    });
    await session.send("hello");

    assertEquals(session.status, "error");
    assertMatch(session.error ?? "", /401/);
  });

  it("stops bouncing between the model and the page", async () => {
    let id = 0;
    const session = sessionOver(() => [
      {
        type: "tool-call",
        call: { id: `c${id++}`, name: "where_am_i", input: {} },
      },
      { type: "done", reason: "tools" },
    ], [whereAmI]);
    await session.send("loop");

    assertEquals(session.status, "error");
    assertMatch(session.error ?? "", /over/);
  });

  it("empties on reset", async () => {
    const session = sessionOver(() => [
      { type: "text", text: "hi" },
      { type: "done", reason: "end" },
    ]);
    await session.send("hello");
    session.reset();

    assertEquals(session.messages, []);
    assertEquals(session.status, "idle");
  });
});

describe("unansweredCalls", () => {
  it("finds the calls behind the results that were answered", () => {
    const pending = unansweredCalls([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "a", name: "mine", input: {} },
          { id: "b", name: "yours", input: {} },
        ],
      },
      { role: "tool", results: [{ id: "a", content: "done" }] },
    ]);

    assertEquals(pending, [{ id: "b", name: "yours", input: {} }]);
  });
});
