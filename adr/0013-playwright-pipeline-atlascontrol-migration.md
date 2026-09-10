# ADR 0013: Playwright経路(`scripts/render/`)を`AtlasControl.prepare()`へ移行する

- ステータス: 採用・実装済み(2026-09-10、hfuさんの承認を得て実装。追記参照)
- 日付: 2026-09-10

## コンテキスト

[dwg7/zukaku#8](https://github.com/dwg7/zukaku/issues/8)の3PR計画のうち、
PR 1(ライブラリ抽出)・PR 2([ADR 0012](0012-consume-maplibre-gl-atlas-library.md)、
`docs/index.html`のPrint in Browser経路)は完了した。残るPR 3は
`scripts/render/`(GitHub Actions経由のPlaywrightレンダリング、
[ADR 0002](0002-headless-chromium-maplibre-gl-js.md)/[ADR 0006](0006-github-actions-render-pipeline.md))
を`AtlasControl.prepare()`の消費に切り替える計画だった。

`scripts/render/`の現行実装を精査した結果、これは`docs/index.html`
(PR 2)よりも根本的に大きい設計変更を要することが分かった——単なる
「同じ処理を呼び出す先を変える」PR 2型の移行ではない。

### 現行アーキテクチャ(`lib.js`#`renderPage()`・`atlas.js`)

- **1ページ = 1つの独立したPlaywright `BrowserContext`**。ページごとに
  そのページの向き(portrait/landscape)ぴったりのA4ビューポート
  (`viewportFor()`、794×1123pxまたは1123×794px)で新規コンテキストを
  作り、`scripts/render/page.html?style=...&bbox=...&ref=...`にナビゲート、
  `window.__zukakuReady`を待ち、`page.pdf()`をビューポートと同じmm寸法
  (`pdfDimsFor()`)で個別に呼ぶ。
- `atlas.js`はこれをページ配列分ループし、**`pdf-lib`で単一ページPDFを
  1枚ずつ`atlas.copyPages()`して結合**する。
- 複数ページを1つの`window.print()`/`page.pdf()`呼び出しで済ませる
  という発想が最初から無い——「向きが混在する1つの印刷ジョブ」という
  問題を、そもそも各ページを独立した印刷ジョブにすることで回避している。
  ADR 0007(`docs/index.html`)が「named `@page`混在戦略」で解決した
  問題を、Playwright経路は「そもそも1ジョブに混在させない」という
  別の手段で解決していた、という関係。

### `AtlasControl.prepare()`が前提とするアーキテクチャ

- **1つのページに全シートを1回で構築**——`prepare()`は`buildPrintDom()`
  を呼び、全シートを1つの`#maplibre-gl-atlas-print-root`に順番に
  追加する。想定される消費のされ方は「`prepare()`の後、1回だけ
  `window.print()`(または`page.pdf()`)を呼ぶ」——ADR 0007の
  named `@page`混在/回転戦略で、向きが混在するシートを1つの印刷
  ジョブとして正しく扱う。
- つまり`prepare()`を素直に使うなら、Playwright側も**「1つの
  `BrowserContext`で全シートを構築し、`page.pdf()`を1回だけ呼ぶ」**
  という形に揃える必要がある——`renderPage()`のページごとのループ・
  `viewportFor()`/`pdfDimsFor()`によるページごとのビューポート切り替え・
  `pdf-lib`による結合は、いずれも不要になる(という以上に、
  「1ページ1コンテキスト」という前提そのものと相容れない)。

### 技術的な裏付け

Playwrightの`page.pdf()`は明示的な`width`/`height`/`format`オプションを
渡さない限り、ページ自身のCSS `@page`ルールに従う——ADR 0007がそもそも
前提にしていた「`page.pdf()`はChromiumのネイティブ印刷パイプラインを
外部から叩いているだけ」という事実の裏返しで、`window.print()`と
同じ挙動をする。したがって、1つのドキュメント内で複数の名前付き
`@page`ルール(`strategy-mixed`/`strategy-rotate`)を使い分けるADR 0007の
仕組みは、`page.pdf()`を1回呼ぶだけでも(ブラウザの印刷ダイアログを
経由しなくても)成立するはずである——ただし本ADRの時点で実機検証は
していない(下記「検証計画」参照)。

## 決定(提案)

**この移行は保留し、実装より先にhfuさんの承認を得る。** 理由:

1. `scripts/render/atlas.js`は実際にGitHub Actions上で稼働している
   本番パイプラインであり、`docs/requests/*.json`→`docs/responses/*.pdf`
   というpublicなGitHub Pages配信物を生成する(CLAUDE.md 3節「公開範囲」)。
   PR 2([ADR 0012](0012-consume-maplibre-gl-atlas-library.md))は
   `computePages()`のJSONスキーマ・出力先を一切変えない、影響範囲の
   狭い置き換えだったが、本PRはその前提(1ページ1コンテキスト)自体を
   置き換えるため、影響範囲が本質的に異なる。
2. CLAUDE.md 7節: 「大きな設計判断(技術選定、スコープの拡張・縮小)は、
   実装より先にADR案を提示し、人間の承認を得てから着手すること」——
   本変更はまさにこれに該当する。

### 提案する設計(承認を得られた場合)

- `scripts/render/page.html`相当の新しいレンダリング用HTML
  (仮称`scripts/render/atlas-page.html`)を1つ用意し、通常の対話的な
  MapLibre地図(の実体を持つだけで表示はしない、`docs/index.html`の
  ような「本物の地図」)に`AtlasControl`(`showButton:false`)を追加、
  クエリ文字列またはJSONで受け取ったページ配列を`AtlasSheet[]`に
  変換して`sheets`に渡す。
- `lib.js`に`renderAtlas(browser, port, pages)`のような新関数を追加し、
  **1つの`BrowserContext`**でこのHTMLへ1回だけナビゲート、
  `atlasControl.prepare()`の完了(`window.__zukakuReady`相当)を待って、
  **`page.pdf()`を1回だけ**呼ぶ(`width`/`height`を指定せず、注入された
  `@page`ルールに任せる)。
- `atlas.js`のページごとのループ・`pdf-lib`結合を削除。`pdf-lib`は
  依存から外せる可能性がある(要確認: 現状`pdf-lib`が他の用途で
  使われていないか)。
- `render.js`(単ページ検証CLI)の扱いは要検討——1シートだけの
  `AtlasSheet[]`を`prepare()`に渡す形に揃えるか、素朴な検証ツールとして
  現状維持するか。
- `lib.js`の`viewportFor()`/`pdfDimsFor()`・`renderPage()`は
  `AtlasControl`が同等の処理(オフスクリーンステージのサイズ計算・
  CSS注入)を内包するため不要になる可能性が高い。
- `grid.js`(`buildGridPages()`、bearing=0前提のNode側グリッド計算)は
  無関係——これは`docs/requests/*.json`を作る側ではなく、別の
  (現在使われている形跡が薄い)ユーティリティなので、本移行の対象外。

## 検討事項(承認前に詰めるべき点)

1. **`page.pdf()`が本当に複数の名前付き`@page`を1回の呼び出しで
   正しく扱うか**——ADR 0007は`window.print()`(実ブラウザの印刷UI)
   でのみ実機検証されている。Playwrightの`page.pdf()`が同じCSSパスを
   通るという理解が正しいか、実際にPlaywrightで1〜2ページの小さな
   アトラスを試して確認する必要がある(未実施)。
2. **オフスクリーンステージのCSS(`opacity:0`+`pointer-events:none`)が
   Playwrightの`page.pdf()`環境でも安全か**——`docs/index.html`
   ([issue #4](https://github.com/dwg7/zukaku/issues/4))ではこの手法が
   実ブラウザの印刷パイプライン特有のバグを回避したが、Playwright側の
   `page.html`は元々別の配置(`position:fixed`のオフスクリーン)を使って
   おり、既に同種の対策が入っている。両者が完全に同一のCSSパスを通る
   ことをどこまで確認するか。
3. **`pdf-lib`を依存から外せるか**——外せない場合、依存を減らす効果は
   得られない(移行のメリットが「二重保守の解消」だけになる)。
4. **描画時間・メモリ**——1つの`BrowserContext`/1つのオフスクリーン
   スナップショットの連続実行(既存の`renderPage()`ループと同じく
   逐次処理になる想定)で、大きなアトラス(将来的に10ページ超)でも
   実用的な時間で終わるか。
5. **ロールバック容易性**——移行後に何か問題が起きた場合、
   `docs/requests/*.json`→`docs/responses/*.pdf`という外部契約
   (URLパス・JSONスキーマ)は変えないため、実装を元に戻すこと自体は
   容易なはず——ただし本番でPRが実際にマージされる前に、十分な
   検証(実際にActions上で1回試験実行する等)を経ること。

## 検証計画(承認された場合)

- 小さなアトラス(1×2グリッド程度)で、新旧両方の実装を実行し、
  生成されたPDFのページ数・向き・画像内容を比較する。
- 実際にGitHub Actions上でテスト用ブランチ・PRを使って試験実行し、
  既存の`docs/requests/`の実データ(サンプルまたは過去のリクエスト)を
  再レンダリングして差分を確認する。
- `npm test`相当のもの(現状`scripts/render/`に単体テストは無い
  ——要確認)があれば実行する。

## 参考

- [ADR 0002](0002-headless-chromium-maplibre-gl-js.md)・[ADR 0006](0006-github-actions-render-pipeline.md) — 現行Playwright/Actionsパイプラインの経緯
- [ADR 0007](0007-client-side-print-mode.md) — `page.pdf()`とChromiumネイティブ印刷パイプラインの関係についての元々の洞察
- [ADR 0012](0012-consume-maplibre-gl-atlas-library.md) — 同じ3PR計画のPR 2(完了済み)
- [dwg7/maplibre-gl-atlas HANDOVER.md](https://github.com/dwg7/maplibre-gl-atlas/blob/main/HANDOVER.md) — PR 3の当初の想定(`prepare()`を使う、程度の粒度だった)

## 追記(2026-09-10): 実装完了、実バグ2件を発見・修正

hfuさんの承認(「ADR 0013の設計で進めていいよ」)を得て、上記「提案する設計」
のとおり実装した。

- 新規`scripts/render/atlas-page.html`が旧`scripts/render/page.html`
  (削除)を置き換え。ネットワーク不要なソースなしスタイルでホスト用の
  地図を1つ構築し、`AtlasControl`(`showButton:false`)を追加、
  `docs/requests/*.json`と同じ形のページ配列を`AtlasSheet[]`に変換して
  `prepare()`を呼ぶ。`addOverviewGridLayers()`は旧`page.html`と同一の
  ロジックを`decorate`フックとして移植(コピー、共有モジュール化はしない
  ——`docs/index.html`ももう一つの独立した消費者であり、両者は別々に
  `AtlasSheet`を組み立てるのが自然、という判断)。
- `lib.js`の`renderPage()`/`pdfDimsFor()`を`renderAtlas()`に置き換え。
  1つの`BrowserContext`で`atlas-page.html`に1回だけナビゲートし、
  `prepare()`完了を待って`page.pdf()`を1回だけ呼ぶ。`viewportFor()`は
  `grid.js`(現在未使用の遺物、本移行の対象外)がまだ参照しているため残置。
- `atlas.js`(ページごとのループ+`pdf-lib`結合)と`render.js`(単ページCLI)を
  どちらも`renderAtlas()`呼び出しに統合。`pdf-lib`を依存から削除
  (`package.json`)。`.github/workflows/atlas.yml`の呼び出し方
  (`node scripts/render/atlas.js --pages ... --out ...`)・
  `docs/requests/*.json`のスキーマはいずれも無変更。

### 検討事項1(`page.pdf()`のCSS `@page`対応)の答え: 対応するが要オプトイン

想定どおりPlaywrightの`page.pdf()`は`window.print()`と同じChromium印刷
パイプラインを通るが、**`preferCSSPageSize: true`を明示的に渡さない限り
`@page`ルールを完全に無視し、Letter判(612×792pt)にフォールバックする**
——実測(生成PDFの`mediabox`を確認)で気づいた。`renderAtlas()`の
`page.pdf()`呼び出しに追加して解消した。

### 新たに見つかった実バグ: landscapeシートが最後に来ると空白ページが増える

上記の修正後、**単一シート(概要ページの無い1ページだけのアトラス)を
landscapeで印刷すると、内容の無い2ページ目が生成される**ことを発見した。
実験(二分探索)で切り分けた結果:

- 原因はChromiumのprint-to-PDF固有の丸め込み——CSSの`page:`プロパティで
  ある名前付き`@page`が割り当てられた要素の高さが、その物理ページの
  宣言高さと**厳密に一致**すると、ごくわずかに内容が次ページへ漏れる。
  0.1mm不足させても再現し、1mm不足させると解消することを確認した。
  同じ形の`@page`宣言でもportraitでは再現しなかった——landscape方向の
  `@page`に固有の挙動。
- 症状は「単一シート」に限らない——**印刷対象の最後のシートが
  landscapeであれば常に起こりうる**(2枚とも同じlandscapeのアトラスでも
  実際に再現・修正確認した)。zukakuの通常のアトラスは概要ページが必ず
  先頭に来るため、「グリッドの向きを`landscape`に選ぶだけ」で最後の
  詳細ページがlandscapeになり、条件を満たしてしまう——**一部の
  ユーザー操作で偶然踏むような特殊なケースではなく、一般的な不具合**
  だった。
- **この不具合は[ADR 0012](0012-consume-maplibre-gl-atlas-library.md)
  (`docs/index.html`側)にも当てはまっていた**——ADR 0012の実機検証は
  portraitでしか行っておらず、見逃していた。今回landscapeの単一シートを
  たまたま検証対象にしたことで発覚した。
- **修正**: maplibre-gl-atlas本体の`src/strategy.ts`
  (`generateStrategyCss()`)で、landscapeページの高さを
  `calc(<portrait幅>mm - 1mm)`に変更(`strategy-mixed`・
  `strategy-rotate`の両方)。1mmは15mmという既定マージンに対して
  視覚的に無視できる差。`tests/strategy.test.ts`に回帰テストを追加。

**実機検証(Playwright直接実行)**: 修正前後で、(1)単一landscapeシート
(`render.js`)、(2)2ページとも同じlandscapeのアトラス(`atlas.js`)、
(3)`docs/index.html`のPrint in Browserを1×1 landscapeグリッドで実行
(Playwrightで`window.print`をスタブしつつ同じページに対して直接
`page.pdf({preferCSSPageSize:true})`を呼ぶ手法)——いずれも修正前は
実際に不要な2ページ目が生成され、修正後(`docs/vendor/`再ビルド後)は
正しいページ数になることを確認した。3ページ混在アトラス(`sample-atlas.json`)・
本番リクエストJSON(2×2グリッド+概要ページ、5ページ)でも回帰が無いことを
確認済み。

**追記(2026-09-10、GitHub Actions実機試験)**: [PR #10](https://github.com/dwg7/zukaku/pull/10)で
テスト用リクエスト(概要+A1detail、grid/renderScale/decorate経路を含む
2ページ)を実際にpush・PRの両方で実行し、`atlas.yml`ワークフローが
成功することを確認した——`pull_request`イベント(アーティファクトのみ)・
`push`イベント(`docs/responses/`への自動コミット)の両方を検証、PRは
マージ済み。生成されたPDFの内容もpypdf/PyMuPDFで確認済み。実ブラウザでの
「印刷ダイアログを開いて保存」までの確認はまだ行っていない
(HANDOVER.md「次にやること」参照)。
