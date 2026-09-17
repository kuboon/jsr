# @kuboon/share-element

A share panel as a single custom element: `<share-dialog>` — a plain `<div>`,
not a `<dialog>` — with X, LINE, and Threads share buttons, plus a native
share-sheet button (where the Web Share API exists) or a "copy URL" fallback
where it doesn't.

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
   clipboard, and briefly relabels itself to confirm it worked.

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
| `.share-dialog__close`                                                 | the close button        |

Any rule targeting these classes overrides the defaults without `!important` —
`:where()` carries zero specificity, so even a bare
`.share-dialog__button { ... }` in your stylesheet wins.

Labels are overridable too, via `.labels`:

```ts ignore
share.labels = {
  share: "共有",
  copy: "URLをコピー",
  copied: "コピーしました",
  close: "閉じる",
};
```

## Custom element registration

Importing `@kuboon/share-element` registers `<share-dialog>` wherever there is a
DOM, and does nothing anywhere else, so a component file that is also evaluated
on a server — an SSG build, an SSR render — can import it at the top like any
other module. `defineShareDialog()` returns whether the element ended up
registered; `createShareDialog()` throws where there is no DOM to create one in.

## License

MIT
