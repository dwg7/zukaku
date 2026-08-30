# ADR 0007: ブラウザ内印刷モード(Playwright/GitHub Actionsを使わない代替パス)

- ステータス: 採用・実装済み・実機検証済み
- 日付: 2026-08-30

## コンテキスト

zukakuの主経路([ADR 0002](0002-headless-chromium-maplibre-gl-js.md)、
[ADR 0006](0006-github-actions-render-pipeline.md))は、範囲指定UIで作った
ページ配列をGitHub PR経由で送り、GitHub ActionsがPlaywrightでレンダリングする、
という構成になっている。

会話の中でユーザーから次の指摘があった: Playwrightの`page.pdf()`は独自の印刷エンジンを
持たず、**Chromiumのネイティブ印刷パイプラインを外部から叩いているだけ**である。CSSの
`@page`(サイズ・余白)は通常のブラウザ印刷(`window.print()`)でも同じ制御ができるはず
であり、Playwrightを使う理由は実質「印刷範囲を正確に決めたいから」に集約されるのでは
ないか。

## 決定

**このリポジトリ(zukaku)内に、「Print in Browser」という第三の選択肢を追加した**
(既存の「Make Atlas」=GitHub Actions経由、「Download JSON only」=ローカル/Docker経由、
に加える形。既存パスを置き換えるものではない)。

新しいリポジトリは作らなかった。範囲指定UI(グリッドオーバーレイ、m×n操作、
`computePages()`によるbbox算出、都市/スタイルプリセット、タイトル入力)をそのまま
再利用でき、印刷面の装飾(8mmマージン・図郭線・スケールバー・方位記号)もMapLibre GL JSの
標準機能としてブラウザ内で同様に使える。新しいリポジトリを作ると、これらの資産を複製
するか依存させるかの二択になり、「新しいエンジンを増やしたくない」というこれまでの
一貫した判断([ADR 0002](0002-headless-chromium-maplibre-gl-js.md)での自前Martin却下など)
にも反する。

## 事前調査で判明した技術的な前提

- Playwrightの`page.pdf()`は、独自の印刷エンジンではなく**Chromiumのネイティブ印刷
  パイプラインをDevTools Protocol経由で叩いているだけ**。つまり同じCSS(`@page`)は
  通常の`window.print()`でも効く。
- 「WebGLキャンバスが印刷時に写らない」問題(ADR 0002で発見した
  `canvas.toDataURL()`スワップの回避策)は、**Chromiumの印刷パイプライン自体の制約**
  であり、Playwright固有ではない。`window.print()`でも同じスワップが必要だが、
  同じ回避策で対処できると予想し、実際にそう確認できた(下記)。
- Playwrightが実際に持っている独自の価値は「印刷範囲の制御」自体ではなく、
  (1) 無人・プログラムからの実行、(2) 実行環境(フォント・ビューポート・解像度)の
  再現性、(3) `printBackground`等API単位の細かい制御、である。ブラウザ内印刷モードは
  これらを手放す代わりに、standing serverもGitHubアカウントも不要になる。

### 未確認だった技術的リスク: 1つの印刷ジョブでのページごとの向き混在

現行のPlaywright実装は各ページを個別の`page.pdf()`として生成してからpdf-libで結合する
ため、ページごとに異なる用紙の向き(portrait/landscape混在)が自然にできる。ブラウザの
通常の印刷(1回の`window.print()`)で同じことができるかは、CSSの`page-orientation`
記述子・named pagesの組み合わせに依存し、MDNでは "Limited availability"(Baseline
非対応)と明記されていたため、事前には確証が持てなかった。

**スパイクテストで検証した(実装前)**: 独立した簡易HTML(named pagesでportrait/
landscape混在、canvas→`<img>`スワップ)を作り、Playwrightの`page.pdf({preferCSSPageSize:
true})`(Chromiumの`@page`ルールをそのまま使わせるオプション、実際の「PDFとして保存」と
同じ挙動になる)で検証したところ、**期待通りに動作した**(3ページ中、portrait→
landscape→portraitと正しく切り替わることを`pdfinfo`で確認)。この結果を受けて、
フォールバック(単一向きへの統一)を用意せず、混在対応のまま実装を進めることにした。

## 実装

[docs/index.html](../docs/index.html)に追加:

- `@page print-portrait` / `@page print-landscape` の named pages定義と、
  `.print-page.portrait` / `.print-page.landscape` クラス(スパイクで検証した
  パターンをそのまま採用)。
- `#print-root`(画面上は非表示、`@media print`時のみ表示。それ以外の全要素は
  印刷時に非表示にする)。
