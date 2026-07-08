# @kuboon/md

[![JSR](https://jsr.io/badges/@kuboon/md)](https://jsr.io/@kuboon/md)

[unified](https://unifiedjs.com/) ベースの Markdown → HTML 変換パッケージ。

- GitHub Flavored
  Markdown（テーブル、タスクリスト、取り消し線、オートリンク）に対応。
- `` ```mermaid `` コードブロックを
  [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) で SVG
  図として描画。
- それ以外のコードブロックは [Shiki](https://shiki.style/)
  でシンタックスハイライト。
- 入力 Markdown 中の生 HTML（`<script>` や `onerror=` 属性、`javascript:`
  リンクなど）は 出力に一切現れない。Markdown パーサーの時点で生 HTML
  は破棄され、生成される HTML 断片（本文・Mermaid の SVG・Shiki
  のハイライト結果）はすべて
  [`rehype-sanitize`](https://github.com/rehypejs/rehype-sanitize)
  でサニタイズしてから 文字列化する。

## インストール

```sh
deno add jsr:@kuboon/md
```

## 使い方

```ts
import { markdownToHtml } from "@kuboon/md";

const html = await markdownToHtml(`
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
```

### オプション

```ts
import { markdownToHtml } from "@kuboon/md";

const html = await markdownToHtml(markdown, {
  // beautiful-mermaid の RenderOptions（テーマ色など）
  mermaid: { bg: "#0f0f0f", fg: "#e0e0e0" },
  // Shiki のテーマ設定
  shiki: { theme: "github-dark" },
  // ライト/ダーク両対応もできる
  // shiki: { themes: { light: "github-light", dark: "github-dark" } },
});
```

## セキュリティに関する設計

このパッケージは「Markdown に含まれる `<script>` タグや JavaScript を実行しうる
記法を、常に出力から除去する」ことを目的に設計されている。

1. Markdown → HTML への変換 (`remark-rehype`) では生 HTML
   の解釈を有効にしていない ため、入力に書かれた `<script>` や
   `<img onerror=...>` のようなタグはそもそも
   ハイライト後もパースされず出力に含まれない。
2. リンクや画像の `href`/`src` は `rehype-sanitize` により
   `http`/`https`/`mailto` などの安全なプロトコルのみ許可され、`javascript:`
   は除去される。
3. Mermaid 図として描画された SVG、Shiki
   がハイライトしたコードは、それぞれ専用の 属性許可リスト（`mermaidSvgSchema` /
   `shikiSchema`、`sanitize.ts` を参照）で
   個別にサニタイズしてから本文に埋め込まれる。`<foreignObject>` や `<script>`、
   イベントハンドラ属性 (`on*`) は許可リストに存在しないため必ず除去される。

## API

- `markdownToHtml(markdown, options?)` — Markdown を上記の方針でサニタイズ済み
  HTML 文字列に変換する。
- `rehypeMermaid(options?)` / `./mermaid.ts` — Mermaid コードブロックを SVG に
  置き換える rehype プラグイン単体。
- `rehypeShiki(options?)` / `./shiki.ts` — コードブロックを Shiki
  でハイライトする rehype プラグイン単体。
- `markdownSchema` / `mermaidSvgSchema` / `shikiSchema` / `./sanitize.ts` —
  それぞれの用途で使うサニタイズスキーマ。独自の unified パイプラインを組む際に
  再利用できる。

## Links

- JSR: <https://jsr.io/@kuboon/md>
- beautiful-mermaid: <https://github.com/lukilabs/beautiful-mermaid>
- Shiki: <https://shiki.style/>

## License

[MIT](./LICENSE)
