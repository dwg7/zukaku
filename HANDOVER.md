# Handover

zukakuの現在の状態。次にこれを引き継ぐ人(人間でもAIでも)向け。

## 現状(2026-09-10時点) — MVPは実際にデプロイ・動作確認済み、印刷パイプラインの外部ライブラリ化が進行中

調査・設計から実装、そして**実際のGitHub上へのデプロイ・動作確認まで完了**。
ADR 0001〜0006 の経緯は [DECISIONS.md](DECISIONS.md) を参照。2026-09-10、
zukakuの印刷パイプラインを[dwg7/maplibre-gl-atlas](https://github.com/dwg7/maplibre-gl-atlas)
という汎用ライブラリへ切り出す3PR計画([dwg7/zukaku#8](https://github.com/dwg7/zukaku/issues/8))の
PR 2(`docs/index.html`の消費側切り替え)まで完了。詳細は[ADR 0012](adr/0012-consume-maplibre-gl-atlas-library.md)と
下の該当節、残タスクは「次にやること」参照。

- スコープ・技術方針は [CLAUDE.md](CLAUDE.md) 参照。zukaku自身はMartin等のタイル
  サーバーを持たず、stars.optgeo.orgのデータをHeadless Chromium(Playwright)+
  MapLibre GL JS v6で直接レンダリングしてPDF化する([ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md))。
- 用紙はA4のみ(portrait/landscape切替必須)、当面10ページ程度の規模、選択可能スタイルは
  `bvmap-dark`(日本国内専用・ベクタ)/`positron`(グローバル・ベクタ)/`std`
  (日本国内専用・ラスタ、[ADR 0010](adr/0010-gsi-std-raster-style.md))の3つ。
  terrainは常に無効化、fill-extrusion・globe投影は使わない
  ([ADR 0004](adr/0004-terrain-and-fill-extrusion-policy.md))。

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
- **国土地理院「標準地図」(std)ラスタタイルをスタイル選択肢に追加**
  ([ADR 0010](adr/0010-gsi-std-raster-style.md))。`bvmap-dark`/`positron`に並ぶ
  3つ目のスタイル。stars.optgeo.orgにまだstyle.jsonが無かったため、zukaku側で
  `styles/std.json`を新規作成しhfu/starsにPRを起票([hfu/stars#6](https://github.com/hfu/stars/pull/6)、
  マージ・Martin再起動・本番反映済み)。`docs/index.html`側の変更はスタイル選択
  ボタン1つの追加のみ。実機検証済み(2026-08-31)。
- **実機報告2件への対応**(2026-08-31、[dwg7/zukaku](https://github.com/dwg7/zukaku/issues)の
  open issue分析・計画に基づく)。いずれもPlaywrightでは再現できない、実ブラウザの
  印刷パイプライン特有の挙動が疑われたため暫定対応はPlaywrightでの回帰確認のみで
  出していたが、**2026-09-01にユーザーが実機(macOS Brave / Windows Edge・Chrome)で
  再確認し、いずれも解消していることを確認済み**:
  - [issue #4](https://github.com/dwg7/zukaku/issues/4)(概要ページのスケールバーの乱れ):
    ADR 0009のオフスクリーンステージのCSS配置を、極端な負のオフセットから
    `opacity:0`+`pointer-events:none`の一般的な手法に変更。
    [ADR 0009追記](adr/0009-overview-zoom-level-shift.md#追記2026-08-31-概要ページのスケールバーが乱れる不具合と暫定対応)参照。
  - [issue #2](https://github.com/dwg7/zukaku/issues/2)(Windows Edge/Chromeでの
    印刷レイアウト崩れ): プラットフォーム判定(`navigator.userAgentData.platform`)で
    印刷CSS戦略を切り替え。非Windowsは従来通り(名前付きページ混在、macOS Brave
    での動作は完全不変)、Windowsのみ単一`@page`+`transform:rotate(90deg)`方式に
    切り替えてOS印刷ドライバの向き切替バグを回避。
    [ADR 0007追記](adr/0007-client-side-print-mode.md#追記2026-08-31-windows-edgechromeでの印刷レイアウト崩れと対応)参照。
- **地図の状態をURLで共有可能に**([ADR 0011](adr/0011-shareable-state-via-document-fragment.md)、
  [issue #3](https://github.com/dwg7/zukaku/issues/3))。MapLibreの`hash:"map"`
  (地図の位置・ズーム)に、zukaku独自のフィールド(行列数・向き・スタイル・
  タイトル・Save Paperの除外セル)を同じ`location.hash`に同居させる形で追加。
  Playwrightで往復テスト(状態作成→hash取得→再アクセスで復元)を実施し、
  すべてのフィールドが正しく復元されることを確認済み。
- **概要ページのインデックスラベルを拡大・白背景化**([ADR 0005追記](adr/0005-range-selection-ui-interaction-model.md#インデックスラベルの拡大白背景化2026-09-01)、
  [issue #5](https://github.com/dwg7/zukaku/issues/5))。ズームレベルシフト
  (ADR 0009)により地図コンテンツと一緒に縮小されてしまっていたグリッド参照
  ラベル(A1、A2、...)の`text-size`を`renderScale`で補正し、`Zukaku`/`概要`の
  見出しと同程度の大きさに。背景も`text-halo-width`(クリップされ背景らしく
  見えない)から`icon-image`+`icon-text-fit`による単色白背景に変更し、
  Field Papers同様の黒字・白背景を実現。両レンダリング経路でPlaywright検証済み
  (印刷パイプラインには手を入れない変更のため実機再確認は不要と判断)。
- **`rows=1`のような偏ったグリッドで概要ページだけ回転してしまう問題を修正**
  ([ADR 0007追記](adr/0007-client-side-print-mode.md#追記2026-09-01-rows1のような偏ったグリッドでの印刷が乱れる報告)、
  [issue #6](https://github.com/dwg7/zukaku/issues/6))。issue #2で入れた
  `strategy-rotate`(Windows)は、詳細ページ全員と向きが食い違う概要ページを
  自動的に90°回転させて単一の物理向きに収める——`rows=1`のような向きの偏った
  グリッドでは概要ページの最適向きが詳細ページと常に食い違うため、この回転が
  常態化し、「その1枚だけ用紙を横向きにしないと読めない」状態になっていた
  (バグではなく設計通りの動作だったが、体験として「印刷が乱れた」と感じられた)。
  strategy-rotateが選ばれる場合に限り、概要ページの向きをグリッドの最適
  アスペクト比ではなく詳細ページと同じ向きに固定し、そもそも回転が発生しない
  ようにした。strategy-mixed(非Windows)は無変更。**2026-09-03、Windows Edge
  実機で解消を確認済み**(issueクローズ済み)。
- **正方形でないグリッドで概要ページのアスペクト比が崩れる不具合を修正**
  ([ADR 0009追記](adr/0009-overview-zoom-level-shift.md#追記2026-09-03-正方形でないグリッドで概要ページのアスペクト比が崩れる不具合と修正)、
  [issue #7](https://github.com/dwg7/zukaku/issues/7))。ズームレベルシフトの
  オフスクリーンステージは幅を`cols`倍・高さを`rows`倍と軸ごとに別々の係数で
  拡大するため、そのキャンバスのアスペクト比は`cols===rows`のときしか表示先の
  固定A4ボックスと一致しない。`object-fit: fill`ではこのズレがそのまま地図の
  引き伸ばしとして出ていた——issue #6とは独立に、ADR 0009導入時点から存在した
  不具合。`object-fit: contain`に変更し、ズレがあっても地図コンテンツは常に
  正しい縦横比で描画され、はみ出す分は余白として吸収されるようにした。両
  レンダリング経路でPlaywright検証済み(CSSレイアウトの一般的な修正であり、
  issue #2/#4/#6と異なり特定OS・ブラウザの印刷ドライバに依存する話ではないため、
  実機再確認は必須ではないと判断)。

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

### `docs/index.html`の「Print in Browser」を`@dwg7/maplibre-gl-atlas`の消費に切り替え(2026-09-10)

[dwg7/zukaku#8](https://github.com/dwg7/zukaku/issues/8)の3PR計画のうち、
PR 1([dwg7/maplibre-gl-atlas](https://github.com/dwg7/maplibre-gl-atlas)
本体の構築)に続くPR 2を実施。詳細は[ADR 0012](adr/0012-consume-maplibre-gl-atlas-library.md)・
[DECISIONS.md D17](DECISIONS.md)参照。

- `preparePrintPages()`・印刷用CSS(`@page`混在戦略・ヘッダー/フッター帯)・
  `viewportPxFor()`・`isLikelyWindows()`をすべて削除し、`AtlasControl`
  (`showButton:false`、確認ダイアログなしで`atlasControl.print()`を直接呼ぶ)
  に置き換えた。`addOverviewGridLayers()`は`AtlasSheet.decorate`フックとして
  そのまま残した(ロジック無変更)。
- **`computePages()`(bbox算出・Save Paper、Share/JSON/Actions向け)は完全に
  無変更のまま維持**。新規`computeSheets()`がその返り値を`AtlasSheet[]`へ
  変換する薄いアダプタとして「Print」ボタン専用に追加された——
  `scripts/render/atlas.js`(PR 3で移行予定、まだ未着手)が読む
  `docs/requests/*.json`のスキーマには一切影響しない。
- **概要ページの向きを、Print経由の描画に限り常に`state.orientation`に
  一致させるよう変更**(`computePages()`自身のアスペクト比自動選択は
  Share/JSON向けに無変更のまま)。これによりD15(issue #6、Windows専用の
  概要ページ向き固定という回避策)が実質的に不要になった——概要ページが
  最初から全ページと同じ向きになるため、`strategy-rotate`の「少数派を
  回転」ロジックがそもそも発動する場面が無くなる。
- npm未公開のため、`docs/vendor/maplibre-gl-atlas.js`(+`.js.map`)に
  ビルド成果物を手動配置する暫定措置(maplibre-gl-atlas自身のデモと同じ
  パターン)。npm公開後はunpkg importに切り替え予定。

**実機検証(Claude Browserプレビューペイン)**: `window.print`をスタブして
検証。(1) 1行×1列・positron・帯広で印刷し、概要ページに描画された
グリッド矩形+「A1」ラベル(白背景付き)を画像として確認、スケールバーの
幅も概要/詳細で異なる妥当な値(30m/91.66px、20m/69.9px)であることを確認。
(2) 1行×3列・portrait・中央セルをSave Paperで除外して印刷し、生成された
3シート(概要/A1/A3、A2は正しく欠番)が**すべて`portrait-page`**になる
ことを確認(修正前なら概要だけ`landscape-page`になっていたはずの
ケース)。(3) 同じ状態で「JSON」ボタンから`computePages()`の生データを
確認し、概要ページの`orientation`が引き続き`"landscape"`(Share/Actions向け
ロジックは無変更)であることも確認——Print経由とShare/JSON経由で異なる
向き判定が共存し、互いに影響しないことを実証した。(4) `showButton:false`
のため地図右上に空のコントロール箱が現れないことも確認。実際のユーザー
操作(印刷ダイアログの完了まで)はまだ確認していない。

## 次にやること

MVPとして把握していたタスク・実ブラウザ確認・unopengis/7への案内issue
([UNopenGIS/7#989](https://github.com/UNopenGIS/7/issues/989)、#986への回答として投稿済み)は
すべて完了。[dwg7/zukaku#8](https://github.com/dwg7/zukaku/issues/8)の
3PR計画はPR 1・PR 2完了、残るはPR 3のみ:

- **PR 3(`scripts/render/`のPlaywright/GitHub Actions経路)は設計調査のみ
  完了、実装は保留・hfuさんの承認待ち**——[ADR 0013](adr/0013-playwright-pipeline-atlascontrol-migration.md)
  (提案中)参照。`docs/index.html`(PR 2)と違い、単なる置き換えでは
  済まない: 現行の`scripts/render/lib.js#renderPage()`は「1ページ=1つの
  独立したPlaywright `BrowserContext`+個別`page.pdf()`」を`atlas.js`が
  `pdf-lib`で結合する設計だが、`AtlasControl.prepare()`は「1つのページに
  全シートを構築し、`page.pdf()`を1回だけ呼ぶ」ことを前提にしている——
  前提そのものが異なるため、`atlas.js`/`lib.js`/`page.html`の実質的な
  書き直しになる。これは実際にGitHub Actions上で稼働し
  `docs/responses/*.pdf`をpublicに生成している本番パイプラインであり、
  CLAUDE.md 7節の「大きな設計判断は実装より先にADR案を提示し、承認を
  得てから着手する」に該当すると判断し、ADR 0013に設計案・検討事項・
  検証計画をまとめた上で実装を止めている。次に着手する場合はADR 0013の
  承認から。
- `@dwg7/maplibre-gl-atlas`のnpm公開(`NPM_TOKEN`設定、`v0.1.0`タグ)後、
  `docs/index.html`のimportをunpkg経由に切り替え、`docs/vendor/`を削除する
  (現在は暫定的にビルド成果物を手動配置——maplibre-gl-atlas自身のHANDOVER.md
  参照)。
- `docs/index.html`の「Print in Browser」(現在は`AtlasControl`経由)は
  Claude Browserプレビューでのクリックスルー検証まで完了だが、実際の
  ユーザー操作(ボタンクリック→ブラウザの印刷ダイアログ→PDFとして保存)は
  未確認。ADR 0012適用前からの既知の制約(旧ADR 0007の記述)がそのまま
  引き継がれている。
- [ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md)の残タスク(フロントエンド
  一本化、PDFファイルサイズ最適化)。
- issue #2〜#7、すべて対応・クローズ済み。#4・#2・#6は実機確認で解消を確認済み、
  #5・#7はPlaywright検証のみで完了扱い(印刷ドライバ等プラットフォーム固有の話
  ではない一般的な修正のため実機再確認は必須としなかった)。現時点でopenな
  issueは無し。

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
