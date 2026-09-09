# ADR 0012: 「Print in Browser」を`@dwg7/maplibre-gl-atlas`ライブラリの消費に切り替える

- ステータス: 採用・実装済み
- 日付: 2026-09-10

## コンテキスト

[dwg7/zukaku#8](https://github.com/dwg7/zukaku/issues/8)で、zukakuの
「Print in Browser」機能([ADR 0007](0007-client-side-print-mode.md)、
[ADR 0009](0009-overview-zoom-level-shift.md))を、汎用的なMapLibre GL JS
コントロールとして[dwg7/maplibre-gl-atlas](https://github.com/dwg7/maplibre-gl-atlas)
(npmパッケージ`@dwg7/maplibre-gl-atlas`)へ切り出す3PR構成の計画を立てた。
PR 1(ライブラリ本体の構築)は完了・実機検証済み——`docs/index.html`の
`preparePrintPages()`・印刷用CSS(`@page`混在戦略・`strategy-mixed`/
`strategy-rotate`)・オフスクリーンスナップショット(`snapshotSheet`相当)を
1:1で移植し、さらに実機デバッグを通じて`setProjection()`のタイミングバグ・
スケールバーの`renderScale`補正漏れという、**zukaku自身にも現存する実バグ2件**
を発見・修正した。

この移植の結果、`docs/index.html`の`preparePrintPages()`・印刷用CSSは、
ライブラリ側に存在する「原本の直接のコピー」になってしまっている——今後
どちらかにバグ修正や改善を加えても、もう一方には反映されない。二重保守を
避けるため、`docs/index.html`自身をこのライブラリの利用者に切り替える
(計画のPR 2)。`scripts/render/page.html`(Playwright経路)の移行はPR 3として
別途行う。

## 決定

**`docs/index.html`の「Print in Browser」パスを`AtlasControl`
(`@dwg7/maplibre-gl-atlas`)に置き換える。「Share」「JSON」ボタン
(GitHub Actions経由の`scripts/render/atlas.js`が消費するJSONスキーマ)は
一切変更しない。**

### 2つの関数に分離する

- **`computePages()`(既存、無変更)**: bbox算出・Save Paper・グリッド参照の
  ロジックはそのまま。返り値の形(`{style, bbox, orientation, ref, title,
  grid, padding, renderScale}`の配列)も無変更——`scripts/render/atlas.js`
  (PR 3で移行予定、まだ手を付けていない)が直接このJSONを読むため、
  ここを変えると[docs/requests/](../docs/requests/)経由のGitHub Actions
  パイプライン全体に影響する。「Share」「JSON」ボタンは引き続きこの関数を使う。
- **`computeSheets()`(新規)**: `computePages()`の返り値を`AtlasSheet[]`へ
  変換する薄いアダプタ。「Print」ボタン(`AtlasControl.print()`)専用。
  bbox算出そのものを再実装しない——単一の情報源(`computePages()`)から
  作ることで、ロジックの二重化を避ける。

### `AtlasControl`の組み込み

- `new AtlasControl({ sheets: computeSheets, showButton: false })`。
  zukakuは既に独自の「Print」ボタン(`#print-btn`)を持つため、ライブラリ
  組み込みのボタンは使わない
  ([maplibre-gl-atlas DECISIONS.md D8](https://github.com/dwg7/maplibre-gl-atlas/blob/main/DECISIONS.md)
  で確立した`showButton:false`パターン)。
- `confirm`(`review()`を挟むかどうか)も使わない——zukakuのグリッド編集画面
  自体が×/+トグル(Save Paper、[ADR 0008](0008-save-paper.md))で「何を刷るか
  決める」工程を既に兼ねており、印刷ボタンを押した後にさらに確認ダイアログを
  挟むのは冗長([maplibre-gl-atlas DECISIONS.md D10](https://github.com/dwg7/maplibre-gl-atlas/blob/main/DECISIONS.md)
  と同じ理由——このパターンはそもそもzukakuのUXを参考に確立されたもので、
  zukaku自身に適用するのは自然な結論)。`atlasControl.print()`を直接呼ぶ。
- 印刷用CSS(`@page`・`.print-page`等)・オフスクリーンスナップショット・
  スケールバー抽出は、すべて`AtlasControl`が内部で行う(`injectStyles`既定
  `true`)。`docs/index.html`から同等のCSS・`preparePrintPages()`・
  `viewportPxFor()`・`isLikelyWindows()`を削除する。
- `addOverviewGridLayers()`はそのまま残す——`AtlasSheet.decorate`フックに
  渡す形に変えるだけで、ロジック自体は無変更。

### 概要ページの向きを常に`state.orientation`に一致させる(D15を上書き)

**この変更は「Print」ボタン経由の描画にのみ適用する。`computePages()`が
返す`orientation`(Share/JSON/Actions向け)は変更しない。**

`computeSheets()`内で、概要ページ(`role: "index"`)の`orientation`だけを
`computePages()`の返り値ではなく`state.orientation`に上書きする。これは
[dwg7/maplibre-gl-atlas DECISIONS.md D11](https://github.com/dwg7/maplibre-gl-atlas/blob/main/DECISIONS.md)
(同ライブラリのデモをhfuさんが実機検証した際、1行×3列・portraitで概要
ページだけlandscapeになる挙動を「分かりにくい」として撤回し、常に統一する
方を選んだ決定)をzukaku本体にも適用したもの。

**[D15](../DECISIONS.md)(issue #6、`strategy-rotate`選択時に限り概要ページの
向きを詳細ページに固定するWindows専用の回避策)はこの変更で不要になる**
——概要ページが最初から全ページと同じ向きになるため、`strategy-rotate`の
「少数派を回転」ロジックがそもそも発動する場面が(zukakuの1グリッド=1向きという
UI設計上)無くなる。D15を撤回・書き換えはしない(D3→D5と同じ経緯保存の方針)。
`isLikelyWindows()`によるオーバービュー向きの特別分岐(`preparePrintPages()`
内)はコードごと削除される。

### 依存の取り込み方法(npm未公開のため)

`@dwg7/maplibre-gl-atlas`はまだnpm公開されていない
([maplibre-gl-atlas HANDOVER.md](https://github.com/dwg7/maplibre-gl-atlas/blob/main/HANDOVER.md)、
`NPM_TOKEN`未設定)。maplibre-gl-atlas自身の`docs/index.html`デモが採用した
「ビルド成果物を`docs/vendor/`に手動コピーする」パターンをそのままzukaku側にも
適用する: `docs/vendor/maplibre-gl-atlas.js`(+`.js.map`)を追加し、
`import { AtlasControl } from "./vendor/maplibre-gl-atlas.js";`で読み込む。
npm公開後はunpkg importに切り替え、`docs/vendor/`は削除する
(maplibre-gl-atlas側のHANDOVER.mdに書かれている手順と同じ)。

`maplibre-gl-atlas`のビルド出力は`maplibre-gl`を裸のimport指定子
(bareスペシファイア、peer dependency)として参照するため、`docs/index.html`に
`<script type="importmap">`で`"maplibre-gl"`を既存と同じunpkg URLへ解決する
エントリを追加する。zukaku自身の`import { Map, ScaleControl } from "..."`
(直接URL指定)は変更しない——同一URLである限り、ブラウザのESMモジュール
キャッシュ上は同一モジュールとして扱われるため、二重ロード・型不整合は起きない。

## 根拠

- 二重保守の解消: 印刷パイプラインのバグ修正・改善が今後どちらか一方にしか
  反映されない状態を解消する。
- Actions経路への影響ゼロ: `computePages()`のスキーマ・ロジックを変えないため、
  `scripts/render/atlas.js`(PR 3未着手)・既存の`docs/requests/`/`docs/responses/`
  ペアには一切影響しない。
- D15の回避策から一般解への格上げ: Windows固有の特別分岐ではなく、
  「概要ページも含めて常に単一の向きに揃える」というUI設計上そもそも正しい
  制約に寄せることで、`strategy-rotate`のロジック自体をシンプルなまま保てる。

## 影響

- `docs/index.html`: `preparePrintPages()`・印刷用CSS・`viewportPxFor()`・
  `isLikelyWindows()`を削除。`computeSheets()`を新規追加。`AtlasControl`の
  構築・`map.addControl()`・Printボタンのハンドラを変更。`ScaleControl`の
  importを削除(ライブラリが内部で行うため不要)。`computePages()`・
  `addOverviewGridLayers()`・Save Paper・URL共有(ADR 0011)は無変更。
- `docs/vendor/maplibre-gl-atlas.js`(+`.js.map`)を新規追加(npm公開までの
  暫定措置)。
- `scripts/render/`配下は無変更(PR 3で別途対応)。

## 参考

- [dwg7/maplibre-gl-atlas](https://github.com/dwg7/maplibre-gl-atlas) —
  切り出し先リポジトリ本体。特に`DECISIONS.md`のD8(状態遷移・
  `showButton:false`)・D10(印刷前確認ダイアログを持たない設計)・D11
  (概要ページの向き統一)。
- [ADR 0007](0007-client-side-print-mode.md)・[ADR 0009](0009-overview-zoom-level-shift.md) —
  移植元となったzukaku自身の実装。
- [DECISIONS.md](../DECISIONS.md) D15 — 本ADRで上書きされる、issue #6への
  Windows専用の暫定対応。
