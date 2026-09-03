# @kuboon/onboarding-kit

A product tour, as a single custom element: a dimmed page, a spotlight on one
thing at a time, and a tooltip anchored to it. The tour itself is **JSON**, not
markup — write a scenario, hand it to `<onboarding-tour>`, done.

Pure DOM, zero runtime dependencies, no framework. For the
[Remix UI](https://github.com/remix-run/remix/tree/main/packages/ui)-flavored
version — same scenario format, rendered through Remix UI's component model —
see
[`@kuboon/remix-onboarding-kit`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/onboarding-kit).

## Installation

Published to [JSR](https://jsr.io/@kuboon/onboarding-kit):

```sh
deno add jsr:@kuboon/onboarding-kit
npx jsr add @kuboon/onboarding-kit
```

## Usage

```html ignore
<script type="module"
  src="/node_modules/@kuboon/onboarding-kit/element.js"></script>
<onboarding-tour src="/tours/main.json"></onboarding-tour>
```

`src` is fetched, parsed, and validated against the schema; the tour starts as
soon as it loads — unless the visitor already finished this tour at this
version, in which case nothing is shown.

Or drive it from JS with an already-parsed scenario:

```ts ignore
import "@kuboon/onboarding-kit/element";

let el = document.createElement("onboarding-tour");
document.body.append(el);
el.scenario = await fetch("/tours/main.json").then((r) => r.json());
```

Setting `.scenario` replaces any tour already running on the element and starts
the new one. Setting it to `null` tears the tour down.

### Replaying a tour

```ts ignore
let el = document.querySelector("onboarding-tour")!;
await el.tour?.reset();
el.setAttribute("force", "");
el.scenario = el.scenario; // re-assign to restart
```

Or skip the element's own store check entirely and drive the headless API
directly — see below.

## The scenario

```jsonc
{
  "$schema": "https://jsr.io/@kuboon/onboarding-kit/schema.json",
  "name": "main-tour",
  "version": 1,
  "labels": {
    "next": "次へ",
    "back": "戻る",
    "skip": "スキップ",
    "done": "完了"
  },
  "defaults": { "placement": "bottom" },
  "steps": [
    { "id": "welcome", "body": "ようこそ。3 ステップで案内します。" },
    {
      "id": "nav",
      "target": "[data-tour=nav]",
      "title": "ナビ",
      "body": "ここから移動します。",
      "placement": "bottom-start"
    },
    {
      "id": "push",
      "target": "[data-tour=push-card]",
      "body": "通知はここで。",
      "placement": "right",
      "whenMissing": "wait"
    },
    {
      "id": "hero",
      "target": { "x": 24, "y": 120, "width": 320, "height": 180 },
      "body": "この領域が本文です。",
      "spotlight": false
    }
  ]
}
```

### Scenario fields

| Field      | Type         | Default | Notes                                                            |
| ---------- | ------------ | ------- | ---------------------------------------------------------------- |
| `name`     | `string`     | —       | Required. Identifies the tour where completion is stored         |
| `version`  | `integer`    | `1`     | Bump to show an edited tour again to people who finished the old |
| `keyboard` | `boolean`    | `true`  | `→`/`Enter` next, `←` back, `Esc` skip                           |
| `labels`   | object       | English | `next`, `back`, `skip`, `done`, `progress`                       |
| `defaults` | step options | —       | Applied to every step that does not override them                |
| `steps`    | array        | —       | Required, non-empty                                              |

### Step fields

| Field              | Type                  | Default  | Notes                                        |
| ------------------ | --------------------- | -------- | -------------------------------------------- |
| `id`               | `string`              | —        | For `goto()` and analytics                   |
| `target`           | selector or `{x,y,…}` | —        | Omit for a centered card with no subject     |
| `title`, `body`    | `string`              | —        | At least one is required                     |
| `placement`        | 12 anchor placements  | `bottom` | A preference; see below                      |
| `offset`           | `number`              | `12`     | Gap between target and tooltip, in pixels    |
| `spotlight`        | `boolean`             | `true`   | Cut the target out of the dim                |
| `spotlightPadding` | `number`              | `6`      | Breathing room around the cut-out            |
| `scrollIntoView`   | `boolean`             | `true`   | Scroll an off-screen target into view        |
| `whenMissing`      | see below             | `skip`   | What to do when the selector matches nothing |

`target` is a **CSS selector**. Prefer a `[data-tour="…"]` attribute you control
over an `id`, which is a page-unique resource that may not be yours to spend. A
`{x, y, width, height}` object points at a fixed rectangle in **viewport**
coordinates instead.

### `whenMissing`

A selector written in JSON is decoupled from the component tree — the point of
the exercise — but that also means a step can name something that is not on this
page, is inside a collapsed section, or has not hydrated yet. Every step
therefore states what should happen:

| Value    | Behavior                                                                        |
| -------- | ------------------------------------------------------------------------------- |
| `skip`   | Move past the step in the direction of travel (default)                         |
| `wait`   | Poll until it appears or `waitTimeoutMs` (5s) elapses, then fall back to `skip` |
| `center` | Show the tooltip centered, with no spotlight                                    |
| `fail`   | Stop the tour and reject                                                        |

`wait` surfaces as a real `waiting` status on the tour, so an overlay can say it
is looking for something rather than appear frozen.

## What this package does not implement

Positioning is intentionally simple: `anchor()` honors the requested
`placement`, flips to the **opposite** side when it would overflow the viewport,
and clamps the cross axis into the viewport. It does not cascade bottom → top →
right → left the way a full floating-ui-style engine would. Set `placement`
explicitly on steps that must sit beside their target rather than above or below
it.

The spotlight is the one thing `anchor()` cannot do, because it has to _cover_
the target rather than sit next to it, so the kit tracks that rect itself.

## Headless use

`<onboarding-tour>` is a thin shell over the state machine — step order, target
resolution, keyboard control, completion — which you can drive directly to build
your own overlay:

```ts
import { createTour, isTourVisible } from "@kuboon/onboarding-kit";

let tour = createTour({ name: "demo", steps: [{ body: "hi" }] });
tour.addEventListener("change", () => {
  let { status, step, target, index, total } = tour.state;
  if (isTourVisible(status)) {
    // draw(step, target, index, total)
  }
});
```

## Persistence

Completion is remembered in `localStorage`, keyed by the tour's `name`, storing
the `version` it was finished at. Every access is guarded — `localStorage`
throws outright in some privacy modes, and a tour that cannot record itself
should still run.

The store is an interface, so a per-user server-side store can replace it
without touching anything else:

```ts ignore
import { createTour } from "@kuboon/onboarding-kit";

createTour(scenario, {
  store: {
    completed: (name) => fetch(`/api/tours/${name}`).then((r) => r.json()),
    complete: (name, version) =>
      fetch(`/api/tours/${name}`, { method: "PUT", body: `${version}` }),
    clear: (name) => fetch(`/api/tours/${name}`, { method: "DELETE" }),
  },
});
```

`<onboarding-tour>` itself always uses the default `localStorage` store; pass a
custom one by driving the headless API yourself instead of the element.

## Styling

The overlay's styles live in a `<style>` inside the element's own shadow root,
so nothing leaks in or out and there is no stylesheet to import. It respects
`prefers-color-scheme`. For a different look, build your own overlay against the
headless API above.

## Scope

Single-page tours only. Steps that advance when the visitor clicks the target,
and tours that navigate between frames mid-run, are deliberately not
implemented.

## License

MIT
