# ADR 0010: 国土地理院「標準地図」(std)ラスタタイルをスタイル選択肢に追加

- ステータス: 採用・実装済み・実機検証済み
- 日付: 2026-08-31

## コンテキスト

これまでzukakuが選べるスタイルは`bvmap-dark`(ベクタ、日本国内専用)・`positron`
(ベクタ、グローバル)の2つだった。ユーザーから、国土地理院の「標準地図」(std)——
ラスタ(画像)タイル——を選択肢に加え、**画像タイルでどこまでできるか確認したい**、
という要望があった。

stdには2点の注意事項があった:

- 最近主流の512pxタイルではなく、**伝統的な256pxタイル**である。
- まだ`stars.optgeo.org`にstyle.jsonが存在しないため、zukaku側でstyle.jsonを
  新規作成し、[hfu/stars](https://github.com/hfu/stars)(Martinベースのスタイル・
  タイル配信基盤、[CLAUDE.md 4節](../CLAUDE.md)参照)に登録してもらう必要がある。

この要望はSave Paper機能([ADR 0008](0008-save-paper.md))の完成後に着手する、
という順序でユーザーから明示的に指示された。

## 決定

**`styles/std.json`をzukaku側で作成し、hfu/starsにPRを起票して登録してもらい、
`stars.optgeo.org/style/std`を通常のスタイルと同様に参照する。**

### `std.json`の内容

```json
{
  "version": 8,
  "name": "GSI Std",
  "id": "std",
  "metadata": {
    "attribution": "<a href=\"https://maps.gsi.go.jp/development/ichiran.html\" target=\"_blank\">国土地理院</a>"
  },
  "sources": {
    "gsi-std": {
      "type": "raster",
      "tiles": ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
      "tileSize": 256,
      "minzoom": 5,
      "maxzoom": 18,
      "attribution": "<a href=\"https://maps.gsi.go.jp/development/ichiran.html\" target=\"_blank\">国土地理院</a>"
    }
  },
  "layers": [
    { "id": "gsi-std", "type": "raster", "source": "gsi-std", "minzoom": 5, "maxzoom": 18 }
  ]
}
```

- **`tileSize: 256`を明示**——省略した場合の暗黙のデフォルト(512px想定のズレ)を
  避けるため、注意点として最初から意識していた通りに書いた。
- タイルURL・zoom範囲(5〜18)・attribution表記(出典+リンク)は、国土地理院の
  地理院タイル一覧ページ(https://maps.gsi.go.jp/development/ichiran.html)の記載に
  そのまま従った。
- 当初`background`レイヤー(`#f0f0f0`)を加えていたが、stdのタイルはカバー範囲
  (日本国内、z5〜18)全域で不透明であり、フォールバックが実際に見える場面が
  ない——単なる見た目上の思いつきだったため、ユーザー指摘を受けて削除した
  (最終形は上記の通りラスタレイヤー1枚のみ)。

### hfu/starsとの連携: PRの起票元

`stars-fd`(hfu/starsを担当する別セッション)に登録を依頼したところ、
「PRの起票自体はコントリビューター側(zukaku)から行ってほしい、そうしないと
レビュー・提出の分離が崩れる」という指摘を受けた。hfu/starsのCONTRIBUTING.mdの
想定通り、これまでの実績(kaga0・height-coverageのPR)もすべてコントリビューター
側が起票していた。zukaku側の`gh`環境(hfuアカウント、認証済み)からPRを起票する
方針に切り替えた——[hfu/stars#6](https://github.com/hfu/stars/pull/6)。

## 実装

- `docs/index.html`の`#style-panel`に`<button data-style="std">std</button>`を
  追加(3つ目のボタン)。クリックハンドラは既存の汎用ロジック
  (`e.target.closest("button[data-style]")`→`state.style`更新→`map.setStyle()`)
  をそのまま使うため、JS側の分岐は一切増えていない。
- `scripts/render/page.html`・`scripts/render/lib.js`は無変更——スタイルIDは
  すでにクエリパラメータで渡す設計だったため、`std`という値が増えるだけで動く。

## 検証結果(2026-08-31)

- `curl`でGSIタイルURL(z10)の疎通を確認(200, image/png)。
- MapLibre GL JS v6で`std.json`単体をレンダリングし、GSI std tileが正しく表示
  されること・attributionコントロールに「国土地理院」が出ることを確認。
- hfu/stars側でのマージ・Martin再起動後、`stars.optgeo.org/style/std`が実際に
  200を返し、レイヤー構成(`gsi-std`のみ)が最終形と一致することを確認(stars側)。
- zukaku側UIで`std`ボタンをクリックし、範囲指定UIのライブ地図が実際にGSI std
  タイルに切り替わることをPlaywrightで確認(帯広)。
- Print in Browser経路(ADR 0007)で実際にPDFを生成し、詳細ページ・概要ページ
  (ズームレベルシフト、[ADR 0009](0009-overview-zoom-level-shift.md)込み)の
  両方が正しくレンダリングされることを確認。

### 分かったこと: ラスタタイルのオーバーズーム表示

stdのmaxzoom(18)を超えるズームでfitBoundsした場合(帯広の1×1グリッド、対話UIの
デフォルトズーム15に近い範囲)、MapLibreはz18タイルをそのまま拡大表示する
(いわゆるオーバーズーム)。建物輪郭線はある程度シャープに保たれるが、ラベル文字は
ビットマップ拡大特有の粗さが出る。これはラスタタイル一般の既知の挙動であり、
zukaku側で特別な対応はしていない——「画像タイルでどこまでできるか確認したい」
というユーザーの当初の関心に対する回答の一部として、ここに記録しておく。

## 影響

- `docs/index.html`のみ変更(ボタン1つの追加)。他ファイルは無変更。
- [CLAUDE.md 3節](../CLAUDE.md)の「選択可能なスタイル(当面)」を
  bvmap-dark/positronの2つから、stdを加えた3つに更新。

## 参考

- [ADR 0002](0002-headless-chromium-maplibre-gl-js.md) — stars.optgeo.orgから
  スタイル・タイルを直接fetchする設計そのものの根拠
- [hfu/stars PR #6](https://github.com/hfu/stars/pull/6) — `styles/std.json`の
  追加PR(コミット履歴に`background`レイヤー削除の経緯も残っている)
- 国土地理院 地理院タイル一覧: https://maps.gsi.go.jp/development/ichiran.html
