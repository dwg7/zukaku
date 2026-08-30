# ADR 0001: アトラスPDFのページ画像生成に使うヘッドレスレンダラーの選定

- ステータス: **Superseded by [ADR 0002](0002-headless-chromium-maplibre-gl-js.md)**
  (Martin自前ホストではなく、Headless Chromium + MapLibre GL JS を採用)
- 日付: 2026-08-30(2026-08-30に0002へ差し替え)

## コンテキスト

zukaku はスタイル・範囲(bbox)・ズームを指定してアトラスの各ページに対応する
静止画を書き出し、それをPDFページとして合成する。この「スタイル+bbox+zoom → 画像」の
変換を担うレンダラーをどう構成するかを決める必要がある。

候補を調査した結果は以下の通り。

### 選択肢A: `mbgl-render`(MapLibre Native 公式CLI)

- `maplibre/maplibre-native` リポジトリ内の公式CLIツール。C++。
- ソースからのビルドが基本(`cmake --preset linux-opengl && cmake --build ... --target mbgl-render`)。
  プリビルドバイナリの単体配布は確認できなかった。
- Dockerなどヘッドレス環境では X サーバーが存在しないため、`xvfb-run -a mbgl-render ...`
  のように Xvfb で仮想X serverを立てて実行するのが公式ドキュメントに記載された標準手順。
- スタイル・中心座標・ズーム・bbox・出力サイズをCLI引数で直接指定でき、要件に対して
  過不足がない。
- 最も「素」で枯れた選択肢だが、ビルド環境の構築(CMake、submodule一式)とXvfbの
  同梱が必要で、Dockerイメージがやや重くなる。

### 選択肢B: `mbgl-renderer`(consbio、Node.js)

- `@maplibre/maplibre-gl-native`(npm、2026年時点で活発にメンテナンスされている
  ことを確認済み)をラップしたCLI/HTTP/Node API。
- 公式Dockerイメージあり(`ghcr.io/consbio/mbgl-renderer` / `consbio/mbgl-renderer`)。
- ローカルMBTiles/PMTilesを直接指定でき、Web越しのタイル取得より高速。
- ただしこちらもコンテナ内では GL environment + Xvfb が必要で、選択肢Aに対して
  「Node.jsバインディングという依存レイヤーが一枚増える」だけで、レンダリング自体の
  制約(Xvfb必須)は変わらない。
- PDF合成をNode.js(pdf-lib)側に寄せるなら、スクリプト言語を統一できる利点はある。

### 選択肢C: `pymgl`(Python)

- MapLibre Native の Python バインディングによる静止画レンダラー。
- PDF合成をPython(ReportLab)側に寄せるなら、選択肢Bと同様に言語統一の利点がある。
- メンテナンス状況・Docker対応の実績は選択肢A/Bに比べて情報が薄く、要検証。

### 選択肢D: Martin 自身のスタイルレンダリング機能(`/style/{id}/{z}/{x}/{y}` および static API)

- Martin は2026年時点で、MapLibreスタイルをサーバーサイドでラスタライズする機能を
  開発中。実装済みのエンドポイントとして以下を確認:
  - `GET /style/<style_id>/{z}/{x}/{y}.{filetype}` — スタイルをXYZタイルとしてラスタライズ
  - `GET /style/{style_id}/static/{camera}/{size}.{ext}` — 単一の静止画(ベースマップのみ)
  - `POST /style/{style_id}/static/{camera}/{size}.{ext}` — GeoJSONオーバーレイ付き静止画
- 対応出力形式は `png` / `jpg` / `webp` のみ。**PDF/SVG出力は実装されていない**
  (MapLibreのロードマップ紹介ページには "PDF, SVG" が挙げられているが、これは
  ロードマップ全体の目標像であり、Martin本体の技術ドキュメント
  `martin/sources-styles/rendering` には出力形式として明記されていない。
  ロードマップページの記述を鵜呑みにせず、技術ドキュメントを優先して判断した)。
- レンダリングは Rust バインディング(`maplibre-native-rs`)経由と見られ、Linux上では
  デフォルトで EGL を使う設計。これが事実なら **Xvfb 不要**でヘッドレスレンダリングが
  完結する可能性があり、選択肢A/Bに対する明確な優位点になる(要検証)。
