# @kuboon/md

[![JSR](https://jsr.io/badges/@kuboon/md)](https://jsr.io/@kuboon/md)

[unified](https://unifiedjs.com/) ベースの Markdown → HAST (HTML AST)
変換パッケージ。

- GitHub Flavored
  Markdown（テーブル、タスクリスト、取り消し線、オートリンク）に対応。
- 各見出しに `id`（GitHub 互換のスラッグ）を自動付与し、見出し自身にリンクする
  `<a href="#slug">` を設定。見出し末尾に `{#custom-id}` と書けば
  スラッグの代わりにその id を使う（`## インストール {#setup}`。Pandoc /
  kramdown / Hugo と同じ記法。使える文字は `A-Za-z0-9_-`）。
- 入力由来の id（見出し・`{#custom-id}`・脚注）のうち、ハイフンを含まない
  ものには末尾に `-` を付ける（`## Install` → `id="install-"`、`{#setup}` →
  `id="setup-"`。`## Getting Started` → `getting-started` はそのまま）。
  本文中の `[リンク](#setup)` のうち、文書内の id を指すものはあわせて `#setup-`
  に書き換えるので、Markdown 側では意識せずにリンクできる。
  文書外のアンカー（ホストページの `#top` など）へのリンクは変更しない。
- `` ```mermaid `` コードブロックを
  [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) で SVG
  図として描画。
- それ以外のコードブロックは [Shiki](https://shiki.style/)
  でシンタックスハイライト（既定は `web`
  バンドル。[バンドルサイズ](#バンドルサイズと-shiki) を参照）。
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
- `hastToElement(hast, createElement)`（`@kuboon/md/hast_to_element.ts`）—
  `createElement` が作る要素ツリーに変換。
  [Remix UI](https://github.com/remix-run/remix/tree/main/packages/ui) の
  `createElement` を渡せば `createRoot(...).render(...)`
  にそのまま渡せる。factory は**呼び出し側が渡す**（後述）。
- `tocFromHast(hast)` — 見出し（`h1`-`h6`）を文書順に列挙した目次
  （`{ depth, id, text }[]`）を返す。`id` は自動付与された `rehypeHeadingLinks`
  のものをそのまま使う。脚注セクションの見出し（Footnotes）は含めない。

UI の要素を作る `hastToElement` は、`@kuboon/md` 本体ではなく**専用のエントリ
ポイント**にある。使わない変換器が依存グラフに入らないようにするため。

そして UI ライブラリに**まったく依存しない**。`createElement` を引数で受け取る。
ライブラリが UI ランタイムを import するとバージョン範囲を固定することになるが、
たとえば `@remix-run/ui` の範囲は minor をまたいで重ならない —— このパッケージ
より 1 つ先の minor を使っている利用側では**ランタイムが二重に解決され**、
モジュールレベルの状態がエラーも無く二つ存在することになる。factory を引数に
すれば、コピーは利用側の 1 つだけになる。

`createElement(type, props, ...children)` の形をした factory なら何でも使える。
Remix UI で使う場合は `@remix-run/ui` の `createElement` をそのまま渡す:

```ts ignore
import { createElement, createRoot } from "@remix-run/ui";
import { markdownToHast } from "@kuboon/md";
import { hastToElement } from "@kuboon/md/hast_to_element.ts";

const tree = hastToElement(await markdownToHast("# Hello"), createElement);
createRoot(container).render(tree);
```

factory は**タグ名を受け取る**ので、特定のタグを自前のコンポーネントに
差し替えるのも呼び出し側で書ける。記事中の `<a>` をフレームナビゲーション用の
コンポーネントで描く、といった場合:

```ts ignore
const withComponents = (
  type: string,
  props: Record<string, unknown>,
  ...children: unknown[]
) => createElement(components[type] ?? type, props, ...children);

const tree = hastToElement(hast, withComponents);
```

### React で使う場合

React の `createElement` も形は同じなので、ほぼそのまま渡せる。違いは `style`
だけ —— hast の `style` は仕様どおり**文字列**だが、React はオブジェクトを
要求する。そこだけ変換する factory を挟む:

```ts ignore
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownToHast } from "@kuboon/md";
import { hastToElement } from "@kuboon/md/hast_to_element.ts";

const styleToObject = (style: string) =>
  Object.fromEntries(
    style.split(";").filter(Boolean).map((rule) => {
      const [name, ...rest] = rule.split(":");
      return [
        name.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
        rest.join(":").trim(),
      ];
    }),
  );

const reactFactory = (
  type: string,
  props: Record<string, unknown>,
  ...children: unknown[]
) => {
  const { style, ...rest } = props;
  return createElement(
    type,
    typeof style === "string"
      ? { ...rest, style: styleToObject(style) }
      : props,
    ...children,
  );
};

const hast = await markdownToHast("# Hello");
const html = renderToStaticMarkup(
  hastToElement(hast, reactFactory) as ReactNode,
);
```

これは `hast_converters.test.ts` で実物の React を使ってテストしている。HTML
文字列が欲しいだけなら `hastToHtml` の方が早い。

プロパティ名は気にしなくてよい。Shiki の `codeToHast` は `class` / `tabindex`
という生の属性名で出してくるが、`rehypeShiki` が hast の規約（`className` /
`tabIndex`）に直してから本文に埋めている。HTML への出力は変わらない。

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

```ts ignore
import { createElement } from "@remix-run/ui";
import { hastToDom, hastToHtml, markdownToHast } from "@kuboon/md";
import { hastToElement } from "@kuboon/md/hast_to_element.ts";

const hast = await markdownToHast("# Hello");

const html = hastToHtml(hast);
const dom = hastToDom(hast); // ブラウザの document を使う
const remix = hastToElement(hast, createElement); // createRoot(...).render(remix) に渡せる
```

### オプション

```ts
import { markdownToHast } from "@kuboon/md";
import { visit } from "unist-util-visit";

const hast = await markdownToHast("# Hello", {
  // beautiful-mermaid の RenderOptions（テーマ色など）
  mermaid: { bg: "#0f0f0f", fg: "#e0e0e0" },
  // Shiki のテーマ設定
  shiki: { theme: "github-dark" },
  // ライト/ダーク両対応もできる
  // shiki: { themes: { light: "github-light", dark: "github-dark" } },
  // 自前の highlighter を渡してバンドルを削ることもできる（下記参照）
  // shiki: { highlighter, theme: "github-dark" },
  // remark-rehype で hast に変換する直前、mdast に対して好きな変換をかけられる
  mdastTransform: (tree) => {
    visit(tree, "heading", (node) => {
      if (node.depth < 6) node.depth = (node.depth + 1) as typeof node.depth;
    });
  },
});
```

## バンドルサイズと Shiki

Shiki は文法とテーマの塊で、既定でどれを積むかがそのままビルド成果物の大きさに
なる。このパッケージの既定は Shiki の `web`
バンドル（主要言語を必要時に読み込む）。

`md/mod.ts` を `deno bundle --minify --platform browser` した実測値:

| Shiki の入れ方                           | バンドル       | `node_modules` |
| ---------------------------------------- | -------------- | -------------- |
| `shiki`（全言語）                        | 12 MB          | 24 MB          |
| **`shiki/bundle/web`（既定）**           | **6.8 MB**     | 24 MB          |
| `createHighlighterCore` + 必要な言語だけ | **352 KB**[^1] | 24 MB          |

[^1]: Shiki 単体での実測（`shiki/core` + JS 正規表現エンジン + TypeScript +
    JSON + 1テーマ）。

**`node_modules` はどれでも変わらない。** Shiki は全文法を `@shikijs/langs`
1パッケージで配っているので、どのエントリポイントから import しても npm
は同じものを入れる。変わるのはビルド成果物のほうだけ。

既定より小さくしたいときは、自分で組んだ highlighter を渡す:

```ts ignore
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import ts from "@shikijs/langs/typescript";
import githubDark from "@shikijs/themes/github-dark";
import { markdownToHast } from "@kuboon/md";

const highlighter = await createHighlighterCore({
  langs: [ts],
  themes: [githubDark],
  engine: createJavaScriptRegexEngine(),
});

const hast = await markdownToHast(source, {
  shiki: { highlighter, theme: "github-dark" },
});
```

渡した highlighter
が持っていない言語は、未知の言語と同じくプレーンテキストとして 出力される（Shiki
のマークアップは付くが、トークンごとの色は付かない）。

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
4. 見出しや脚注の `id` はユーザーが書いたテキストから生成されるため、必ず
   ハイフンを含むようにする（含まなければ末尾に `-`
   を付ける）。ハイフンを含む名前は JS の識別子になれず、`window.config`
   のようなグローバル参照やブラウザ組み込みのプロパティと決して一致しないので、
   `id="config"` のような値による DOM clobbering を防げる。

## API

- `markdownToHast(markdown, options?)` — Markdown を上記の方針でサニタイズ済み
  hast ツリーに変換する。
- `rehypeMermaid(options?)` — Mermaid コードブロックを SVG に置き換える rehype
  プラグイン単体。
- `rehypeShiki(options?)` — コードブロックを Shiki でハイライトする rehype
  プラグイン単体。
- `rehypeHeadingLinks(options?)` — 見出しに `id` と自己リンクを付与し、
  ツリー内の全 id を上記のルールで clobbering 安全にする rehype
  プラグイン単体。全 id が出そろった最後に実行する。
- `markdownSchema` / `mermaidSvgSchema` / `shikiSchema` —
  それぞれの用途で使うサニタイズスキーマ。独自の unified パイプラインを組む際に
  再利用できる。`markdownSchema` は id をそのまま通すので、後段で
  `rehypeHeadingLinks` を必ず実行すること。
- `hastToHtml(hast, options?)` / `./hast_to_html.ts` — hast を HTML
  文字列に変換する。
- `hastToDom(hast, options?)` / `./hast_to_dom.ts` — hast を実 DOM
  ノードに変換する。
- `hastToElement(hast, createElement)` / `./hast_to_element.ts` — hast を
  `createElement` が作る要素ツリー（Remix UI など）に変換する。factory は
  呼び出し側が渡すので、このパッケージはどの UI ライブラリにも依存しない。
  **本体からは export されない**（エントリポイントを分けて、使わない利用側の
  グラフに入れないため）。
- `tocFromHast(hast)` / `./toc.ts` — hast
  から見出しの目次（`{ depth, id, text }[]`）を抽出する。

## Links

- JSR: <https://jsr.io/@kuboon/md>
- beautiful-mermaid: <https://github.com/lukilabs/beautiful-mermaid>
- Shiki: <https://shiki.style/>

## License

[MIT](./LICENSE)
