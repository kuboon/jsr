# jsr

[JSR](https://jsr.io/@kuboon) に公開している Deno パッケージのモノレポ。
各パッケージは 1 ディレクトリ = 1 パッケージで、ルートの Deno ワークスペースに
まとめてある。

## Packages

| Package                                                                     | ディレクトリ                                      | 説明                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| [@kuboon/kv](https://jsr.io/@kuboon/kv)                                     | [`kv/`](./kv)                                     | バックエンド非依存の Key-Value ストア抽象                                       |
| [@kuboon/md](https://jsr.io/@kuboon/md)                                     | [`md/`](./md)                                     | Mermaid/Shiki 対応の unified ベース Markdown → HTML 変換                        |
| [@kuboon/file-server-behavior](https://jsr.io/@kuboon/file-server-behavior) | [`file-server-behavior/`](./file-server-behavior) | GitHub Pages / Vercel の静的ファイル配信ルールをエミュレート                    |
| [@kuboon/onboarding-kit](https://jsr.io/@kuboon/onboarding-kit)             | [`onboarding-kit/`](./onboarding-kit)             | JSON シナリオで動く、フレームワーク非依存のプロダクトツアー用カスタムエレメント |
| [@kuboon/qrcode-gen](https://jsr.io/@kuboon/qrcode-gen)                     | [`qrcode-gen/`](./qrcode-gen)                     | ゼロ依存の QR コードエンコーダ(モジュール配列を返すのみ)                        |
| [@kuboon/tailwindcss-deno](https://jsr.io/@kuboon/tailwindcss-deno)         | [`tailwindcss-deno/`](./tailwindcss-deno)         | Tailwind CSS v4 を Deno で動かす `@tailwindcss/node` 相当                       |

## 開発

```sh
# 全パッケージのテスト
deno task test
```

## 新しいパッケージの追加

1. ルートに新しいディレクトリを作り、`deno.json`（`name` / `version` /
   `exports`）を置く。
2. ルート `deno.json` の `workspace` にそのディレクトリを追加する。
3. この README の Packages 表に 1 行足す。

リリースは `.github/workflows/release.yml` が自動で行う。main への push 時に
パッケージディレクトリを自動検出し、`deno.json` の `name@version` タグが未作成の
ものだけ JSR へ publish してタグを打つ。ワークフロー自体を編集する必要はない。

## License

[MIT](./kv/LICENSE)
