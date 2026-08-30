# Handover

zukakuの現在の状態。次にこれを引き継ぐ人(人間でもAIでも)向け。

## 現状(2026-08-30時点) — MVPは実際にデプロイ・動作確認済み

調査・設計から実装、そして**実際のGitHub上へのデプロイ・動作確認まで完了**。
ADR 0001〜0006 の経緯は [DECISIONS.md](DECISIONS.md) を参照。

- スコープ・技術方針は [CLAUDE.md](CLAUDE.md) 参照。zukaku自身はMartin等のタイル
  サーバーを持たず、stars.optgeo.orgのデータをHeadless Chromium(Playwright)+
  MapLibre GL JS v6で直接レンダリングしてPDF化する([ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md))。
- 用紙はA4のみ(portrait/landscape切替必須)、当面10ページ程度の規模、選択可能スタイルは
  `bvmap-dark`(日本国内専用)/`positron`(グローバル)の2つ。terrainは常に無効化、
  fill-extrusion・globe投影は使わない([ADR 0004](adr/0004-terrain-and-fill-extrusion-policy.md))。

### レンダリングパイプライン([scripts/render/](scripts/render/)、[Dockerfile](Dockerfile))

- 単ページ・複数ページ結合(pdf-lib)・bbox→camera変換(MapLibre GL JSの
  `bounds`/`fitBoundsOptions`)・Docker実行、いずれも実機検証済み。詳細は
  [ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md)参照。
- **重要な落とし穴**: Playwrightの`page.pdf()`は生きたWebGLキャンバスを含められない。
  `canvas.toDataURL()`で画像化し`<img>`に差し替える必要がある([page.html](scripts/render/page.html))。
- maplibre-gl v6はESM専用。`<script type="module">`+`import { Map } from ".../maplibre-gl.mjs"`。

### 範囲指定UI([docs/index.html](docs/index.html)) — 公開中: https://dwg7.github.io/zukaku/

- Field Papers本家(`leaflet-page-composer.js`)を調査したインタラクションモデル
  (画面中央固定グリッド+地図パン)を実装([ADR 0005](adr/0005-range-selection-ui-interaction-model.md))。
- レイアウト: 左上=スタイル選択、右上=都市プリセット、上部中央=行列+/-と向き切替、
  左下=「Make Atlas」(GitHubの新規ファイルURLを開いてPR起票を促す)・
  「Download JSON only」(ローカル/Docker向け)。
- 概要ページ(A1/A2/B1/B2形式のグリッド参照)、8mm印刷マージン+図郭線+スケールバー+
  方位記号+「Zukaku」ワードマークまで実装済み。
- `bvmap-dark`は日本国内専用(ビエンチャンで空白になることを実機確認、CLAUDE.md 3節)。
- **未確認**: 実ブラウザでの目視確認(Playwrightでは確認済みだが、実際のChrome等では
  未確認)。**ユーザー自身が確認する予定**。

### GitHub Actionsパイプライン([.github/workflows/atlas.yml](.github/workflows/atlas.yml)) — 実際に動作確認済み

[ADR 0006](adr/0006-github-actions-render-pipeline.md)参照。`docs/requests/*.json`
(リクエスト)と`docs/responses/*.pdf`(生成結果、GitHub Pagesから直接開ける)を
ペアで管理。実際に`dwg7/zukaku`でpush・PR・マージまで実機検証し、以下の不具合を
発見・修正済み:

- `tj-actions/changed-files`がcontainerジョブ+pushイベントで失敗 → 「既に
  responseがあるリクエストはスキップ」方式に置き換え(冪等・蓄積耐性あり)。
- containerジョブのデフォルトシェルが`sh`(`shopt`が無い) → `shell: bash`明示。
- containerジョブの`safe.directory`問題 → `git config --global --add safe.directory`。
- `.gitignore`の`*.pdf`が`docs/responses/`もブロック → 例外パターンを追加。
- 同時実行のrace(2つのリクエストが近接してmainにpushされると`git push`が競合)
  → `concurrency`グループで直列化 + push直前に`git pull --rebase`。

## 次にやること

実ブラウザでの最終確認は**ユーザー自身が実施**。残りは以下の3件(優先度順):

1. **UXの磨き込み**: 「Make Atlas」を押す前に、ページ数(m×n+概要ページ)や
   おおよその生成時間の見込みを画面に表示する。現状はクリックするまで何ページに
   なるか数字でしか分からない(m/n表示はあるが「合計n+1ページ」等の明示は無い)。
2. **残りの実機検証**: GSI GitHub Pages等(`vbm`/`vlcm`系スタイルのglyphs/sprite)
   への外部ホスト依存が、実際のバッチ生成の安定性にどの程度影響するか。
   cache-busting用クエリの要否も未検証(ADR 0002の「検証が必要な事項」に記載)。
   現行スタイル(`bvmap-dark`/`positron`)では未確認、今後スタイルを追加する際に
   関わってくる可能性がある。
3. **保留した機能の記録**: ユーザーの判断で今回は見送った機能を記録しておく
   (「今はやめとく」であって「やらない」ではないため) — アトラスのタイトル/メモ
   入力機能、Actionsからリクエスト元へのメンション通知(ダウンロードを促す)。
   将来必要になったら、まずADRを起こしてから着手すること。

## 読むべき順序

1. [README.md](README.md) — プロジェクトの概要
2. [CLAUDE.md](CLAUDE.md) — 設計思想・スコープ(最初に読む)
3. このファイル — 現在の状態・次にやること
4. [DECISIONS.md](DECISIONS.md) — 「なぜこうなっているか」の索引
5. [adr/](adr/) — 各決定の詳細記録

## 実装詳細

- `scripts/render/` — ヘッドレスPDF生成(Node.js、Playwright、pdf-lib)。
  `npm install` 後、`node scripts/render/atlas.js --pages <config.json> --out atlas.pdf`。
- `docs/` — GitHub Pagesが配信するもの全て: `index.html`(範囲指定UI)、
  `requests/`(リクエストJSON)、`responses/`(生成PDF)。
- `Dockerfile` — `docker build -t zukaku . && docker run --rm -v "$PWD/out:/out" zukaku --pages scripts/render/sample-atlas.json --out /out/atlas.pdf`。
- `.github/workflows/atlas.yml` — `docs/requests/*.json`のpush/PRで自動レンダリング。
