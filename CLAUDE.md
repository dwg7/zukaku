# zukaku (図郭)

## 1. 概要

zukaku は [Field Papers](https://fieldpapers.org/)(GPLv2+, OpenStreetMap US)の
現代的な再発明です。Headless Chromium 上で MapLibre GL JS を動かし([ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md)参照)、
フィールド調査用の印刷アトラスPDFを生成することに特化しています。地図データ(スタイル・
ベクタタイル・スプライト・グリフ)は姉妹プロジェクトの [stars.optgeo.org](https://stars.optgeo.org)
から直接取得し、zukaku自身はタイルサーバーを持ちません。Field Papers が持っていた
「地図上でアトラスの範囲を指定するUI」は優れた体験だったため移植し、範囲指定 →
ページレンダリング → PDF合成、という一連の流れを提供します。

「地図を配信する」のではなく「地図を紙で持ち出す」ことがゴールです。

設計は一言で言うと: **インタフェースとアウトプットは Field Papers、プロセスは
Swisstopo、技術は MapLibre**([ADR 0002のコンセプト節](adr/0002-headless-chromium-maplibre-gl-js.md#コンセプト)参照)。

## 2. 背景・動機

Field Papers は「印刷して持ち出し、書き込んで、スキャンして戻す」というワークフローを
提供していましたが、開発が長らく停止しています。zukaku はこのうち「印刷して持ち出す」
部分だけを、現代のOSSタイルスタック(MapLibre GL JS + stars.optgeo.orgのMartin)で
再構築します。スキャンバック(QRコードでのデジタル復元)は意図的に対象外とし、印刷
アトラスPDF生成にスコープを絞ることで、実装とメンテナンスのコストを最小化します。

当初はzukaku自身がMartin+MapLibre Nativeのヘッドレスレンダリングを持つ構成
([ADR 0001](adr/0001-headless-rendering-approach.md))を検討していましたが、
「新たな常設エンジンを運用する負担」「MapLibre NativeのEGLヘッドレスレンダリングは
罠が多い(姉妹プロジェクトkaga0の実例)」「starsが同種の機能で過去にハマった経緯」を
踏まえ、[ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md) で
Headless Chromium + MapLibre GL JS の構成に切り替えました。

## 3. スコープ(重要)

- **対象**: 印刷して現場に持ち出すための、大縮尺のアトラスPDF生成のみ。
- **対象外**: QRコードでのスキャンバック・OCR・座標復元の仕組み。Field Papers にあった
  「デジタルに戻す」機能は一切実装しません。
- **対象外**: 小縮尺・広域俯瞰図。1ページあたり最小ズームレベル(目安 z12 以上)を
  設計上の制約とし、Webメルカトルの歪みが顕在化する広域図は最初から対象にしません。
  これは技術的制約ではなく、意図的なスコープ設計です。
- 上記の境界を越える機能追加の提案があった場合は、まず ADR を書いてスコープ変更の
  是非を明示的に検討してください。
- **公開範囲**: `dwg7/zukaku` はpublicリポジトリで、`docs/`はGitHub Pagesがそのまま
  配信する。`docs/requests/`(リクエストJSON)・`docs/responses/`(生成PDF)は
  誰でも無期限に閲覧できる。Field Papersにはアトラスを非公開にする機能があったが、
  zukakuでは意図的に実装しない([ADR 0006](adr/0006-github-actions-render-pipeline.md))。
  非公開・アクセス制御が必要になったら、その時点で別途ADRを起こすこと。
- **範囲指定UI**: Field Papers の「地図上でアトラスの範囲(bbox・用紙サイズ・縮尺)を
  指定するUI」を移植する方針。詳細設計はこれから(要ADR)。
- **選択可能なスタイル(当面)**: [stars.optgeo.org](https://stars.optgeo.org)(hfu/stars)
  がホストするスタイルのうち `bvmap-dark` と `positron` の2つに限定してよい。
  スタイル追加はstars側へのPR(hfu/starsのCONTRIBUTING.md参照)が必要になる想定。
  **`bvmap-dark`は国土地理院(GSI)の`optimal_bvmap`データに基づく日本国内専用**
  (実機確認済み、2026-08-30: ビエンチャンで表示すると完全に空白になる)。
  `positron`はグローバル(OSM planet)データで、日本国外にも対応。
- **用紙サイズ(当面)**: A4のみ。ただし portrait/landscape の切り替えは必須。
- **アトラスの規模(当面)**: 1アトラスあたり10ページ程度を前提にしてよい
  (大量並列処理や高度なキャッシュ戦略を先回りして作り込む必要はない)。
- **3D表現(terrain・fill-extrusion)**: ページを物理的に貼り合わせる用途上、
  透視投影による継ぎ目のズレを防ぐため、terrainは常に無効化する。fill-extrusionは
  当面「未定義」(対応しない)とする。詳細は[ADR 0004](adr/0004-terrain-and-fill-extrusion-policy.md)参照。

## 4. 姉妹プロジェクト kaga0・stars との関係

[dwg7/kaga0](https://github.com/dwg7/kaga0) は火山地図を表示する専用アプライアンスです。
[ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md)以降、zukakuは
MapLibre Native ではなく MapLibre GL JS を使うため、レンダリング実装そのものは
kaga0と共有しません(MapLibre Nativeまわりの罠についてはkaga0から知見をもらいましたが、
それを踏まえて別の実装を選んだ、という関係です)。ただし両者とも MapLibre スタイル仕様と
ベクタタイルという同じエコシステムの上に立っており、性格は明確に異なります。

| | kaga0 | zukaku |
|---|---|---|
| 出力 | 画面への「表示」(DRM/KMS) | PDFファイルの「生成」(バッチ) |
| レンダラー | MapLibre Native(ハードウェアGL/V3D) | MapLibre GL JS(Headless Chromium) |
| 実行環境 | Raspberry Pi 実機、専用アプライアンス | Docker、CI/バッチ実行 |
| 特権アクセス | 必要(DRM/KMS、フレームバッファ) | 不要 |

[hfu/stars](https://github.com/hfu/stars)(stars.optgeo.org)は Martin でタイル・
スタイルを配信する共有基盤で、zukaku はここから地図データを取得する「利用者」の
立場です。zukaku自身はMartinを運用しません(ADR 0002参照)。スタイル追加や設定変更が
必要な場合はhfu/starsへのPRベースで依頼します(hfu/starsのCONTRIBUTING.md参照)。
starsのバッチ的な大量アクセスによる負荷は実機確認済み(ADR 0002参照)ですが、他プロジェクト
(vbm/vlcm/kaga/height-coverage等)と共有の本番環境である点は常に意識してください。

zukaku は画面表示や特権的なハードウェアアクセスを必要としないため、kaga0 と違って
Docker化の障害がありません。

## 5. 技術スタック方針

現行の決定は [ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md) 参照
(未検証事項も同ADRに列挙されている)。

- **レンダリング**: Headless Chromium(Playwright) 上で MapLibre GL JS を動かし、
  ページごとにカメラをセットしてタイル読み込み完了を待ってから `page.pdf()`(または
  canvasスクリーンショット)で書き出す。zukaku自身はMartin等のタイルサーバーを持たない。
- **地図データの取得元**: [stars.optgeo.org](https://stars.optgeo.org) のスタイルJSON・
  ベクタタイル・スプライト・グリフをブラウザから直接fetchする(CORS対応済み・実機確認済み)。
  当面選択できるスタイルは `bvmap-dark` と `positron` の2つ(CLAUDE.md 3節参照)。
- **範囲指定UI**: MapLibre GL JS ベースのWebアプリ(対話モード)。ヘッドレスなページ
  レンダリングと同じフロントエンドコードを使い回せる可能性が高い(モードの違いのみ)。
- **PDF合成**: Playwrightの `page.pdf()` で1ページずつ書き出し、pdf-lib で全ページを
  マージする案が第一候補(Node.jsエコシステムで完結するため)。まだ確定ではない。
- **実行環境**: Docker を基本とする。Playwright公式Dockerイメージを起点にする想定。
  zukaku は画面表示を必要としないため、kaga0と違ってDocker化の障害がない。

技術選定は決まり次第、必ず `adr/` に ADR として残すこと。

## 6. ドキュメント体系・ディレクトリ構成方針

dwg7組織の他プロジェクト(kaga0など)にならい、以下の4ファイルを標準セットとする。

| ファイル | 目的 | 読む時期 |
|---|---|---|
| [README.md](README.md) | プロジェクトの概要とクイックスタート | 最初 |
| CLAUDE.md(このファイル) | 設計思想・スコープ・技術方針 | 最初 |
| [HANDOVER.md](HANDOVER.md) | 現在の完成度・実装状態・次にやること | 2番目、引き継ぎ時 |
| [DECISIONS.md](DECISIONS.md) | 「なぜこうなっているか」の索引(一段落要旨+リンク) | 疑問が生じたとき |

- `adr/` — ADR(Architecture Decision Record)。技術選定や設計判断の詳細な
  根拠を1決定1ファイルで記録する。`DECISIONS.md` はこの索引であり内容を複製しない。
  dwg7の他プロジェクトでは慣例的に `docs/decisions/` を使うが、zukakuは `docs/` を
  GitHub Pages用に予約するため意図的に `adr/` とした([ADR 0003](adr/0003-docs-reserved-for-github-pages.md)参照)。
- `docs/` — **GitHub Pages でホストする範囲指定UI(Field Papers由来の対話的な
  地図アプリ)専用**。他の用途に使わない([ADR 0003](adr/0003-docs-reserved-for-github-pages.md))。
- `Dockerfile` — バッチ実行(ヘッドレスPDF生成)用のコンテナ定義。
- `scripts/` — セットアップ・レンダリング・PDF合成などの自動化スクリプト。
- PMTiles/MBTiles の実データはリポジトリに含めない(`.gitignore` 対象)。zukaku自身は
  タイル実データを持たない設計(ADR 0002)のため、該当する可能性は低い。

大きな設計判断を行ったら、必ず `adr/` にADRを追加し、`DECISIONS.md` に
一段落の要旨とリンクを追記し、`HANDOVER.md` の状態を更新すること。

## 7. 作業分担

- Claude Code: スクリプト・ドキュメント作成、調査・設計判断の整理、ADRの起草、実装。
- 人間(fujimura.hidenori@gmail.com): 生成されたPDFの実地検証(実際に印刷して現場で
  使えるか)、スコープや設計判断の最終承認。

大きな設計判断(技術選定、スコープの拡張・縮小)は、実装より先に ADR 案を提示し、
人間の承認を得てから着手すること。

## 8. 現在のステータス

詳細・最新状態は [HANDOVER.md](HANDOVER.md) を参照。概要:

- CLAUDE.md / HANDOVER.md / DECISIONS.md 作成済み。
- ページレンダリング方式の調査・意思決定を行い、[ADR 0001](adr/0001-headless-rendering-approach.md)
  (Martin静止画API、superseded)→ [ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md)
  (Headless Chromium + MapLibre GL JS、採用)という経緯を記録済み。Swisstopo事例の
  深掘り調査によりPlaywright採用まで具体化。ドキュメント配置は
  [ADR 0003](adr/0003-docs-reserved-for-github-pages.md) で `adr/`(ADR)と
  `docs/`(GitHub Pages予定の範囲指定UI)に分離済み。
- **レンダリングパイプラインの実機検証がほぼ完了**: [scripts/render/](scripts/render/)
  (単ページ・複数ページのpdf-libマージ・bbox→camera変換)と[Dockerfile](Dockerfile)
  (Playwright公式イメージ、Xvfb不要を確認)まで一通り動作確認済み。terrainの
  常時無効化(ADR 0004)も実装済み。重要な落とし穴として「`page.pdf()`は生きたWebGL
  キャンバスを含められない、`canvas.toDataURL()`での画像化が必須」を発見・実装済み
  (詳細はHANDOVER.mdとADR 0002参照)。
- Field Papers本家の範囲指定UI実装を調査し、インタラクションモデル(画面中央固定
  グリッド+地図パン)を[ADR 0005](adr/0005-range-selection-ui-interaction-model.md)
  として記録し、[docs/index.html](docs/index.html)に実装済み(スタイル/都市選択、
  m×n・向き切替、概要ページ+A1/A2/B1/B2形式のグリッド参照、8mmマージン+図郭線+
  スケールバー+方位記号)。**UI→JSON→`atlas.js`のend-to-endを実機検証済み**
  (帯広グリッドで隣接タイリングされた正しいPDFを生成できることを確認)。
- **GitHub Actionsでのレンダリング**を[ADR 0006](adr/0006-github-actions-render-pipeline.md)
  として採用・実装済み。`docs/requests/*.json`のpush/PRをトリガーに
  `.github/workflows/atlas.yml`が`atlas.js`を実行し、`docs/responses/*.pdf`にcommitして
  GitHub Pagesから直接開けるようにする。「Make Atlas」はGitHubの新規ファイルURLを
  開いてPR起票を促す(認証情報は埋め込まない)。**実際にdwg7/zukakuでpush・PR・
  マージまで実機検証済み**(コンテナジョブ特有の不具合を3件発見・修正)。
- **「Print in Browser」(ブラウザ内印刷モード)**を[ADR 0007](adr/0007-client-side-print-mode.md)
  として追加。Playwright/GitHub Actionsを一切使わず、`window.print()`+CSS named pages
  (`@page`のportrait/landscape混在)だけでPDF化する。standing serverもGitHub
  アカウントも不要な第三の選択肢として、既存パスと並存させる。
- GitHub Pagesは公開中: https://dwg7.github.io/zukaku/。unopengis/7への案内issueも
  投稿済み([UNopenGIS/7#989](https://github.com/UNopenGIS/7/issues/989))。
