# ADR 0002: ページレンダリングとPDF生成を Headless Chromium + MapLibre GL JS に統合する

- ステータス: 採用(ADR 0001 を supersede)
- 日付: 2026-08-30(2026-08-30中にSwisstopo事例の追加調査・プラットフォーム選定を反映)

## コンセプト

zukakuの設計は次の一文に集約できる:

> **インタフェースとアウトプットは Field Papers、プロセスは Swisstopo、技術は MapLibre。**

- **インタフェース/アウトプット(Field Papers)**: 地図上でアトラスの範囲を指定する
  UI、そして印刷して現場に持ち出せるアトラスPDFという最終成果物の体験は、Field Papers
  が確立した優れたモデルをそのまま踏襲する(スキャンバックは除く、CLAUDE.md参照)。
- **プロセス(Swisstopo)**: 「スタイル+bbox+zoom → 画像 → PDF」という変換の
  実装方式は、Swisstopo(スイス連邦測地局)がMapFish Printの後継として検討した
  「Headless Chrome + Puppeteer/Playwright + Node.js」パターンを踏襲する(下記
  「Swisstopo事例の詳細調査」参照)。
- **技術(MapLibre)**: 地図描画エンジンそのものはMapLibre GL JS。スタイル・
  タイル・スプライト・グリフは姉妹プロジェクト stars.optgeo.org(Martin)から取得する。

## コンテキスト

[ADR 0001](0001-headless-rendering-approach.md) では Martin の静止画レンダリングAPI
(選択肢D)を採用候補とし、zukaku専用のMartinインスタンスを自前ホストする方針とした。
しかし以下の懸念が積み重なり、方針を見直した。

- zukaku専用のMartinインスタンスを持つこと自体が、ユーザーにとって新たな「常設で
  管理すべきエンジン」の運用負担になる(stars以外にもう一つ複雑なエンジンを持ちたくない、
  というユーザーの明示的な指摘)。
