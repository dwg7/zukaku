# Decisions

各項目は一段落の要旨のみ。詳細な経緯・調査ログ・比較検討は各リンク先の
`adr/` 配下の個別ファイル(ADR形式)にある — この `DECISIONS.md`
はその索引であり、内容の複製ではない。

## D1: (Superseded by D2) ページ画像のヘッドレスレンダリングはMartinの静止画APIを第一候補とする

zukaku専用のMartinインスタンスを自前ホストし、その静止画APIでページ画像を書き出す
方針としたが、「新たな常設エンジンを管理する負担」「MapLibre NativeのEGLヘッドレス
レンダリングは罠が多い(kaga0の実例)」「starsが同機能で過去にハマった経緯」を踏まえ、
D2の方針に置き換えた。
→ [adr/0001](adr/0001-headless-rendering-approach.md)(調査記録として保持)

## D2: レンダリングとPDF生成はHeadless Chromium + MapLibre GL JSに統合する

zukakuはMartinを一切自前で持たず、Headless Chromium(Playwright)上でMapLibre GL JSを
動かし、stars.optgeo.orgのスタイル/タイル/スプライト/グリフを直接fetchしてページ画像を
レンダリング、そのままPDF化する。スイス連邦測地局(Swisstopo)の実運用事例に近い構成で、
レンダリングとPDF合成を1つのエンジンに統合できるほか、Field Papers由来の範囲指定UIと
同じフロントエンドを使い回せる見込みがある。stars側のCORS許可・キャッシュ特性は
実機確認済み(Cloudflareエッジで4時間キャッシュ、通常配信は安定)。
→ [adr/0002](adr/0002-headless-chromium-maplibre-gl-js.md)

## D3: `docs/` はGitHub Pages(範囲指定UI)専用、ADRは `adr/` に置く

Field Papers由来の範囲指定UIはstars.optgeo.orgを直接fetchするだけで完結する静的SPAとして
成立する見込みが高く、GitHub Pagesでホストする方針にした(ローカル開発サーバーよりCORS
まわりが安定するというユーザーの指摘も踏まえた)。GitHub Pagesの伝統的な設定
(`main`ブランチの`docs/`フォルダを公開)と、dwg7の慣例である`docs/decisions/`への
ADR配置が衝突するため、zukakuではADRを`adr/`に置くことにした(dwg7の他プロジェクトとは
異なる配置)。
→ [adr/0003](adr/0003-docs-reserved-for-github-pages.md)

## D4: terrainは常に無効化、fill-extrusionは当面「未定義」

印刷アトラスはページを物理的に貼り合わせて使う前提のため、3D表現(terrainの傾斜、
fill-extrusionの立体表示)による透視投影の歪みは、ページの継ぎ目で地物の位置・形状が
食い違う原因になる。terrainは`map.setTerrain(null)`で機械的に無効化することにした
(stars側のスタイルに`terrain`が含まれていても常に無視する)。fill-extrusionは
単純な機械的対応が難しいため、現時点では未定義とする(現行スタイル`bvmap-dark`/
`positron`はいずれも使用していない)。
→ [adr/0004](adr/0004-terrain-and-fill-extrusion-policy.md)

## D5: 範囲指定UIはField Papers本家と同じ「画面中央固定グリッド」方式を踏襲する

