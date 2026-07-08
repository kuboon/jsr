# @kuboon/md

[![JSR](https://jsr.io/badges/@kuboon/md)](https://jsr.io/@kuboon/md)

[unified](https://unifiedjs.com/) ベースの Markdown → HAST (HTML AST)
変換パッケージ。

- GitHub Flavored
  Markdown（テーブル、タスクリスト、取り消し線、オートリンク）に対応。
- `` ```mermaid `` コードブロックを
  [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) で SVG
  図として描画。
- それ以外のコードブロックは [Shiki](https://shiki.style/)
  でシンタックスハイライト。
- mdast 段階（remark-rehype で hast に変換する前）に独自の transformer
  を挟める。
- 入力 Markdown 中の生 HTML（`<script>` や `onerror=` 属性、`javascript:`
  リンクなど）は出力に一切現れない。Markdown パーサーの時点で生 HTML
  は破棄され、生成される hast 断片（本文・Mermaid の SVG・Shiki
  のハイライト結果）はすべて
  [`rehype-sanitize`](https://github.com/rehypejs/rehype-sanitize)
  でサニタイズされる。

`markdownToHast()` は HTML 文字列ではなく hast
ツリーを返す。用途に応じて、以下のいずれかの変換関数で出力先に変換する。

- `hastToHtml(hast)` — HTML
  文字列に変換（[`hast-util-to-html`](https://github.com/syntax-tree/hast-util-to-html)
  のラッパー）。
- `hastToDom(hast, options?)` — 実 DOM
  ノードに変換（[`hast-util-to-dom`](https://github.com/syntax-tree/hast-util-to-dom)
  のラッパー）。ブラウザの `document`、または `options.document` 経由で渡した
  DOM 実装（`linkedom` など）を使う。
- `hastToRemix(hast)` —
  [Remix UI](https://github.com/remix-run/remix/tree/main/packages/ui)
  の要素ツリー（`RemixNode`）に変換。`createRoot(...).render(...)`
  にそのまま渡せる。

## インストール

```sh
deno add jsr:@kuboon/md
```

## 使い方

```ts
import { markdownToHast } from "@kuboon/md";
import { toHtml } from "hast-util-to-html";

const hast = await markdownToHast(`
# Hello

\`\`\`mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Action]
  B -->|No| D[End]
\`\`\`

\`\`\`ts
const answer: number = 42;
\`\`\`
`);

const html = toHtml(hast);
```

`@kuboon/md` が提供する変換関数を使う場合:

```ts
import { hastToDom, hastToHtml, hastToRemix, markdownToHast } from "@kuboon/md";

const hast = await markdownToHast("# Hello");

const html = hastToHtml(hast);
const dom = hastToDom(hast); // ブラウザの document を使う
const remix = hastToRemix(hast); // createRoot(...).render(remix) に渡せる
```

### オプション

```ts
import { markdownToHast } from "@kuboon/md";
import { visit } from "unist-util-visit";

const hast = await markdownToHast(markdown, {
  // beautiful-mermaid の RenderOptions（テーマ色など）
  mermaid: { bg: "#0f0f0f", fg: "#e0e0e0" },
  // Shiki のテーマ設定
  shiki: { theme: "github-dark" },
  // ライト/ダーク両対応もできる
  // shiki: { themes: { light: "github-light", dark: "github-dark" } },
  // remark-rehype で hast に変換する直前、mdast に対して好きな変換をかけられる
  mdastTransform: (tree) => {
    visit(tree, "heading", (node) => {
      node.depth = Math.min(node.depth + 1, 6);
    });
  },
});
```

## セキュリティに関する設計

このパッケージは「Markdown に含まれる `<script>` タグや JavaScript を実行しうる
記法を、常に出力から除去する」ことを目的に設計されている。

1. Markdown → HAST への変換 (`remark-rehype`) では生 HTML
   の解釈を有効にしていないため、入力に書かれた `<script>` や
   `<img onerror=...>` のようなタグはそもそもパースされず出力に含まれない。
2. リンクや画像の `href`/`src` は `rehype-sanitize` により
   `http`/`https`/`mailto` などの安全なプロトコルのみ許可され、`javascript:`
   は除去される。
3. Mermaid 図として描画された SVG、Shiki
   がハイライトしたコードは、それぞれ専用の属性許可リスト（`mermaidSvgSchema` /
   `shikiSchema`、`sanitize.ts`
   を参照）で個別にサニタイズしてから本文に埋め込まれる。 `<foreignObject>` や
   `<script>`、イベントハンドラ属性 (`on*`)
   は許可リストに存在しないため必ず除去される。

## API

- `markdownToHast(markdown, options?)` — Markdown を上記の方針でサニタイズ済み
  hast ツリーに変換する。
- `rehypeMermaid(options?)` — Mermaid コードブロックを SVG に置き換える rehype
  プラグイン単体。
- `rehypeShiki(options?)` — コードブロックを Shiki でハイライトする rehype
  プラグイン単体。
- `markdownSchema` / `mermaidSvgSchema` / `shikiSchema` —
  それぞれの用途で使うサニタイズスキーマ。独自の unified パイプラインを組む際に
  再利用できる。
- `hastToHtml(hast, options?)` / `./hast_to_html.ts` — hast を HTML
  文字列に変換する。
- `hastToDom(hast, options?)` / `./hast_to_dom.ts` — hast を実 DOM
  ノードに変換する。
- `hastToRemix(hast)` / `./hast_to_remix.ts` — hast を Remix UI の要素ツリーに
  変換する。

## Links

- JSR: <https://jsr.io/@kuboon/md>
- beautiful-mermaid: <https://github.com/lukilabs/beautiful-mermaid>
- Shiki: <https://shiki.style/>

## License

[MIT](./LICENSE)
