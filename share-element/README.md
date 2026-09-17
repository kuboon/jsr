# @kuboon/share-element

A share panel as a single custom element: `<share-dialog>` — a plain `<div>`,
not a `<dialog>` — with X, LINE, and Threads share buttons, plus a native
share-sheet button (where the Web Share API exists) or a "copy URL" fallback
where it doesn't.

All four are monochrome icons drawn in `currentColor`, so they take whatever
color the page gives the button and there is nothing to say twice for dark mode.

It has no opinion on how it's shown. `.open()`/`.close()` only toggle its
`hidden` attribute; whether that reveals a popover, a fixed-position overlay, or
an inline panel is entirely up to your own markup and CSS.

## Usage

```ts ignore
import { createShareDialog } from "@kuboon/share-element";

const share = createShareDialog();
document.body.append(share);

button.addEventListener("click", () => {
  share.open({
    url: "https://example.com/posts/1",
    text: "この記事をシェアしよう",
  });
});
```

Or declare it in markup and drive it from JS:

```html ignore
<share-dialog id="share" url="https://example.com/posts/1"></share-dialog>
<script type="module">
import "@kuboon/share-element";
document.getElementById("share").open(); // uses the url attribute
</script>
```

`.open({ url, text })` sets the shared URL and the panel's text, then clears its
`hidden` attribute. Both fall back — `url` to the element's `url` attribute (or
whatever was last used), `text` to the `text` attribute — so a purely
declarative `<share-dialog url="…">` plus `.open()` with no arguments works too.
`.close()` just sets `hidden` back.

**`text` is display-only.** It's shown inside the panel to explain what's being
shared, but it is never passed to X, LINE, Threads, the Web Share API, or the
clipboard — only `url` is.

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
using the panel.

## Styling

Rendered in **light DOM** (no shadow root) specifically so a page's own
stylesheet can restyle it, under plain, low-specificity (`:where(...)`) default
styles:

| Class                                                                  | Element                 |
| ---------------------------------------------------------------------- | ----------------------- |
| `.share-dialog`                                                        | the panel itself        |
| `.share-dialog__text`                                                  | the explanatory text    |
| `.share-dialog__actions`                                               | the button row          |
| `.share-dialog__button`                                                | every share/copy button |
| `.share-dialog__button--x`, `--line`, `--threads`, `--share`, `--copy` | one specific button     |
| `.share-dialog__icon`                                                  | the `<svg>` inside one  |
| `.share-dialog__close`                                                 | the close button        |

Any rule targeting these classes overrides the defaults without `!important` —
`:where()` carries zero specificity, so even a bare
`.share-dialog__button { ... }` in your stylesheet wins.

**With one catch, if you use cascade layers.** The defaults are injected as a
plain `<style>` with no layer, and unlayered CSS outranks _every_ `@layer`
whatever the specificity — so a rule in `@layer app` loses to
`:where(.share-dialog)` even though `:where()` counts for nothing. Write your
overrides unlayered as well.

Sizing an icon is `.share-dialog__icon { width; height }` — the glyphs are
`24×24` and take their color from the button, so `color` on the button is what
recolors them.

The names are overridable too, via `.labels`. They are what a screen reader
announces and what the tooltip says, not text on the button:

```ts ignore
share.labels = {
  share: "共有",
  copy: "URLをコピー",
  copied: "コピーしました",
  copyFailed: "コピーできませんでした",
  close: "閉じる",
};
```

## Custom element registration

Importing `@kuboon/share-element` registers `<share-dialog>` wherever there is a
DOM, and does nothing anywhere else, so a component file that is also evaluated
on a server — an SSG build, an SSR render — can import it at the top like any
other module. `defineShareDialog()` returns whether the element ended up
registered; `createShareDialog()` throws where there is no DOM to create one in.

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