- 既知の制限: 現時点で **Linuxのみ対応**、**レンダリング結果のキャッシュなし**、
  **並行処理非対応**。開発中の機能であり、破壊的変更のリスクがある。
- zukaku は既にタイル配信にMartinを使う前提であり、この機能を使えば「スタイル+bbox+zoom
  → PNG」の変換をMartin一つに集約でき、mbgl-render/mbgl-renderer/pymglのような
  追加のネイティブバインディング層を持ち込まずに済む。

## 決定

**選択肢D(Martinの静止画レンダリングエンドポイント、特に `static` API)を第一候補として
採用する。ただし zukaku 専用の Martin インスタンスを自前で立てる(stars.optgeo.org の
共有本番インスタンスには委譲しない)。**

2026-08-30、stars.optgeo.org 担当セッション(stars-fd)への聞き取りにより、Xvfb不要と
いう点は**実運用で確認済み**になった(下記「starsからの知見」参照)。一方で、starsが
過去に同機能を有効化して無効化した経緯から、以下が明らかになっている:

1. `static` API(`/style/{style_id}/static/{camera}/{size}.{ext}`、Martin v1.11.0以降)
   はzukakuが使いたいエンドポイントそのものだが、**stars側でも未検証**。zukakuが最初に
   実機検証する必要がある。中心座標+ズーム+サイズ指定に見えるため、bboxから中心・ズーム・
   ピクセルサイズへの変換をzukaku側で行う前提で設計すること。
2. XYZタイル形式のエンドポイント(`/style/{id}/{z}/{x}/{y}`)は出力512×512px固定で
   変更不可という制約が実運用で確認されているが、**zukakuはこのエンドポイントを使わない**
   (個々のタイルを合成するのではなく、ページ単位の静止画を`static` APIで直接書き出す
   設計のため、この制約は無関係)。
3. キャッシュなし・並行処理非対応という制約は実運用で負荷として確認済み(load average
   0.5→3.87、Martin CPU使用率76.8%)。**大量ページのバッチ生成は持続的な高負荷になる
   前提で設計する**(zukaku専用インスタンスなら許容できるが、共有インスタンスに委譲すると
   他テナントに影響する)。
4. 印刷に耐える解像度(高DPI)で書き出せるかは未検証のまま。

検証の結果、`static` APIが bbox変換の精度・解像度のいずれかで要件を満たさない場合は、
**選択肢A(`mbgl-render` 公式CLI、Xvfb併用)にフォールバックする。**
選択肢B・Cは、PDF合成層の実装言語(Node.js/pdf-lib か Python/ReportLab か)が
決まった時点で、その言語との親和性のみを理由に再検討する程度の優先度とする。

**stars.optgeo.orgへの委譲(選択肢E)は不採用。** starsは現在vbm/vlcm/kaga/height-coverage
等、他プロジェクトの生きたトラフィックを単一プロセスで捌いており、キャッシュが効かない
性質上バッチ的な連続レンダリングを委譲すると他利用者に持続的な負荷影響が及ぶ。委譲する
ならstars本番とは別の専用インスタンスが前提になるが、それは実質的に「zukaku専用インスタンス
を自前で立てる」のと運用コストが変わらないため、素直に自前で立てる。

## 根拠

- Martin は zukaku のタイル配信基盤としてどのみち採用が既定路線であり(README/CLAUDE.md
  参照)、静止画生成も同じプロセスに集約できれば、ビルド・デプロイの複雑さを最小化できる。
- mbgl-render/mbgl-renderer はいずれもXvfbによるX server偽装が必須で、Docker環境での
  セットアップが煩雑になる。Martinの`rendering` Cargo featureはMartin 1.10.1〜1.14.0の
  時点でデフォルト有効かつEGLヘッドレスで完結することが、stars.optgeo.orgの実運用
  (Debian 13 / Raspberry Pi OS)で確認されている。この煩雑さを丸ごと回避できる見込みが
  高い。
- ただしMartinの当該機能はまだ発展途上(キャッシュ・並行処理非対応、Linux限定、
  実運用での高負荷が確認済み)であり、「大縮尺アトラスを数十〜百ページ規模でバッチ生成する」
  というzukakuの主要ユースケースに性能面で耐えられるかは、専用インスタンスを立てた上で
  改めて実測が必要。過信せず、選択肢Aを明確なフォールバックとして残す。
