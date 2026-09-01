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

### ボタンの再編・Print主流化(2026-08-31)

実際に使ってみたユーザーから「Print in Browserモードを主流にしたい」との評価が
あった。3つのボタンを「Print」(Print in Browser、青=主要アクション)・
「Share」(Make Atlas改め、GitHub PR起票、白=副次)・「JSON」(Download JSON only改め、
白=副次)に整理し、それぞれに`title`属性でツールチップ(何をするボタンかの説明)を
付けた。IDも`print-btn`/`share-btn`/`json-btn`に改名。

印刷面のレイアウト再設計(マージン15mm均一化、方位記号廃止、回転ロック)は
[ADR 0005](0005-range-selection-ui-interaction-model.md)を参照。この変更は
`scripts/render/page.html`(Playwright/Actions経路)にも同一内容を適用しており、
本ADRのPrint in Browser固有の変更ではない。

### 追記(2026-08-31): Windows Edge/Chromeでの印刷レイアウト崩れと対応

macOS Braveでは良好だが、**Windows上のEdge・Chromeでは印刷レイアウトが崩れる**
(余白がずれる、地図ペインの縦横比が潰れる)という報告があった
([dwg7/zukaku#2](https://github.com/dwg7/zukaku/issues/2))。「Chromium系ブラウザは
安定」という上記表の前提が、少なくともWindows上では成り立たないことが判明した。

#### 調査

Web検索により、関連性の高い既知の事象が見つかった:

- ["Microsoft Print to PDF now Auto Rotates Landscape pages to
  Portrait?"](https://learn.microsoft.com/en-us/answers/questions/4299199/microsoft-print-to-pdf-now-auto-rotates-landscape) ——
  Windowsの「Microsoft Print to PDF」(仮想プリンタドライバ)には、ページの
  向き(portrait/landscape)を自動的に強制変換してしまう既知の挙動がある。
- ["Edge will not auto-rotate pages of a
  PDF"](https://learn.microsoft.com/en-us/answers/questions/3257579/edge-will-not-auto-rotate-pages-of-a-pdf) ——
  Windows側のPDF/印刷スタックが、ページごとの向き指定を尊重しない・混在に
  対応しないケースが他にも報告されている。
- [Chrome "Print to PDF" and headless --print-to-pdf aren't the
  same!](https://andre.arko.net/2025/05/25/chrome-headless-print-to-pdf/) ——
  ブラウザの「印刷 → PDFとして保存」(実際のOS印刷パイプライン経由)と、
  Playwrightの`page.pdf()`(CDP経由の直接呼び出し)は別の内部コードパスである。

macOSの「PDFとして保存」はブラウザ(Chromium)自身が直接PDFを書き出す内部処理だが、
Windowsでは実際のOSプリンタドライバ(仮想プリンタ含む)を経由することが多く、
**そのドライバ層でページの向きが上書きされる**。本ADRが採用した「1つの印刷ジョブ内で
named pagesによりportrait/landscapeを混在させる」設計は、この種のドライバ層に
弱いことが裏付けられた。

#### 対応: プラットフォームでCSS戦略を切り替える(名前混在をやめない)

issueには「macOS Braveでの正常な動作を破壊しない方向で」という明示の制約が
あった。名前付きページの混在をブラウザ問わず一律でやめる案(全ページを単一の
`@page`にし、向きが違うページは中身をCSS`transform: rotate(90deg)`する)も
検討したが、これは**macOS Braveの既に正しい挙動まで変えてしまう**(landscapeページが
実際にlandscape用紙で出ていたのが、portrait用紙+回転コンテンツに変わる)ため、
制約に反する。

代わりに、**2つの戦略を実行時にプラットフォームで切り替える**方式にした:

- `strategy-mixed`(デフォルト、Windows以外): 従来通り。各ページが自分の
  `@page`(`print-portrait`/`print-landscape`)を直接持つ。macOS Braveでの挙動は
  一切変わらない。
- `strategy-rotate`(Windows限定): ジョブ全体で単一の物理`@page`
  (このアトラスの過半数のページが使っている向き)を宣言し、少数派の向きの
  ページだけ、その中身をCSSの`rotate(90deg)`で回転させて単一の物理ページに
  収める(portrait専用プリンタにlandscapeジョブを送ったときに実際のプリンタが
  行うのと同じ古典的な手法)。印刷ドライバに向きの切り替えを一切見せないため、
  Windowsのドライバ層の不具合を回避できる。

どちらの戦略を使うかは、実際の不具合(印刷ドライバの挙動)をランタイムAPIで
機能検出する方法が無いため、`navigator.userAgentData.platform`
(フォールバックとして`navigator.userAgent`の`Windows`マッチ)によるプラットフォーム
判定で決めている(`isLikelyWindows()`、[docs/index.html](../docs/index.html))。

両戦略とも同じDOM構造(`.print-page` > `.print-page-inner` >
header/map/footer)を`preparePrintPages()`が生成し、CSS側だけが戦略ごとに
異なる(`#print-root`のクラスで分岐)。

##### rotate戦略の幾何学

`.print-page-inner`(向きが逆、つまり幅高さが入れ替わった箱)を、`top:0;
left:<baseページ自身の幅>; transform-origin:0 0; transform:rotate(90deg);`で
配置すると、回転後のbounding boxがちょうど`.print-page`(baseの物理サイズ)を
埋める。これは「回転の軸(pivot)を`(baseW, 0)`に置き、90°回転で
`(dx,dy) → (-dy,dx)`という変換をpivot起点のローカル座標に適用する」という
標準的な回転行列の計算から導出できる(inner箱の幅・高さがbaseの高さ・幅と
入れ替わっている、という前提が成り立つ限り、baseがportrait/landscapeどちらの
場合でも同じ式`left: baseW`が使える)。

#### 検証(2026-08-31)

Playwrightで、同一のグリッド構成(帯広1行×3列、詳細ページportrait+概要landscape)を
2通りのUser-Agent(既定=Mac、Windows偽装UA)でレンダリングして比較:

- Mac UA: `strategy-mixed`が選ばれ、生成PDFの各ページのMediaBoxは従来通り
  ページごとに異なる(概要=841.92×594.96pt、詳細=594.96×841.92pt)。目視でも
  改修前と完全に同じ見た目——**回帰なし**。
- Windows偽装UA: `strategy-rotate`が選ばれ、生成PDFの全ページのMediaBoxが
  594.96×841.92pt(portrait A4)で統一されることを確認(`pypdf`で各ページの
  `mediabox`を直接検査)。概要ページの内容は90°回転して描画され、目視でも
  「用紙を横向きにすれば正しく読める」形で正しく収まっていることを確認。

Playwrightの`page.pdf()`は実際のWindows印刷ドライバを経由しないため、
**この対応が実際にWindows Edge/Chromeでの不具合を解消するかはユーザーによる
実機再確認が必要**。

### 追記(2026-09-01): rows=1のような偏ったグリッドでの「印刷が乱れる」報告

Windows Edgeで実機確認した際、`rows = 1`(1行×N列)のグリッドで印刷が乱れる、
という報告があった([dwg7/zukaku#6](https://github.com/dwg7/zukaku/issues/6))。
添付PDFを`pypdf`で調べると、全ページのMediaBoxは統一されており(strategy-rotateが
正しく機能している)、内容も壊れていない——ただし**概要ページ(p.1)だけが90°
回転して収められており、その1枚だけ用紙を横向きにしないと読めない**状態だった。

これはバグではなく、直前の追記で導入した`strategy-rotate`が設計通りに動いた
結果そのものだった。概要ページの向きは(computePages()内で)グリッド全体の
アスペクト比から独立に自動選択される——用紙を無駄にしないための最適化
(ADR 0005)——一方、詳細ページの向きはユーザーが選んだ`state.orientation`
固定。`rows=1`のような縦横比の偏ったグリッドでは、概要ページの最適な向きが
詳細ページ全員の向きと一致しないケースが常態化する。strategy-rotateは
「ジョブ全体で向きが割れているページ」を検出すると少数派を回転させる設計
なので、まさにこのケース(概要1枚だけが detail 全員と逆)で毎回発動して
しまっていた。回転自体はPDFとしては正しくても、**「1枚だけ用紙を90°回して
読む」という体験そのものが「印刷が乱れた」と感じられる**——現場に持ち出す
アトラスとして、複数枚を並べて使う用途を考えれば妥当な指摘。

**対応**: strategy-rotateが選ばれる場合(Windows)に限り、概要ページの向きを
グリッドの最適アスペクト比ではなく**詳細ページと同じ`state.orientation`に
固定**するようにした(`preparePrintPages()`、多数決で`baseOrientation`を
決める前に上書き)。これにより概要ページも他の全ページと最初から向きが
一致し、回転自体が一度も発生しなくなる——「単一の物理的な向きを回転検出
なしで貫く」というstrategy-rotateの本来のゴールに、根本原因側から
アプローチした形。代償は、グリッドが極端に横長・縦長な場合、概要ページの
余白がやや大きくなる(地図が詳細ページ相当にきっちり収まらない)ことだが、
「用紙を回転させないと読めないページが1枚だけ混ざる」よりは軽微な犠牲と
判断した。strategy-mixed(非Windows)は変更なし——各ページが元々自分の
`@page`を持つため、回転自体が発生せず、効率的な概要ページの向き選択を
そのまま使い続けられる。

**検証(2026-09-01)**: Playwrightで、issue #6と同じ形(帯広1行×2列)を
Windows偽装UA/既定(Mac)UAの両方でレンダリングし比較。Windows UAでは
概要ページの`.print-page-inner`が`rotated`クラスを持たなくなり
(`portrait-page`のまま)、目視でも用紙を回転させずに読める形で描画される
ことを確認。Mac UAでは従来通り`landscape-page`+`strategy-mixed`のまま、
挙動が完全に不変であることも確認した——引き続きPlaywrightの`page.pdf()`は
実際のWindows印刷ドライバを経由しないため、**実機再確認が必要**。

## 参考

- MDN `page-orientation`: https://developer.mozilla.org/en-US/docs/Web/CSS/@page/page-orientation
- Controlling the Settings in Chrome's Print Dialogue With CSS:
  https://excessivelyadequate.com/posts/print.html
- Playwright `page.pdf()` `preferCSSPageSize`オプション
- [Microsoft Print to PDF now Auto Rotates Landscape pages to
  Portrait?](https://learn.microsoft.com/en-us/answers/questions/4299199/microsoft-print-to-pdf-now-auto-rotates-landscape)
- [Edge will not auto-rotate pages of a
  PDF](https://learn.microsoft.com/en-us/answers/questions/3257579/edge-will-not-auto-rotate-pages-of-a-pdf)
- [Chrome "Print to PDF" and headless --print-to-pdf aren't the
  same!](https://andre.arko.net/2025/05/25/chrome-headless-print-to-pdf/)
