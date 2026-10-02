# ADR 0015: 印刷面の黒枠(neatline)を廃止、概要・詳細ページのスケールバーが潰れる不具合を修正

- ステータス: 採用・実装済み
- 日付: 2026-10-03

## コンテキスト

詳細ブースト([ADR 0014](0014-bvmap-detail-boost.md))を公開したあと、hfuさんが
サイトの印刷結果を見て、UIレベルで2件を指摘した。

1. **各ページの黒枠はない方がよい**。黒枠と地図範囲が微妙に違う場合があり、
   枠があることで質が低く見える。
2. **p.1(概要ページ)のスケールバーが潰れる**(「100」がバーからはみ出し、
   「m」が枠の外に落ちる)。

## 原因

**1(黒枠)**: 黒枠は`.print-map`の`border: 0.75pt solid #000`(neatline、
[ADR 0005](0005-range-selection-ui-interaction-model.md)で「トリミングで
ずれても地図の端が一目で分かる」ために導入)。一方、スナップショットは
`object-fit: contain`([issue #7](https://github.com/dwg7/zukaku/issues/7)、
ADR 0009追記)で枠にはめるため、軸ごとの`renderScale`が異なる概要ページ
(例: 1×2グリッドの`{x:2, y:1}`)では、地図が枠を埋めきらず、**枠の内側に
空白の帯が出る**。枠線がその空白をはっきり縁取ってしまい、「地図範囲と
枠がずれている」ように見えていた。

**2(スケールバー)**: `renderScale`したシートは、スナップショットが縮小されるのに
合わせてスケールバーの幅も`1/k`に縮める補正がある(2026-09-08、
[issue #9](https://github.com/dwg7/zukaku/issues/9))。しかし`ScaleControl`の
`maxWidth`は固定の100pxで、バーの長さは**膨らませた側のpxで**選ばれるため、
縮小後は短くなりすぎる。実測(補正前):

| シート | ラベル | バー幅 |
|---|---|---|
| 概要(`{x:2,y:1}`) | 1 km | 28.9px |
| **ブースト済みの詳細(`{x:4,y:4}`)** | 200 m | **21.8px** |
| 通常の詳細(`renderScale`なし) | 500 m | 54.6px |

ラベル(「200 m」など)はバーより広いため、はみ出して潰れる。**概要ページは
以前から約29pxで潰れ気味だったが、ADR 0014で詳細ページにk=4を付けたことで、
詳細ページも同様に潰れる状態になっていた**(私のブーストの副作用で、
サイトでの確認前には見落としていた)。

**付随して見つかった別の不具合**: Actions経路の`scripts/render/atlas-page.html`が
`maplibre-gl.css`を読み込んでいなかった。スケールバーの罫線とラベルの
中央寄せはMapLibre自身のそのCSSが描くため、**Actionsで生成したPDFは
バーの無い素の「50 m」という文字だけ**になっていた(ADR 0013のPR 3で、
旧`page.html`(CSSを読んでいた)から移した際の漏れ)。ブラウザ内印刷
(`docs/index.html`)は地図表示のためにCSSを元々読んでいるので影響なし。

## 決定

1. **黒枠を廃止する**: 両経路(`docs/index.html`・`scripts/render/atlas-page.html`)
   で`neatline: false`を渡す。ライブラリ(`@dwg7/maplibre-gl-atlas`)には
   `AtlasControlOptions.neatline`(既定`true`)を追加した——ライブラリの既定は
   変えず、zukakuだけ外す(枠線が「地図範囲の終端を示す」という設計意図を、
   他の呼び出し側のために残す。maplibre-gl-atlasのDECISIONS.md D14)。
2. **スケールバーの`maxWidth`を`100 × k`にする**(ライブラリ`src/snapshot.ts`):
   縮小**後**のバー幅が、未縮小のシートと同じ50〜100pxに収まるようにする。
   これは概要ページ・ブースト済み詳細ページの両方に効く。
3. **`atlas-page.html`に`maplibre-gl.css`を読み込む**。

## 結果(実測)

| シート | ラベル | バー幅(修正後) |
|---|---|---|
| 概要 | 3 km | 86.7px |
| ブースト済みの詳細 | 500 m | 54.6px |
| 通常の詳細 | 500 m | 54.6px |

ブースト済みと未ブーストで、**同じ距離(500 m)のバーが同じ幅(54.6px)**に
なる——縮尺としても整合している。生成したPDFでラベルがバーの内側に収まり、
黒枠が出ないことを確認した。ブラウザ内印刷の経路でも同じ(Playwrightで
印刷用DOMを確認:neatlineのCSSなし、バー幅54〜90px)。

## 影響

- 概要ページの地図の周囲に枠線が無くなる。`object-fit: contain`による空白は
  引き続き存在する(枠が無いので目立たない)——空白自体を無くす(概要の
  アスペクト比を合わせる等)かは別の課題で、今回は対象外。
- Actionsで生成するPDFのスケールバーに、初めて罫線が付く(PR 3以降の
  既存の`docs/responses/*.pdf`は罫線なしのまま。再生成はしない)。
- ライブラリのvendor(`docs/vendor/`)を再ビルドして更新した。

## 参考

- [ADR 0014](0014-bvmap-detail-boost.md) — 詳細ブースト(詳細ページのバー潰れの顕在化の原因)
- [ADR 0013](0013-playwright-pipeline-atlascontrol-migration.md) — `atlas-page.html`への移行(CSS読み込み漏れの原因)
- [ADR 0005](0005-range-selection-ui-interaction-model.md)・[ADR 0009](0009-overview-zoom-level-shift.md) — neatlineと`renderScale`の起源
- [issue #7](https://github.com/dwg7/zukaku/issues/7)・[#9](https://github.com/dwg7/zukaku/issues/9) — `object-fit: contain`とスケールバー補正