- `preparePrintPages(pages)`: `computePages()`が返す配列(GitHub Actionsパスと
  完全に同じ形式)を受け取り、ページごとに:
  1. 画面外の一時コンテナに、そのページ専用のMapLibreインスタンスを新規作成
     (対話的な地図とは別インスタンス)
  2. bbox/paddingを`fitBoundsOptions`にセットして`idle`を待つ
     ([scripts/render/page.html](../scripts/render/page.html)と同じロジック)
  3. `canvas.toDataURL()`でスナップショットを取得(ADR 0002のワークアラウンドを
     ブラウザ内印刷でも踏襲)
  4. MapLibreの`ScaleControl`/`NavigationControl`が生成した実DOM
     (ユーザー入力を含まないため、そのままHTMLとして複製して問題ない)を保存
  5. `map.remove()`でWebGLコンテキストを解放してから次のページへ
  6. 静的な`<section class="print-page portrait|landscape">`を`#print-root`に
     追加(スナップショット画像・複製したコントロール・ブランド/タイトルラベル・
     グリッド参照ラベル)
- 概要ページのグリッド線描画(`addOverviewGridLayers()`)は
  [scripts/render/page.html](../scripts/render/page.html)の該当ロジックを
  そのまま移植。
- 全ページ準備できたら`window.print()`を呼ぶ。

## 検証結果(2026-08-30)

Playwrightで実際に`docs/index.html`を操作し(1行×3列、portraitセル → 概要ページは
landscape、詳細ページはportraitという混在ケース)、`preferCSSPageSize: true`で
`page.pdf()`を呼んで検証:

- 4ページ生成(概要+A1+A2+A3)、`pdfinfo`でページ1がlandscape(841.92×594.96pt)、
  ページ2〜4がportrait(594.96×841.92pt)と、**混在が実際に機能することを確認**。
- ラスタライズして目視確認: タイトル(「Zukaku: ブラウザ印刷テスト」)、グリッド参照
  (概要/A1/A2/A3)、スケールバー、方位記号、図郭線、いずれもPlaywright版
  ([page.html](../scripts/render/page.html))と同等の見た目で描画されている。

## ブラウザ互換性(2026-08-30調査)

**この機能は実質Chromium系ブラウザ(Chrome/Edge等)専用と見なすべき。**

| ブラウザ | `@page`のsize/margin | named pagesでの向き混在 |
|---|---|---|
| Chromium系(Chrome/Edge等) | 安定 | 動作確認済み(本ADR) |
| Firefox | 印刷プレビューには反映されるが、**実際に保存されるPDFには反映されない**既知の不具合([mdn/browser-compat-data#22946](https://github.com/mdn/browser-compat-data/issues/22946)) | 実質使用不可 |
| Safari | プレビュー・保存とも正しく反映されない。iPadOSでは実験的機能を有効にしてもmarginすら読まれない | 使用不可 |

地図画像そのもの(`canvas.toDataURL()`によるスナップショット)はブラウザ非依存で問題なく
動くはずだが、用紙サイズ・余白・向き混在といった印刷レイアウト面はChromium系以外では
崩れる可能性が高い。現状の実装にブラウザ判定・警告は入れていない。ユーザーの実機確認
(Chromium系以外を含む)の結果を見てから、必要であれば警告表示等を追加する。

## トレードオフ(Playwright/Actions経路との比較)

| | Make Atlas(ADR 0006) | Print in Browser(本ADR) |
|---|---|---|
| 実行環境 | GitHub Actions(統制された環境) | ユーザー自身のブラウザ/OS/フォント |
| 無人実行 | 可能(PRさえ起票すれば後は自動) | 不可能(その場で操作を完了させる必要) |
| 必要なもの | GitHubアカウント | ブラウザのみ |
| 出力の永続化 | `docs/responses/`に自動commit、共有URL | その場で保存されるのみ、共有URLなし |
| 解像度制御 | `deviceScaleFactor`で明示制御 | ユーザーのdevicePixelRatio任せ |

どちらか一方に統合する話ではなく、**用途に応じて使い分ける**選択肢として両方残す。

## 影響

- `docs/index.html`に「Print in Browser」ボタンを追加。
- 新規ファイルは無し(既存の範囲指定UIに追記する形)。

## 参考

- MDN `page-orientation`: https://developer.mozilla.org/en-US/docs/Web/CSS/@page/page-orientation
- Controlling the Settings in Chrome's Print Dialogue With CSS:
  https://excessivelyadequate.com/posts/print.html
- Playwright `page.pdf()` `preferCSSPageSize`オプション
