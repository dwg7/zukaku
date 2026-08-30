# ADR 0004: 3D表現(terrain・fill-extrusion)の扱い

- ステータス: 採用(部分実装。terrainは実装済み、fill-extrusionは未定義のまま)
- 日付: 2026-08-30

## コンテキスト

zukakuはstars.optgeo.orgから取得したスタイルJSONをそのままMapLibre GL JSに渡して
レンダリングする([ADR 0002](0002-headless-chromium-maplibre-gl-js.md))。しかし
stars側のスタイルは、zukakuが想定していない3D表現(`terrain`プロパティによる
地形の傾斜表示、`fill-extrusion`レイヤーによる建物等の立体表示)を含む可能性がある。

印刷アトラスは、複数ページを紙で並べて(物理的に貼り合わせて)一つの広い範囲を
見るという使い方を前提とする(Field Papers由来のUX、CLAUDE.md参照)。3D表現は
カメラの透視投影(中心投影)により、ページの端に近いほど見た目の位置・形状が
歪む。この歪みは通常の2D地図(真上から見た正射影に近い表現)であれば無視できる
程度だが、terrainの傾斜表示や建物の立体表示があると顕著になり、隣接ページを
貼り合わせたときに地物が連続して見えない(位置・形状が食い違う)という問題を
引き起こす。

## 決定

- **terrain**: フェッチしたスタイルに `terrain` プロパティが含まれていても、
  zukaku側で必ず無効化する。実装は `map.on("load", () => map.setTerrain(null))`
  ([scripts/render/page.html](../scripts/render/page.html)参照)。スタイルJSON自体を
  加工するのではなく、MapLibre GL JSのAPI(`setTerrain(null)`)でランタイムに
  無効化する方式を採る(スタイルJSONをfetchして書き換えるより単純で、`terrain`が
  存在しない場合も安全にno-opになる)。
- **fill-extrusion**: 当面「未定義」とする。zukaku側で機械的に`fill`レイヤーへ
  変換する処理は行わない(高さ・パース由来の見た目の変化を単純な置換で正しく
  補正するのは容易ではなく、今回はスコープ外とする)。対応が必要になった場合は
  改めてADRを起こす。

## 根拠

- 現在zukakuが対象とする2スタイル(`bvmap-dark`、`positron`)には、実機確認の結果
  `terrain`プロパティも`fill-extrusion`レイヤーも含まれていない(2026-08-30時点、
  `curl`でスタイルJSONを確認)。したがって現時点でこの決定は「将来stars側のスタイルが
  変わった場合の予防措置」であり、今すぐ見た目が変わるわけではない。
- terrainは `setTerrain(null)` 一つで機械的・確実に無効化できるため、今のうちに
  実装しておくコストが低い。
- fill-extrusionは機械的な安全策(単純な置換や無視)が難しく、無理に対応すると
  かえって不正確な表示を生む可能性がある。今使わないスタイルのために作り込むより、
  「未定義」と明示して先送りする方が誠実。

## 影響

- [scripts/render/page.html](../scripts/render/page.html) に `map.setTerrain(null)` を
  実装済み(2026-08-30)。動作確認済み(既存スタイルに影響なし)。
- 将来、stars側のスタイルにfill-extrusionを含むものが追加され、zukakuで使いたく
  なった場合は、本ADRを更新するか新しいADRを起こして方針を決める。候補としては
  「該当レイヤーをレンダリング前に除去する」「pitch=0での見た目のズレを許容範囲内と
  見なして許可する」などが考えられるが、いずれも未検討。

## 参考

- MapLibre GL JS `Map#setTerrain`:
  https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#setterrain
