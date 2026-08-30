# ADR 0003: `docs/` はGitHub Pages(範囲指定UI)用に予約し、ADRは `adr/` に置く

- ステータス: 採用
- 日付: 2026-08-30

## コンテキスト

[ADR 0002](0002-headless-chromium-maplibre-gl-js.md) により、zukakuはField Papers由来の
「地図上でアトラスの範囲を指定するUI」を、ヘッドレスなページレンダリングと同じ
MapLibre GL JSベースのWebアプリとして持つ方針になった。

この対話的な範囲指定UIは、stars.optgeo.orgのスタイル/タイルをブラウザから直接fetchする
だけで完結する(CORSはOrigin反射で許可されることを実機確認済み、ADR 0002参照)ため、
バックエンドを必要としない静的サイトとして成立する可能性が高い。ユーザーからは
「自分でlocalhostを立ち上げるより、GitHub Pagesでホストした方がCORSなどの問題に
当たりにくくなる可能性がある」という指摘があった。GitHub Pagesは安定した固定オリジン
(`https://dwg7.github.io/zukaku/`)を持ち、ローカル開発サーバーのようにポートや
プロトコル(http/https)が変わらないため、CORSまわりの再現性・開発体験の面でも有利。

GitHub Pagesの伝統的な設定方法の一つは、リポジトリの `main` ブランチの `docs/` フォルダを
公開ルートとして指定する方式である。一方、zukakuは既に `docs/decisions/` にADRを
置き始めていた(その後 [ADR 0002](0002-headless-chromium-maplibre-gl-js.md) 策定と
同日に本ADRで見直し)。両者は同じ `docs/` を取り合う形になり、共存させるとGitHub Pagesの
公開ルートにADRという開発者向け文書が混在してしまう。

## 決定

**`docs/` は GitHub Pages でホストする範囲指定UI専用とする。ADR(設計判断の記録)は
リポジトリ直下の `adr/` に置く。**

- dwg7の他プロジェクト(kaga0など)は慣例的に `docs/decisions/` を使っているが、
  zukakuはこの慣例から意図的に外れる。理由は上記の通り、`docs/` をGitHub Pagesの
  公開ルートとして使いたいため。
- `DECISIONS.md`(索引)からのリンクは `adr/000X-*.md` を指す。
- 範囲指定UIの実装自体はまだ着手していない(要ADR)。本ADRは「置き場所」のみを
  先に決めるものであり、UIの技術選定(ビルドツール、フレームワークの要否など)は
  別途検討する。

## 根拠

- GitHub Pagesは静的サイトホスティングとして十分に枯れており、zukakuの範囲指定UIが
  「stars.optgeo.orgを直接fetchするだけの静的SPA」で成立するなら、追加のサーバー運用
  (「新たな常設エンジンは持ちたくない」というADR 0002と同じ運用負担への配慮)が
  不要になる。
- ローカル開発サーバー(localhost)は起動のたびにポートが変わりうる、http/httpsが
  混在しうる、等の理由でCORSまわりの挙動確認がぶれやすい。GitHub Pagesの固定オリジンは
  この点で有利。
- `docs/decisions/` という dwg7 の慣例と `docs/` = GitHub Pages公開ルートという要件が
  衝突するため、慣例より今回の実利(GitHub Pagesを使う)を優先した。

## 影響

- 既存の `docs/decisions/0001-*.md`、`docs/decisions/0002-*.md` は `adr/0001-*.md`、
  `adr/0002-*.md` に移動済み。CLAUDE.md・HANDOVER.md・DECISIONS.md 内のリンクも
  `adr/` に更新済み。
- 今後 zukaku で新しいADRを書く際は `docs/decisions/` ではなく `adr/` に置くこと。
- `docs/` 配下に開発者向けドキュメントを置かないこと。範囲指定UIのソース
  (HTML/JS/CSS、あるいはビルド後の静的ファイル)専用とする。
- リポジトリの GitHub Pages 設定(Settings → Pages → Source: Deploy from a branch,
  Branch: main, Folder: /docs)を有効化する作業は、範囲指定UIの実装に着手する段階で
  行う(未実施)。

## 参考

- GitHub Pages: Publishing a project site from a `/docs` folder:
  https://docs.github.com/en/pages
