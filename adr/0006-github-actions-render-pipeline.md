# ADR 0006: GitHub Actionsでのレンダリング、GitHubの「新規ファイル」URLでPRを起票

- ステータス: 採用・実装済み・実際のGitHub上で動作確認済み
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

`docs/requests/*.json`(atlas-pages.json形式)へのpush/PRをトリガーに、
[.github/workflows/atlas.yml](../.github/workflows/atlas.yml)が
`scripts/render/atlas.js`を実行する。ジョブのコンテナには
`mcr.microsoft.com/playwright:v1.62.1-jammy`(package.jsonの`playwright`
バージョンと一致させる、[ADR 0002](0002-headless-chromium-maplibre-gl-js.md)と
同じイメージ)を使う。このイメージにはNode.jsが同梱されているため
(実機確認: v24.18.1)、`actions/setup-node`は不要とした。

**変更ファイル検出には`tj-actions/changed-files`を使わない。** 当初使っていたが、
`container:`ジョブの中で`push`イベント時にのみ(`pull_request`では同じ設定で
成功するにもかかわらず)"Unable to locate the git repository"で失敗することが
実機検証で判明した(下記「検証結果」参照)。原因を深追いする代わりに、
**`docs/requests/*.json`のうち、対応する`docs/responses/<name>.pdf`がまだ
無いものだけをレンダリングする**という、git diffに依存しないシンプルな方式に
した。これは冪等かつ自己制限的で、`docs/requests/`が際限なく増えても
(ユーザーからの懸念、下記参照)、実際にレンダリングが走るのは「まだ結果が
無いリクエスト」だけになる。

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

最初は「`requests/*.json`もPDFも、どちらも"tmp"のように扱ってよく、PDFは
workflow artifactのみでリポジトリにはcommitしない」という設計にしていた。
その後、ユーザーとの議論で以下のように変わった:

- **`docs/requests/*.json` と `docs/responses/*.pdf` をペアで`docs/`配下に置く。**
  `docs/`はGitHub Pagesが配信するディレクトリ([ADR 0003](0003-docs-reserved-for-github-pages.md))
  なので、PDFがそこに置かれていれば`https://dwg7.github.io/zukaku/responses/<name>.pdf`
  という安定したURLで直接開ける。「印刷して持ち出す」というzukakuの目的に対して、
  Actions UIでartifactのzipを探してダウンロードするより遥かに実用的。
  リクエストとレスポンスが同じ名前([docs/requests/README.md](../docs/requests/README.md)・
  [docs/responses/README.md](../docs/responses/README.md)参照)でペアになるので、
  どのPDFがどのリクエストから生まれたかも辿れる。
- PDFの**commitはpushイベントのみ**(PRの間はartifactだけ)で行う。PRレビュー中に
  中間版を何度もcommitしないようにするため。マージ(push)されて初めて
  `docs/responses/`にPDFがcommitされ、Pagesに反映される。
- 「いつ消えても構わない」という当初の精神は維持しつつ、「掃除を頻繁にしないと
  破綻する」という設計は避けた。ユーザーから「`docs/requests/`に100個溜まったら
  まずいのでは、定期的に掃除するのか」という懸念があったため、
  **既に対応する`docs/responses/*.pdf`があるリクエストは再レンダリングしない**
  (上記「GitHub Actionsでのレンダリング」参照)ようにし、蓄積そのものは
  性能問題を起こさない設計にした。掃除は「やっても構わないが、必須ではない」。

## 検証結果(2026-08-30、実際のdwg7/zukakuリポジトリで実施)

- **ローカル事前確認**: `mcr.microsoft.com/playwright:v1.62.1-jammy`イメージに
  リポジトリをマウントし、クリーンな`npm ci`から`atlas.js`を実行したところ、
  5ページの有効なPDFが生成された。
- **実際のGitHub Actionsで動作確認済み**。commit・pushの許可を得て、実際に
  `dwg7/zukaku`へpush、テスト用ブランチ・PRを作成して動作を確認した:
  - PRトリガー(`pull_request`): 初回から成功。`atlas-pdfs`というworkflow
    artifact(約2.7MB、5ページ)が生成され、`gh run download`で取得・
    `pdfinfo`で有効性を確認した。
  - pushトリガー(`push`): 当初**失敗**した。原因は`tj-actions/changed-files`が
    `container:`ジョブ内で`push`イベントの場合のみ"Unable to locate the git
    repository"エラーを出すこと(`pull_request`では同一設定で成功)。この
    アクションへの依存自体をやめ、「既に結果があるリクエストはスキップする」
    方式に置き換えて解決した(上記「決定」参照)。
  - 置き換え後の実装でも一度失敗した: コンテナジョブのデフォルトシェルが
    `sh`(dash)であり、`shopt`(bash専用のビルトイン)が無かったため
    (`shopt: not found`, exit code 127)。該当ステップに`shell: bash`を
    明示して解決した。
  - 最終的に、push・pull_request両方のトリガーで成功することを確認した。
  - GitHub Pages(`https://dwg7.github.io/zukaku/`)も有効化し、HTTP 200・
    正しい`<title>`で配信されていることを確認した。
- **URL長の実測**: 5ページ(概要+2×2詳細)のJSONは圧縮後1,102バイト、URL全体で
  1,780文字。10ページ(概要+3×3詳細、CLAUDE.mdが定める当面の上限規模)でも
  URL全体で3,534文字にとどまり、モダンブラウザのURL長制限(数千〜数万文字)に
  対して十分な余裕がある。ユーザーの「zukakuのJSONはかなり小さいのでは」という
  指摘の通りだった。長さによるフォールバックの作り込みは不要と判断した。

## 未検証・今後の課題

- 「Make Atlas」ボタンからGitHubの新規ファイル画面を開き、実際にユーザー自身が
  ブラウザ上でcommit・PR作成する、という最後の一手(UIからの実クリック)は
  未検証。URL構築自体はPlaywrightで確認済み(意図通りのGitHub URLが開かれ、
  未ログイン状態では`github.com/login?return_to=...`に正しくリダイレクトされる
  ことを確認)だが、実際にログイン済みユーザーがボタンを押すところまでは
  今回のセッションでは検証していない。
- PRの承認・マージ運用(誰が承認するか)は未検討。テスト用のPR・ブランチは
  検証後に削除する。

## 影響

- `docs/requests/`・`docs/responses/`ディレクトリを新設
  ([docs/requests/README.md](../docs/requests/README.md)・
  [docs/responses/README.md](../docs/responses/README.md)参照)。
- `.github/workflows/atlas.yml`を新設。`contents: write`権限を持つ
  (push時にレスポンスPDFをcommitし直すため)。
- `docs/index.html`の「Make Atlas」ボタンの挙動が、単純なダウンロードから
  GitHub PR起票フローに変わった(ダウンロードは別ボタンとして維持)。

## 参考

- GitHub Docs: Creating new files (`/new/{branch}?filename=&value=`のURLパターン):
  多くの静的サイトジェネレータの「Edit this page」リンクが使う一般的な手法。
- tj-actions/changed-files: https://github.com/tj-actions/changed-files