- 共有本番環境(stars)への委譲は、性能特性(キャッシュなし=負荷がテナント間で分離
  できない)が委譲向きでないため見送る。

## 影響

- PDF合成層(pdf-lib vs ReportLab)の決定は、レンダラー選定と切り離して別途ADRとする。
  Martinの静止画APIはHTTP経由で叩けるため、合成層の言語選択に対して中立。
- Dockerfile設計は、選択肢Dが有効なら「Martin一つを動かせればよい」という単純な構成に
  なる。選択肢Aへのフォールバックが必要になった場合は、maplibre-nativeのビルド依存
  (CMake、submodule、Xvfb)をDockerイメージに追加する必要がある。
- この決定は実機未検証の段階での「調査に基づく仮決定」である。検証結果次第で
  ADR 0002 として結論を上書きすることを想定する。

## kaga0からの知見(EGL/software rendering、2026-08-30時点)

kaga0担当セッションに相談したところ、以下の知見を得た(kaga0側のADR 0010/0014・
実機ビルドログに基づく報告)。zukakuの検証時に参照すること。

- kaga0は当初「Raspberry PiのVideoCore GPUにはmaplibre-native用のハードウェア
  GLES3パスが無く、software rendering(llvmpipe)必須」という上流ドキュメント
  (maplibre-native-slintのRASPBERRY_PI.md)を前提にしていたが、これは実際には
  SPI接続(GPU/KMS無し)機体向けの記述であり、HDMI接続・V3D GPU搭載機には
  誤適用だった。kaga0は最終的にハードウェアGL(V3D)に切り替えている。
  **zukakuはDockerでディスプレイ無し・純粋headless前提であり、競合する別の
  GLコンシューマも存在しないため、この誤適用は当てはまらず、素直にsoftware GL
  (llvmpipe)ルートで問題ない**とのこと。
- `maplibre_native` Rustクレート(Martinが依存する`maplibre-native-rs`の下層)は、
  crates.io公開の初期バージョン(0.8.2、Cargo.lock固定値)ではOpenGL利用時に
  **無条件でX11/GLXを要求**しており、EGL選択ロジックが未反映だった。`0.8.7`
  以降でEGLがデフォルトになりGLXはオプトイン化されている。**Martinのビルドが
  古いバージョンを固定していると、結局Xvfbが必要になる**ため、選択肢Dの
  優位性(Xvfb不要)を検証する際は依存クレートのバージョンを最初に確認すること。
- 素朴な `eglGetDisplay(EGL_DEFAULT_DISPLAY)` 呼び出しでは `eglInitialize()` が
  失敗するケースがあった。`EGL_PLATFORM=surfaceless` 環境変数で通ることもあるが、
  kaga0では最終的に `eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA, ...)`
  を明示的に呼ぶC++側パッチ(`headless_backend_egl.cpp`)が必要だった。
  Martinの実装がこのあたりをどう扱っているかは未確認 — 素の状態で動かない場合の
  フォールバック手がかりとして記録しておく。
- 同一プロセス内で複数のEGLコンシューマ(GBM経由のハードウェアGLコンテキストと
  surfacelessコンテキストなど)が共存するとsegfaultした事例があるが、これは
  kaga0特有の構成(Slint UI + 地図描画が同一プロセス)によるものであり、
  **Martin単体プロセスでの利用であれば再現しない可能性が高い**。
- kaga0はDockerでの実行を検証しておらず(bare metal Raspberry Pi OS上での運用)、
  コンテナに必要なMesaパッケージ名等については知見なし。zukaku側で別途確認が必要。

## 参考

- MapLibre Native Linux platform docs: https://maplibre.org/maplibre-native/docs/book/platforms/linux/index.html
- mbgl-renderer (consbio): https://github.com/consbio/mbgl-renderer
- pymgl: https://github.com/brendan-ward/pymgl
- Martin — server-side raster tile rendering: https://maplibre.org/martin/sources-styles/rendering/
- Martin roadmap — Style Rendering(目標像。技術ドキュメントと食い違う記述があるため
  参考程度に扱うこと): https://maplibre.org/roadmap/martin-tile-server/style-rendering/
- maplibre-native-rs (Rust bindings): https://github.com/maplibre/maplibre-native-rs
