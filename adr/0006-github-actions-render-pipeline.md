# ADR 0006: GitHub Actionsでのレンダリング、GitHubの「新規ファイル」URLでPRを起票

- ステータス: 採用・実装済み(GitHub上での実地動作はまだ未検証、下記「未検証」参照)
- 日付: 2026-08-30

## コンテキスト

[docs/index.html](../docs/index.html)(範囲指定UI、GitHub Pages予定、
[ADR 0003](0003-docs-reserved-for-github-pages.md))は静的ページであり、ヘッドレス
レンダラー([ADR 0002](0002-headless-chromium-maplibre-gl-js.md))を自分では
実行できない。これまでは「Make Atlas」で`atlas-pages.json`をダウンロードし、
人間が手元またはDockerで`scripts/render/atlas.js`に渡す、という二段構成だった。

ここで2つの疑問が持ち上がった:

1. ローカル実行の代わりに**GitHub Actions**でレンダリングを担わせられないか
   (ローカルにNode/Dockerが無い環境でも使えるようにしたい)。
2. その場合、「Make Atlas」から**直接PRやActionsを起票**できないか。ただし
   静的な公開ページに書き込み権限つきのGitHub認証情報を埋め込むことはできない
   (誰でも抜き取れてしまう、セキュリティ上の制約)。

## 決定

### GitHub Actionsでのレンダリング

`requests/*.json`(atlas-pages.json形式)へのpush/PRをトリガーに、
[.github/workflows/atlas.yml](../.github/workflows/atlas.yml)が
`scripts/render/atlas.js`を実行し、生成したPDFをworkflow artifactとして
アップロードする。ジョブのコンテナには`mcr.microsoft.com/playwright:v1.62.1-jammy`
(package.jsonの`playwright`バージョンと一致させる、[ADR 0002](0002-headless-chromium-maplibre-gl-js.md)と
同じイメージ)を使う。このイメージにはNode.jsが同梱されているため
(実機確認: v24.18.1)、`actions/setup-node`は不要とした。

### 「Make Atlas」からのPR起票

書き込み権限つきトークンを埋め込む代わりに、**GitHubが提供する
「新規ファイル作成」URL**(`https://github.com/{owner}/{repo}/new/{branch}?filename=...&value=...`)
を使う。「Make Atlas」ボタンはこのURLを組み立てて新しいタブで開くだけで、
認証は一切扱わない。開いた先はユーザー自身のログイン済みGitHubセッションであり、
ファイル名・内容が事前入力された状態でエディタが開く。ユーザーが
「Commit changes」する際、直接pushする権限が無ければGitHubが自動的に
「Create a new branch and start a pull request」を提案する(多くの静的サイトの
「Edit this page on GitHub」リンクと同じ仕組み)。

ダウンロードのみで完結させたい場合のために、「Download JSON only」ボタンも
別途残した(ローカル/Docker実行向け、[ADR 0002](0002-headless-chromium-maplibre-gl-js.md)の
経路)。

### JSON/PDFの置き場所

`requests/*.json`と、そこから生成されるPDFの置き場所について、ユーザーから
明示的な指示があった: **どちらも「tmp」のように扱ってよい、いつ消えても構わない
もの**とする。

- `requests/*.json` はGitにcommitされる(トリガーとして機能する必要があるため)が、
  永続的なアーカイブとしては扱わない。古いリクエストファイルは、いつでも削除・
  squash してよい。
- 生成されたPDFは**workflow artifactのみ**(デフォルトの保持期間、現状30日)とし、
  リポジトリにはcommitしない(`.gitignore`の`*.pdf`がそのまま効く)。GitHub
  Releaseのような永続化の仕組みは意図的に作らない — 「zukakuは新しいエンジンを
  持ちたくない/複雑にしたくない」という一連の判断([ADR 0002](0002-headless-chromium-maplibre-gl-js.md)等)
  と同じ理由で、過剰な作り込みを避けた。長期保存したいPDFがあれば、
  リポジトリの外(ローカル、別のストレージ)に保存するのはユーザーの仕事とする。

## 検証結果(2026-08-30)

- **Playwright + MapLibre GL JS + starsタイル読み込み + レンダリング + PDF保存が、
  Actions相当のコンテナで動くことを実機確認した。** `mcr.microsoft.com/playwright:v1.62.1-jammy`
  イメージにリポジトリをマウントし、クリーンな`npm ci`から
  `node scripts/render/atlas.js --pages requests/atlas-test.json --out requests/atlas-test.pdf`
  を実行したところ、5ページの有効なPDFが生成された(`pdfinfo`で確認)。これは
  実際のGitHub Actions ubuntu runner上でこのイメージをcontainerとして使った場合と
  同一の実行環境であるため、ワークフロー自体が動く可能性は高いと判断できる。
- **URL長の実測**: 5ページ(概要+2×2詳細)のJSONは圧縮後1,102バイト、URL全体で
  1,780文字。10ページ(概要+3×3詳細、CLAUDE.mdが定める当面の上限規模)でも
  URL全体で3,534文字にとどまり、モダンブラウザのURL長制限(数千〜数万文字)に
  対して十分な余裕がある。ユーザーの「zukakuのJSONはかなり小さいのでは」という
  指摘の通りだった。長さによるフォールバックの作り込みは不要と判断した。

## 未検証(次にやること)

- **実際のGitHub上での動作**は未検証。このセッションでは一度もcommit/pushを
  行っていない(zukaku自体がまだリモートにpushされていない)ため、
  「Make Atlas」→実際のGitHub「新規ファイル」画面→PR作成→Actions起動→
  workflow artifactのダウンロード、という一連の流れは実地では確認できていない。
  commit・pushの許可が得られ次第、実地で確認する。
- `tj-actions/changed-files`(変更ファイル検出に使用)の実際の動作は、ローカルの
  Dockerコンテナ実行では検証していない(GitHub Actions環境固有のコンテキストに
  依存するため)。一般的に広く使われているアクションではあるが、初回実行時に
  ログを確認すること。
- PRの承認・マージ運用(誰が承認するか、生成されたPDFをどこに保存・共有するか)は
  未検討。

## 影響

- `requests/`ディレクトリを新設([requests/README.md](../requests/README.md)参照)。
- `.github/workflows/atlas.yml`を新設。
- `docs/index.html`の「Make Atlas」ボタンの挙動が、単純なダウンロードから
  GitHub PR起票フローに変わった(ダウンロードは別ボタンとして維持)。

## 参考

- GitHub Docs: Creating new files (`/new/{branch}?filename=&value=`のURLパターン):
  多くの静的サイトジェネレータの「Edit this page」リンクが使う一般的な手法。
- tj-actions/changed-files: https://github.com/tj-actions/changed-files