- kaga0の実例([ADR 0001内「kaga0からの知見」](0001-headless-rendering-approach.md#kaga0からの知見egl-software-rendering2026-08-30時点)参照)
  から、MapLibre Native の EGL ヘッドレスレンダリングは依存クレートのバージョン起因の罠、
  `eglGetPlatformDisplay` の明示指定が必要になるケース、同一プロセス内の複数EGL
  コンシューマでのsegfaultなど、ハマりやすい領域であることが分かっている。
- stars.optgeo.org が過去にMartinの `rendering` 機能を有効化して無効化した経緯があり
  ([ADR 0001内「starsからの知見」](0001-headless-rendering-approach.md)参照)、原因は
  XYZタイル512px固定によるタイル継ぎ目の不整合(fieldpapers本家の既知issueと同症状)と、
  キャッシュ非対応による持続的高負荷だった。「レンダリング専用機能」自体が発展途上で
  罠が多いことが実運用で裏付けられている。
- ユーザーから「PDF作成エンジンと合わせて考えるべきでは。ヘッドレスブラウザでPDFに
  ダンプする方が良いのでは」という提案があった。

## 決定

**Martin(自前ホストも含め)を一切使わず、Headless Chromium(Playwright) +
MapLibre GL JS の組み合わせで、レンダリングとPDF生成を1つのエンジンに統合する。**

構成の骨子:

- zukaku は MapLibre GL JS を動かす Web アプリを持つ。これは対話的な「範囲指定UI」
  (Field Papers 由来、CLAUDE.md 参照)と、ヘッドレスな「ページ画像/PDF生成」の両方で
  同じフロントエンドコードを使い回せる可能性が高い(対話モードとヘッドレスモードの違い)。
- スタイル・ベクタタイル・スプライト・グリフは stars.optgeo.org
  (例: `https://stars.optgeo.org/style/bvmap-dark`、`.../positron`)から直接fetchする。
  CORSは実機確認済み(下記「CORS/負荷の実機確認結果」参照)。
- アトラスの各ページごとに、Playwrightでカメラ(center/zoom/bearing、または
  `fitBounds`相当のbbox指定)をセットし、タイル読み込み完了(`idle`イベント)を待って
  から、そのページを `page.pdf()`(または canvas スクリーンショット)で書き出す。
  全ページ分を最後に pdf-lib でマージして最終的なアトラスPDFを作る。
- zukaku自身はMartinを一切運用しない。stars.optgeo.orgの「通常のタイル/スタイル配信」
  (不安定な `rendering` 機能ではない)だけに依存する。

## 根拠

1. **運用負担の削減**: zukaku専用のMartinインスタンスという「新しい常設エンジン」を
   持たずに済む。headless Chromiumは Playwright公式Dockerイメージなど実績豊富で、
   EGL/Xvfb/クレートバージョンの罠が原理的に存在しない。
2. **実績のある先行事例**: スイス連邦測地局(Swisstopo)がほぼ同一の構成
   (Headless Chrome + Puppeteer + Node.js + MapLibre GL JS/OpenLayers、HTMLベースの
   印刷フレーム)を検討・報告しており、従来のMapFish Print等で問題だった「タイル継ぎ目
   でのテキスト欠け」をWYSIWYGな全画面キャンバスレンダリングで解消できると報告している
   ([FOSS4G Europe 2025](https://talks.osgeo.org/foss4g-europe-2025/talk/JRTHPX/))。
   これはstarsが実際にハマった「512px固定タイル継ぎ目」問題と同じ症状であり、この
   アーキテクチャが直接その問題を回避できることを裏付けている。詳細は下記
   「Swisstopo事例の詳細調査」参照。
3. **starsとの摩擦回避**: starsの `rendering` 機能(不安定・キャッシュなし)には
   依存しない。通常のスタイル/タイル/スプライト/グリフ配信はCloudflareエッジで
   `cache-control: max-age=14400` によりキャッシュされ、原点(Raspberry Pi実機)への
   到達は初回アクセス時のみであることをstars-fdが実機確認済み。zukakuのアトラスは
   当面10ページ程度が前提(ユーザー確認済み、2026-08-30)であり、この規模なら
   負荷は問題にならない見込み(実測でも1ページ3〜5秒程度、下記「検証結果」参照)。
4. **レンダリングとPDF生成の一体化**: 別々の静止画レンダラー+別のPDF合成ライブラリ
   (pdf-lib/ReportLab)という2層構成ではなく、Headless Chromiumが両方を担う。ページの
   レイアウト(スケールバー・方位記号・ページ番号などのField Papers由来の装飾)も
   HTML/CSSで自然に表現できる。
5. **UIの再利用**: Field Papers由来の「地図上で範囲を指定するUI」と同じMapLibre GL JS
   ベースのWebアプリを、対話モードとヘッドレスモードで使い回せる可能性が高い。

## CORS/負荷の実機確認結果(stars-fd、2026-08-30)

- `https://stars.optgeo.org/style/bvmap-dark`、`.../positron` のスタイルJSON・
  ベクタタイル・TileJSONいずれも、Originヘッダーを送ると `access-control-allow-origin`
  がOrigin反射で返る(ワイルドカードではない)。素のcurlでは見えないので注意。
- 外部ホストされたglyphs/sprite(GSI GitHub Pages、OpenMapTiles GitHub Pages、
  tile.openstreetmap.jp)はいずれも `access-control-allow-origin: *`。
- 通常配信は `cache-control: max-age=14400` でCloudflareエッジキャッシュされ、
  `cf-cache-status: HIT`/`REVALIDATED` を確認。原点到達は初回MISS時のみ。
- production(stars)はRaspberry Pi単体のため、瞬間的な大量初回リクエストの並行実行は
  多少の負荷になる。必要なら生成前ウォームアップ(該当範囲のタイルを一度舐めておく)を
  検討する。

## Swisstopo事例の詳細調査(2026-08-30)

FOSS4G Europe 2025の発表「PDF Map Generation as Headless Chrome Service」を深掘りした。

- 発表者は **Dominik Frey**([Camptocamp](https://camptocamp.com/)所属と見られる)。
  Camptocampは MapFish Print(Swisstopoの現行印刷サービス `service-print` が使う
  レガシーな印刷エンジン、Java/Tomcat)自体のメンテナ格の専門ベンダーであり、
  「レガシーなMapFish Printから何が課題で、なぜHeadless Chrome方式に価値があるか」を
  語る立場として信頼度が高い。
- geoadmin(Swisstopo)組織のGitHub上で `service-print`(MapFish Print v2ベース、
  Java 7/Tomcat/Flask、**Archived**)は確認できたが、発表で言及されたHeadless Chrome版の
  後継サービスは、2026-08-30時点の調査では**公開リポジトリを発見できなかった**
  (社内実装、または未公開の可能性がある)。したがって本ADRの採用根拠は、発表内容と
  一般に確立されたパターン(後述)の両方に基づく、という前提を明記しておく。
- 発表内容によれば、採用動機は「オンラインの地図表示(MapLibre GL)とWYSIWYGで一致する」
  「高負荷下でも安定」「AWS上でスケールする」「レイアウトをHTML/CSSで自由に設計できる」
  の4点。これらはzukakuの要件(印刷品質の一致、バッチ生成時の安定性、ページレイアウトの
  柔軟性)とよく一致する。
- 同種のパターン(Headless Chromium + MapLibre GL JS/OpenLayers でのタイルレンダリング・
  スクリーンショット取得)は、Swisstopo固有の事例に留まらず、`simple-static-map-server`
  や `MapGrab`(MapLibre GL JSアプリのPlaywrightテストツール)、個人ブログでの実装例
  など、広く確立されたパターンであることも確認した。単一の事例に依存した判断ではない。
- **プラットフォーム選定(Puppeteer vs Playwright)**: 2026年時点の実務比較記事によれば、
  新規プロジェクトではPlaywrightの方が有利(TypeScript型定義の充実、リリースサイクルの
  速さ、`page.pdf()`のヘッダー/フッターテンプレート等PDF固有オプションのドキュメントの
  充実度)。Swisstopoの発表ではPuppeteerが使われていたが、zukakuでは**Playwrightを
  採用する**([参考](https://pdf4.dev/blog/playwright-vs-puppeteer-pdf)参照)。

## GitHub Pagesでの範囲指定UIホスティング

範囲指定UI(対話モード)は [ADR 0003](0003-docs-reserved-for-github-pages.md) により
GitHub Pages(`docs/`)でホストする方針とした。理由:

- stars.optgeo.orgへの直接fetchはCORS対応済みで、バックエンドを必要としない静的SPAとして
  成立する見込みが高い。
- ユーザーの指摘の通り、GitHub Pagesは固定オリジンを持つため、ローカル開発サーバー
  (ポートやプロトコルが実行のたびに変わりうる)よりCORSまわりの挙動が安定しやすい。
- 「新たな常設サーバーを運用したくない」というADR 0002の根拠1と一貫する。

ヘッドレスなPDF生成(Playwright)側からもこの同じGitHub Pages上のUIを(URLパラメータで
bbox/style/ページ設定を渡した上で)読み込んで `page.pdf()` する構成にできれば、
フロントエンドの実装を完全に一本化できる可能性がある(要検証)。

## kaga0からの追加指摘(2026-08-30)

方針転換をkaga0担当セッションに報告した際、以下2点の指摘を受けた。

1. **glyphs/spriteの外部ホスト依存**: `vbm`/`vlcm`/`bvmap-dark` 系スタイルの
   glyphs/spriteは stars.optgeo.org 自体ではなく `gsi-cyberjapan.github.io/optimal_bvmap/...`
   (GitHub Pages)を直接参照している(starsはフォント・スプライトを自前配信していない)。
   Headless ChromiumがMapLibre GL JS経由でこれをそのままfetchするため、**PDF生成のたびに
   stars.optgeo.orgだけでなく外部のGitHub Pagesへの依存も発生する**。バッチ用途での
   安定性・再現性を重視するなら、この外部依存(可用性・応答時間)も考慮に入れる必要がある。
2. **キャッシュ鮮度**: stars.optgeo.orgはCloudflareエッジで最大4時間キャッシュされる
   (`cache-control: max-age=14400`)。styleやtileを更新した直後にアトラスを生成すると
   古いキャッシュを掴む可能性があるため、鮮度が重要なタイミングでは
   cache-busting用クエリ文字列(例: `?cb=<timestamp>`)を付けてfetchすることを検討する。

## 検証結果(2026-08-30、[scripts/render/](../scripts/render/) の最小実装で確認)

- ✅ **A4単ページのPlaywright + `page.pdf()`実装は成立する。** ただし
  **重大な落とし穴**が見つかった: **Playwrightの`page.pdf()`(Chromiumの印刷パイプライン)
  は、生きたWebGLキャンバス(MapLibre GL JSの描画そのもの)を正しく含められない。**
  `map.once("idle")`後に素直に`page.pdf()`しても、出力PDFは地図部分が完全に白紙になる
  (実機確認: 33KBの空PDFを生成し、ラスタライズして目視で確認)。
  **ワークアラウンド**: idle後に `canvas.toDataURL("image/png")` でキャンバスを
  スナップショットし、`<img>` 要素に差し替えてから `page.pdf()` を呼ぶことで解決した
  (差し替え後は3.5MBの正しい地図入りPDFが得られ、ラスタライズして目視でも確認済み)。
  これはSwisstopo事例が「HTMLベースの印刷フレーム」という表現をしていた理由の一つと
  考えられる(単純に生きたWebGL地図をそのまま印刷しているのではなく、キャンバスを
  画像化してHTML/CSSレイアウトに埋め込んでいる可能性が高い)。**zukakuの実装では
  必ずこのスナップショット差し替えを行うこと。**
- ✅ `deviceScaleFactor: 3` で高DPI出力を確認(A4 794×1123 CSS px 基準で実効
  約288dpi相当)。文字・線とも十分にシャープ。ファイルサイズは1ページ約3.5MB
  (deviceScaleFactorとPNG埋め込みが主要因、ページ数が増えると肥大化するため
  将来的にJPEG化や scale の調整を検討する余地あり)。
- ✅ A4ページサイズは `page.pdf({width:'210mm', height:'297mm', ...})`
  (portrait)/`{width:'297mm', height:'210mm', ...}`(landscape)で正確に出力される
  (`pdfinfo`で595.92×841.92pt / 841.92×595.92ptを確認、210mm×297mmと一致)。
- ✅ `bvmap-dark` / `positron` 両スタイルで描画・PDF化を確認。`bvmap-dark`は
  GSI GitHub Pagesのglyphs依存(kaga0からの指摘)を含むが、現時点では問題なく動作した。
- ✅ 所要時間(1ページ、ローカル環境、ネットワーク越しにstars.optgeo.orgへアクセス):
  map idleまで約2.7〜4.9秒、PDF書き出しまで含めて合計約3.1〜5.3秒。ユーザーからの
  「アトラスは当面10ページ程度」という前提なら、逐次実行でも合計1分未満で収まる見込み。
  並行処理・キャッシュ非対応でも許容範囲。

## 検証結果その2(2026-08-30、[scripts/render/atlas.js](../scripts/render/atlas.js))

- ✅ **複数ページのpdf-libマージ**: `render.js`の描画ロジックを`lib.js`に切り出し、
  1つのPlaywrightブラウザを使い回して複数ページを描画、`pdf-lib`の`copyPages`で
  1つのPDFに結合する実装を確認。3ページ(bbox指定portrait/center+zoom指定landscape/
  bbox指定portraitのbvmap-dark、スタイル混在)を約9.6秒で生成し、ラスタライズして
  全ページ目視確認済み。
- ✅ **bbox → camera変換**: 自前で変換ロジックを書かず、MapLibre GL JSの
  コンストラクタオプション `bounds` + `fitBoundsOptions`(内部的に`fitBounds()`相当)に
  委譲する実装で正しく動作することを確認(`page.html`参照)。指定したbboxがページ内に
  収まる形で描画される(アスペクト比保持のため、ページの縦横比とbboxの縦横比が
  一致しない場合は指定範囲より広く映る辺が出る、これはfitBoundsの標準的な挙動)。

## 補足: maplibre-gl v6への追従(2026-08-30)

当初v4系で実装したが、ユーザーの指摘で最新のv6系(6.6.0)に上げた。v6は**UMDバンドル
(`dist/maplibre-gl.js`、グローバル`maplibregl`)を廃止し、ESM専用(`dist/maplibre-gl.mjs`、
名前付きexport `Map`)になっている**ため、`<script src="...">`ではなく
`<script type="module">`+`import { Map } from "...maplibre-gl.mjs"`に書き換える
必要があった([scripts/render/page.html](../scripts/render/page.html)で対応済み)。
また、globe投影モードは使わず`projection: "mercator"`を明示している(ADR 0004と同じ
理由: 3D的な歪みは貼り合わせ前提のアトラスに不向き)。

## 検証結果その3(2026-08-30、[Dockerfile](../Dockerfile))

- ✅ **Docker上での動作**: `mcr.microsoft.com/playwright:v1.62.1-jammy`(npm
  package.jsonの`playwright`バージョンと一致させる必要がある)をベースに、
  `npm ci`→`scripts/`をコピーするだけの単純なDockerfileでビルド・実行に成功。
  Xvfbや追加のGL関連パッケージのインストールは一切不要だった(ADR 0001で懸念していた
  EGL/GLXまわりの罠は、公式イメージが吸収してくれている)。コンテナ内で
  `sample-atlas.json`の3ページ生成が約12.5秒(ホスト実行の約9.6秒よりやや遅いが、
  同オーダー)。

## 検証が必要な事項(未実施、優先度低)

1. GSI GitHub Pages等、stars以外の外部ホストへの依存が、バッチ生成の安定性に
   実際どの程度影響するか(可用性・レイテンシの実測、必要ならミラー/キャッシュの検討)。
2. cache-busting用クエリの要否・付与方法(常時付けるか、明示的な再生成時のみか)。
3. GitHub Pages上の範囲指定UIを、ヘッドレスPDF生成からも読み込んでフロントエンドを
   一本化できるか。
4. ページ枚数が増えた場合のPDFファイルサイズの最適化(PNG→JPEG、deviceScaleFactorの
   調整など)。ただし当面10ページ程度という前提では優先度は低い。

## 影響

- ADR 0001(Martin静止画API採用)は本ADRにより **superseded**。ADR 0001は調査記録・
  比較検討の経緯として残すが、決定としては本ADRを優先する。
- 技術スタックからMartin(自前ホスト分)が外れる。zukaku側の `Dockerfile` は
  Playwright/Chromium前提になる。タイル配信基盤としてのMartin(CLAUDE.md初期方針)は、
  stars.optgeo.org が既にMartinで配信しているため、zukakuが重複して持つ必要がなくなった。
- PDF合成層の選定(pdf-lib vs ReportLab)は、Playwrightと同じNode.jsエコシステムである
  pdf-libが第一候補になった(別途確定が必要)。
- CLAUDE.mdの技術スタック方針を本ADRの内容に合わせて更新する必要がある。

## 参考

- PDF Map Generation as Headless Chrome Service (Dominik Frey / Camptocamp,
  FOSS4G Europe 2025): https://talks.osgeo.org/foss4g-europe-2025/talk/JRTHPX/
- geoadmin/service-print(Swisstopoのレガシー印刷サービス、MapFish Print v2、Archived):
  https://github.com/geoadmin/service-print
- Playwright vs Puppeteer for PDF generation (2026年の実務比較):
  https://pdf4.dev/blog/playwright-vs-puppeteer-pdf
- Playwright PDF生成: https://www.checklyhq.com/docs/learn/playwright/generating-pdfs/
- stars.optgeo.org (hfu/stars): https://github.com/hfu/stars
- [ADR 0003](0003-docs-reserved-for-github-pages.md)(範囲指定UIのGitHub Pages配置)
