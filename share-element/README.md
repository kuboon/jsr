# @kuboon/share-element

A row of share buttons as a single custom element: `<share-buttons>` — X, LINE
and Threads, plus a native share-sheet button (where the Web Share API exists)
or a "copy URL" fallback where it doesn't — never both.

All four are monochrome icons drawn in `currentColor`, and the box around each
one is drawn from `currentColor` too — so the whole row takes whatever color the
page gives it, and there is nothing to say twice for dark mode.

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
4. **Share** (where `navigator.share` exists) — opens the platform's native
   share sheet with `{ url }`. **Copy URL** (otherwise) — copies the URL to the
   clipboard, and briefly shows a tick to confirm it worked.

The fourth is one or the other, never both: copying out of a share sheet is a
row of the sheet, and the share button falls back to the clipboard by itself
when the sheet is refused — which is the only case a separate copy button would
have covered.

Each is icon-only. What a button is _called_ becomes its `aria-label` and its
hover tooltip instead of text on it, so it still has a name for a screen reader
and for a mouse. Those names follow the page's language — see
[Language](#language).

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

## Touch devices get the share sheet alone

A phone's native share sheet already lists every app the reader has, so three
brand buttons beside it are three worse copies of one of its rows. On a desktop
the same sheet is the weak option — a short list, or nothing — and a direct link
to X or Threads is the better one. So by default the row leans one way or the
other rather than showing the same four buttons to both:

|                                 | what the reader sees    |
| ------------------------------- | ----------------------- |
| Touch device with a share sheet | **Share** alone         |
| Touch device without one        | X, LINE, Threads, Copy  |
| Desktop with a share sheet      | X, LINE, Threads, Share |
| Desktop without one             | X, LINE, Threads, Copy  |

**The test is the pointer, not the browser.** `navigator.share` exists on
desktop Chrome and Safari too — exactly where it is the weak path — so its
presence alone decides nothing; the default style asks
`@media (pointer: coarse)` as well. A laptop with a touchscreen reports
`pointer: fine` with `any-pointer: coarse`, and `pointer` is the one asked, so
it counts as a desktop. Being CSS rather than a measurement taken once, it also
follows a tablet that gains a keyboard with nothing re-rendering.

Every button the platform can honour is in the DOM; this only decides which are
shown. To show them all everywhere:

```html ignore
<share-buttons show="all"></share-buttons>
```

`show` is a property and an attribute like `url`, and takes `"auto"` (the
default) or `"all"`. It is the way out on purpose: the rule that does the
collapsing carries real specificity, so a page's own
`.share-buttons__button { display: flex }` cannot switch it off by accident.

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

The row also carries `data-share-sheet` when `navigator.share` exists, which is
what the collapse rule above keys off.

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

**Nothing in the defaults is a fixed color.** The background is transparent and
the border is the page's own text color at 25%, so a row put on a dark surface
comes out light without being told: `color` is the one property that moves the
whole row. Give a button its own `background` if you want one — that is the part
the defaults deliberately leave to the page.

The names come from the page's language rather than from the stylesheet — see
[Language](#language) below.

## Language

The names are read out next to the page's own words, so they follow **the
language the page declares**, not the reader's browser setting. A page that says
`<html lang="ja">` gets a row that says 共有 and URL をコピー, with no script
and nothing to configure:

```html ignore
<html lang="ja">
  <share-buttons></share-buttons>
</html>
```

English and Japanese ship. Anything else reads English — better than a row of
empty tooltips, and better than a guessed translation. The tag is matched on its
primary subtag, so `ja-JP` is `ja`, and a row takes the nearest `lang` above it,
which is usually the document's but can be a quoted passage's:

```html ignore
<blockquote lang="en">
  <share-buttons></share-buttons>
</blockquote>
```

`lang` on the row itself counts as well, and is watched: setting it later
re-renders the names. (An _ancestor's_ `lang` changing is not watched — the
language is re-read on every render, which covers the cases that matter.)

**Adding a language is adding a key.** Do it once, before the rows are built,
and every row in a page of that language picks it up:

```ts ignore
import { SHARE_BUTTONS_LABELS } from "@kuboon/share-element";

SHARE_BUTTONS_LABELS.fr = {
  ...SHARE_BUTTONS_LABELS.en,
  share: "Partager",
  copy: "Copier l'URL",
  copied: "Copié !",
  copyFailed: "Copie impossible",
};
```

`shareButtonsLabels("ja-JP")` returns the resolved set, for a page that builds
its own controls from the same names.

X, LINE and Threads are the same in every language: a brand name is not
translated.

### One row, different names

`.labels` renames the buttons of one row, on top of whatever its language gives
them. Use it when the names differ for this row's own sake rather than for its
language — otherwise the language table is the place, so that every row agrees.

```ts ignore
row.labels = { copy: "リンクをコピー" };
```

Reading `.labels` back gives the resolved set: the row's language, with these on
top.

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