Field Papers本家(fp-web)の実装(`leaflet-page-composer.js`)を調査した結果、ページグリッドは
デフォルトで画面中央に固定され、ユーザーが地図をパン/ズームすることで位置合わせをする
UXだと判明した(「Pin grid to map」で地理座標固定に切り替え可能)。各ページのbboxは
グリッドセルの画面座標を地理座標に逆変換して算出する。zukakuもこの方式を踏襲する方針
(ロック機能は当面省略、用紙はA4のみ)。ページ間の重なりは許容してよい(貼り合わせ用途では
ないため)。[docs/index.html](docs/index.html)に実装済み(スタイル/都市選択、m×n・向き
切替、「Make Atlas」で各セルのbboxを`map.unproject()`で算出し`atlas-pages.json`として
ダウンロード → `atlas.js`にそのまま渡せる)。UI→レンダリングのend-to-endを実機確認済み。
Field Papers本家にならったタイトル入力機能(`docs/index.html`の`#title-input`)も
実装し、PDF左上のブランドラベルに「Zukaku: {title}」として焼き込む(入力欄自体は
別ページのため焼き込まれない)。概要ページはグリッド周りに余白(`padding: 50`)を
追加し、詳細ページはページいっぱいのまま。2026-08-31、タイトル/インデックスを図郭の
外(上マージン)に移動する再設計を実施(上18mm・左右12mm・下8mmに拡大、フォントも
縮小)。Playwright/Actions経路とPrint in Browser経路([adr/0007](adr/0007-client-side-print-mode.md))の
両方に同じ数値・同じ構造を適用し、見た目を完全に一致させた。2026-08-31、さらに
「地図の内容の上に何も置かない」という思想を徹底し、マージンを上下左右15mm均一に
再設計、スケールバーも図郭の外(下マージン)に移動、方位記号は廃止、地図の回転も
禁止した(回転すると`computePages()`のbbox算出が壊れる実バグの修正を兼ねる)。
→ [adr/0005](adr/0005-range-selection-ui-interaction-model.md)

## D6: レンダリングはGitHub Actions、起票はGitHubの「新規ファイル」URLトリック

範囲指定UI(静的ページ)はヘッドレスレンダラーを実行できない。書き込み権限つき
トークンを埋め込まずに「Make Atlas」からPRを起票する方法として、GitHubの
`/new/{branch}?filename=&value=`URL(ログイン済みユーザー向けの新規ファイル
事前入力画面)を使うことにした。リクエストは`docs/requests/*.json`、生成された
PDFは`docs/responses/*.pdf`に置く(`docs/`配下なのでGitHub Pagesから直接PDFを
開ける)。レンダリングは「既に対応するPDFがあるリクエストはスキップする」方式
(git diffに依存しない、蓄積しても性能劣化しない)。実際の`dwg7/zukaku`リポジトリで
push・PR両トリガーの動作、GitHub Pagesの配信まで実機確認済み。
→ [adr/0006](adr/0006-github-actions-render-pipeline.md)

## D7: ブラウザ内印刷モードを第三の選択肢として追加(Playwright/Actions不要)

Playwrightの`page.pdf()`はChromiumのネイティブ印刷パイプラインを外部から叩いているだけで、
CSSの`@page`は通常の`window.print()`でも同じ制御ができる、というユーザーの指摘を受けて
検討・実装した。CSSのnamed pages(`page-orientation`)による1印刷ジョブ内での向き混在は
MDN上"Limited availability"だったため、実装前にPlaywrightの`page.pdf({preferCSSPageSize:
true})`でスパイクテストし、実際に動くことを確認してから本実装に進んだ。既存の「Make
Atlas」「Download JSON only」に加える第三の選択肢として`docs/index.html`に実装
(新しいリポジトリは作らない、既存の範囲指定UI資産をそのまま流用)。GitHub Actionsの
統制された実行環境・自動化を諦める代わりに、standing serverもGitHubアカウントも不要になる。
→ [adr/0007](adr/0007-client-side-print-mode.md)

## D8: Save Paper — グリッドセルをクリックして印刷から除外する

海だけ・山だけといった「調査対象が無いページ」を印刷から省く機能。セル中央の
小さなトグルボタン(セル全体ではない、地図のドラッグパン操作と衝突しないように)
をクリックすると、そのセルが`computePages()`のレンダリング対象から外れる。
グリッド参照(A1/B2等)はグリッド上の位置から機械的に決まる設計のため、除外しても
他セルの参照を再計算する必要がない(単に欠番になる)。概要ページでは除外セルの
輪郭は残しつつ薄くグレー塗りし、ラベルだけ表示しないことで「意図的な欠番」と
分かるようにした。`scripts/render/page.html`と`docs/index.html`の両方に同じ
描画ロジックを実装(ADR 0005と同じ「両モード同一実装」方針)。実機検証済み。
→ [adr/0008](adr/0008-save-paper.md)
