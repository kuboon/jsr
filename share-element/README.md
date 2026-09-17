# @kuboon/share-element

A row of share buttons as a single custom element: `<share-buttons>` — X, LINE
and Threads, plus a native share-sheet button (where the Web Share API exists)
or a "copy URL" fallback where it doesn't.

All four are monochrome icons drawn in `currentColor`, so they take whatever
color the page gives the button and there is nothing to say twice for dark mode.

**It is only the buttons.** No panel, no heading, no close button, and nothing
that shows or hides itself. Whether the row sits inline under an article, inside
a popover, or in a `<dialog>` the page opens is the page's business — and so is
opening and closing whatever holds it. Put the tag where you want the buttons to
be and style the thing around it yourself.

## Usage

```html ignore
<p>Enjoyed this? Pass it on:</p>
<share-buttons></share-buttons>
```

That shares the page it is on. To share something else, give it a `url`:

```html ignore
<share-buttons url="https://example.com/posts/1"></share-buttons>
```

Or build one from script:

```ts ignore
import { createShareButtons } from "@kuboon/share-element";

const row = createShareButtons();
row.url = "https://example.com/posts/1";
article.append(row);
```

`url` is a property and an attribute, and the two reflect each other. **It is
read at the moment of the click**, not when the row is built — so a row placed
once on a page that navigates on the client goes on sharing wherever the reader
actually is, rather than the address it was rendered at. Leave it empty and the
row shares `location.href`.

## Buttons

Four buttons, always in this order:

1. **X** — opens X's tweet composer, pre-filled with the URL.
2. **LINE** — opens LINE's share intent.
3. **Threads** — opens Threads' post composer, pre-filled with the URL.
4. **Share** (if `navigator.share` exists) — opens the platform's native share
   sheet with `{ url }`. **Copy URL** (otherwise) — copies the URL to the
   clipboard, and briefly shows a tick to confirm it worked.

Each is icon-only. What a button is _called_ becomes its `aria-label` and its
hover tooltip instead of text on it, so it still has a name for a screen reader
and for a mouse — see the `labels` block under [Styling](#styling) for changing
those names.

The URL always ends up somewhere the reader can use it. If the platform refuses
to open the share sheet at all — no registered target, an insecure context, a
gesture the browser did not count — the button copies to the clipboard instead,
and shows the same tick. If the clipboard refuses too, it shows a warning
triangle rather than looking like it worked. Either way the accessible name
changes with the glyph, so the answer is not something only a sighted reader
gets. The one rejection that is _not_ treated as a failure is the reader closing
the share sheet: that is an answer, and copying behind their back would be the
wrong thing to do.

The X/LINE/Threads URL builders (`xShareUrl`, `lineShareUrl`, `threadsShareUrl`)
are also exported directly, in case you want to build your own links instead of
using the row.

## Styling

Rendered in **light DOM** (no shadow root) specifically so a page's own
stylesheet can restyle it, under plain, low-specificity (`:where(...)`) default
styles:

| Class                                                                   | Element                 |
| ----------------------------------------------------------------------- | ----------------------- |
| `.share-buttons`                                                        | the row itself          |
| `.share-buttons__button`                                                | every share/copy button |
| `.share-buttons__button--x`, `--line`, `--threads`, `--share`, `--copy` | one specific button     |
| `.share-buttons__icon`                                                  | the `<svg>` inside one  |

Any rule targeting these classes overrides the defaults without `!important` —
`:where()` carries zero specificity, so even a bare
`.share-buttons__button { ... }` in your stylesheet wins.

**With one catch, if you use cascade layers.** The defaults are injected as a
plain `<style>` with no layer, and unlayered CSS outranks _every_ `@layer`
whatever the specificity — so a rule in `@layer app` loses to
`:where(.share-buttons)` even though `:where()` counts for nothing. Write your
overrides unlayered as well.

Sizing an icon is `.share-buttons__icon { width; height }` — the glyphs are
`24×24` and take their color from the button, so `color` on the button is what
recolors them.

The names are overridable too, via `.labels`. They are what a screen reader
announces and what the tooltip says, not text on the button:

```ts ignore
row.labels = {
  share: "共有",
  copy: "URLをコピー",
  copied: "コピーしました",
  copyFailed: "コピーできませんでした",
};
```

## Custom element registration

Importing `@kuboon/share-element` registers `<share-buttons>` wherever there is
a DOM, and does nothing anywhere else, so a component file that is also
evaluated on a server — an SSG build, an SSR render — can import it at the top
like any other module. `defineShareButtons()` returns whether the element ended
up registered; `createShareButtons()` throws where there is no DOM to create one
in.

## Icon credits

The three brand marks are [Simple Icons](https://simpleicons.org) (CC0-1.0); the
share, copy, tick and warning glyphs are [Feather](https://feathericons.com)
(MIT), redrawn as `<path>` data so one code path builds them all. The path data
is embedded in `mod.ts` — there is no icon dependency to install.

Each brand belongs to its owner. The marks are here to label the button that
opens that service, which is the use the brands themselves ask for; this package
is not affiliated with any of them.

## License

MIT
