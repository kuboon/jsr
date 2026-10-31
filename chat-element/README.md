# @kuboon/chat-element

A chat panel for any page, as a custom element: `<chat-panel>`. It streams
replies from a controller over `text/event-stream`, runs the tools the page
offers when the model asks for them, and has a ⌖ button that lets the person
**point at an element on the screen instead of describing it**.

Framework-free. The server half is whatever answers the wire format in
`./protocol` —
[`@remix-kbn/helper-agent`](https://jsr.io/@remix-kbn/helper-agent) is one, for
a `remix/fetch-router` app.

## Usage

```ts ignore
import { openChat } from "@kuboon/chat-element";

const chat = openChat({
  transport: "/helper-agent",
  title: "Help",
  greeting: "Ask me how anything here works.",
  pickElementTool: true,
});

help.addEventListener("click", () => chat.open ? chat.close() : chat.show());
```

`openChat` puts the panel in a non-modal `<dialog>` in the corner and returns a
handle. Call it once and keep the handle: the conversation lives in the session
behind it.

For a chat inside your own layout, take the pieces under it:

```ts ignore
import { ChatSession, createChatPanel } from "@kuboon/chat-element";

const session = new ChatSession({ transport: "/helper-agent" });
const panel = createChatPanel(session); // a <chat-panel>
panel.heading = "Help";
sidebar.append(panel);
```

or in markup, with the session set from script:

```html ignore
<chat-panel heading="Help" greeting="Ask me anything."></chat-panel>
```

## Pointing at the page

The ⌖ button beside the composer starts a pick: whatever is under the pointer is
outlined, the next click picks it (and does not reach the page — a link is not
followed, a button does not press), and `Escape` cancels. The element's CSS path
lands in the composer, where the person can see and edit it before sending.

**Only the path is taken.** No text, no form values, no attributes beyond an
`id` — pointing at a row of a table is not consent to send the row.

The same thing is offered to the model as a tool, so it can ask "which one?"
itself: `pickElementTool: true` on `openChat`, or `pickElementTool()` in a
session's `tools`. And on its own:

```ts ignore
import { elementPath, pickElement } from "@kuboon/chat-element/picker";

const element = await pickElement({ ignore: [myPanel] });
if (element) console.log(elementPath(element)); // "#settings > button:nth-of-type(2)"
```

`elementPath` stops at the nearest unique `id`, and otherwise walks tag names up
to `body`, with `:nth-of-type()` where a tag repeats. Class names are left out.

## Tools the page runs

```ts ignore
import type { ClientTool } from "@kuboon/chat-element";

const whereAmI: ClientTool = {
  name: "where_am_i",
  description: "The page the person is looking at, as a path and a heading.",
  inputSchema: { type: "object", properties: {} },
  run: () =>
    `${location.pathname} — ${document.querySelector("h1")?.textContent}`,
};

openChat({ transport: "/helper-agent", tools: [whereAmI] });
```

They are declared to the controller with every request and never stored there.
When the model calls one, the turn ends with `done: "tools"`; the session runs
it, appends the result, and posts again.

## Transport

`transport` is a path or URL, or `{ url, fetch }` to have something other than
the network answer — a router running in the page, or a script, which is how a
static host serves a working chat.

## Drawing the replies

Replies are shown as text, with their URLs linked (`linkifyReply`). A model that
answers in Markdown gets `renderReply`: given a reply's text, it returns what
goes in the bubble, as a node or a promise of one.

```ts ignore
import { hastToDom, markdownToHast } from "@kuboon/md";

openChat({
  transport: "/helper-agent",
  renderReply: async (text) => hastToDom(await markdownToHast(text)),
});
```

It runs again on every streamed piece; while a promise is pending, the bubble
keeps what it showed before. What it returns goes into the page as it is, so it
must sanitise what the model wrote (`@kuboon/md` does). On a panel of your own,
set `panel.renderReply` before the conversation starts; replies already drawn
are not drawn again.

## Styling

Light DOM, with default styles under `.chat-panel__*` classes. Colors come from
custom properties, read with fallbacks so they can be set anywhere above the
panel: `--chat-panel-bg`, `--chat-panel-fg`, `--chat-panel-muted`,
`--chat-panel-border`, `--chat-panel-accent`, `--chat-panel-on-accent`,
`--chat-panel-radius`.

Labels follow the page's `lang` (English and Japanese ship);
`CHAT_PANEL_LABELS.fr = { … }` adds a language, and `panel.labels = { … }`
overrides one panel.

## Exports

| Path         | What                                                                    |
| ------------ | ----------------------------------------------------------------------- |
| `.`          | Everything below, plus `<chat-panel>` and `openChat`                    |
| `./session`  | `ChatSession` — the conversation, no DOM                                |
| `./picker`   | `pickElement`, `elementPath`, `pickElementTool`                         |
| `./protocol` | The wire format: message and event types, `encodeEvent`, `decodeEvents` |

## License

MIT
