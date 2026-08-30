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
  方位記号+「Zukaku」ワードマークまで実装済み。都市名は印刷面から削除済み(パン後に
  ズレるため、ADR 0005)。
- `bvmap-dark`は日本国内専用(ビエンチャンで空白になることを実機確認、CLAUDE.md 3節)。
- **実ブラウザでの目視確認はユーザー自身が実施済み**(ビエンチャン・positron・2×2で
  実際にMake Atlasから本物のPRを起票し、Actionsが正しくレンダリングした)。
- **「Print in Browser」(ブラウザ内印刷モード)を追加**([ADR 0007](adr/0007-client-side-print-mode.md))。
  Playwright/GitHub Actionsを一切使わず、`window.print()`+CSS named pages
  (`@page`のportrait/landscape混在)だけでPDF化する第三の選択肢。同じ
  `computePages()`を再利用し、印刷面の装飾もPlaywright版と同等。実機検証済み。
  ユーザーからの評価を受け、ボタンを「Print」(青・主要)/「Share」(白・副次、
  Make Atlas改め)/「JSON」(白・副次、Download JSON only改め)に整理し、
  それぞれツールチップを追加(2026-08-31)。
- **印刷面のレイアウトを再設計**([ADR 0005](adr/0005-range-selection-ui-interaction-model.md))。
  タイトル/インデックスを図郭の外(上マージン)に移動、さらに上下左右すべて15mm
  均一マージンにして、スケールバーも図郭の外(下マージン)へ移動。方位記号は廃止し、
  地図の回転も禁止(回転すると概要ページのbbox算出が壊れる実バグの修正を兼ねる)。
  Playwright/Actions経路(`scripts/render/page.html`)とPrint in Browser経路
  (`docs/index.html`)の両方に同一のレイアウトを適用済み(2026-08-31)。
- **Save Paper機能を追加**([ADR 0008](adr/0008-save-paper.md))。グリッドの各セル
  中央のトグルボタンをクリックすると、そのセルを印刷対象から除外できる(海だけ・
  山だけといった「調査対象が無いページ」を省くため)。グリッド参照は位置から機械的に
  決まる設計のため、除外しても他セルの再番号付けは不要(単に欠番になる)。概要ページ
  では除外セルの輪郭を残しつつ薄くグレー塗りし、ラベルだけ非表示にする。両レンダリング
  経路に同一ロジックを実装し、実機検証済み(2026-08-31)。
- **概要ページのズームレベルシフトを実装**([ADR 0009](adr/0009-overview-zoom-level-shift.md))。
  概要ページを印刷フレームの`rows`×`cols`倍大きいオフスクリーンコンテナで
  レンダリングしてから通常サイズへ縮小することで、詳細ページと同じLOD(建物形状・
  道路ラベルなど)のベクトルタイルデータで描かれるようにした。印刷物の物理サイズ・
  縮尺は変わらない。範囲指定UIの対話的なライブ地図には適用しない(パフォーマンス
  維持のため、ユーザー指示)。両レンダリング経路(帯広3×3・2×3グリッド)で
  実機検証済み(2026-08-31)。

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

MVPとして把握していたタスク・実ブラウザ確認・unopengis/7への案内issue
([UNopenGIS/7#989](https://github.com/UNopenGIS/7/issues/989)、#986への回答として投稿済み)は
すべて完了。残っているのは優先度の低いものだけ:

- [ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md)の残タスク(フロントエンド
  一本化、PDFファイルサイズ最適化)。
- [ADR 0007](adr/0007-client-side-print-mode.md)の「Print in Browser」は実機検証済みだが、
  実際のユーザー操作(ボタンクリック→ブラウザの印刷ダイアログ→PDFとして保存)は
  Playwrightでの間接検証のみ。人間が実際にクリックしての確認はまだ。
- **TODO: 国土地理院std(画像タイル)スタイルの追加**(2026-08-31、ユーザー要望、
  Save Paper完了後に着手する前提で保留中)。左上のスタイル選択メニューに
  `bvmap-dark`/`positron`に加え、国土地理院の「std」画像タイルを使うスタイルを
  追加したい。注意点2つ: (1) stdは伝統的な256pxタイルであり、最近主流の512px
  ではない。(2) まだ`std.json`(MapLibreスタイルJSON)が存在しないため、まず
  zukaku側で`std.json`を作成し、それをstars(stars.optgeo.org、Martinベースの
  スタイルライブラリを運用している別セッション/エージェント)に依頼して
  Martinのスタイルライブラリに登録してもらう必要がある。登録後の
  `stars.optgeo.org/style/std`エンドポイントを`docs/index.html`の`#style-panel`
  (スタイル選択メニュー)から参照する形にする。

## 読むべき順序

1. [README.md](README.md) — プロジェクトの概要
2. [CLAUDE.md](CLAUDE.md) — 設計思想・スコープ(最初に読む)
3. このファイル — 現在の状態・次にやること
4. [DECISIONS.md](DECISIONS.md) — 「なぜこうなっているか」の索引
5. [adr/](adr/) — 各決定の詳細記録

## 実装詳細

- `scripts/render/` — ヘッドレスPDF生成(Node.js、Playwright、pdf-lib)。
  `npm install` 後、`node scripts/render/atlas.js --pages <config.json> --out atlas.pdf`。
- `docs/` — GitHub Pagesが配信するもの全て: `index.html`(範囲指定UI、GitHub Actions
  経由の「Make Atlas」とブラウザ内完結の「Print in Browser」の両方を持つ)、
  `requests/`(リクエストJSON)、`responses/`(生成PDF)。
- `Dockerfile` — `docker build -t zukaku . && docker run --rm -v "$PWD/out:/out" zukaku --pages scripts/render/sample-atlas.json --out /out/atlas.pdf`。
- `.github/workflows/atlas.yml` — `docs/requests/*.json`のpush/PRで自動レンダリング。
