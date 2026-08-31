# ADR 0011: 地図の状態をdocument fragmentで表現し、URLで共有可能にする

- ステータス: 採用・実装済み・実機検証済み
- 日付: 2026-08-31

## コンテキスト

範囲指定UI([docs/index.html](../docs/index.html))で選んだ状態(地図の位置・
ズーム、行列数、向き、タイトル、スタイル、Save Paperで除外したセル)は、
これまでページをリロードすると失われていた。ユーザーからの要望
([dwg7/zukaku#3](https://github.com/dwg7/zukaku/issues/3)):
URLのコピペで状態を再現できるようにしたい。地図自体の状態はMapLibre GL JSの
`hash`機能で反映しつつ、行列数・タイトル・Save Paperの除外リストといった
zukaku独自の状態も同じdocument fragmentに乗せる。

## 決定

**MapLibreの`hash: "map"`オプション(名前空間つきhash)と、zukaku独自フィールドの
手書きの読み書きを併用する。**

### なぜ`hash: "map"`が両立できるのか

MapLibre GL JSの`Hash`実装は、`location.hash`を`&`区切りの`key=value`の並びとして
扱い、**自分が担当するキー(`hash`オプションに文字列を渡した場合はその名前、
例えば`map`)以外の部分には一切手を出さない**設計になっている。つまり
`#map=15/35.68/139.77&title=foo&m=2`のようなhashがあっても、MapLibreは
`map=...`の部分だけを読み書きし、`title=...`や`m=...`はそのまま残す。この性質を
使い、zukaku独自のフィールド(`m`・`n`・`o`・`style`・`title`・`excluded`)を
**MapLibreが触らない別のkeyとして同じhashに同居させる**。

### 実装

[docs/index.html](../docs/index.html)に追加:

- `readHashParams()`/`writeHashParams()`: `location.hash`を`&`区切りで
  パースし、`map=`で始まるエントリ(MapLibre自身の担当分)を除いた残りを
  `URLSearchParams`として読み書きするヘルパー。書き込み時は既存の`map=...`
  エントリをそのまま先頭に残し、その後ろに自分のフィールドを追記する。
- `syncHashFromState()`: `state`(`rows`・`cols`・`orientation`・`style`・
  `title`・`excludedCells`)を`m`・`n`・`o`(`p`/`l`の1文字)・`style`・`title`・
  `excluded`(`"r,c"`のカンマ区切りリスト)にエンコードして書き込む。
  行列・向き・スタイル・タイトル・Save Paperのいずれかを操作するUIハンドラの
  末尾で必ず呼び出す。
- `restoreStateFromHash()`: ページロード時に一度だけ呼び、`location.hash`から
  `state`の初期値を上書きする。**mapコンストラクタより前**に呼ぶ必要がある
  (`state.style`がコンストラクタの`style`オプションに使われるため)。
  値は範囲チェック(`m`/`n`は1〜10にクランプ、`style`は既知の3つのIDのみ許可、
  `title`は60文字に切り詰め)してから`state`に反映する——不正なhashを直接
  編集されても壊れないようにするため。
- mapコンストラクタに`hash: "map"`を追加。地図自身の位置・ズーム・向きの
  保存/復元はこれだけで完結する(既存の`center`/`zoom`オプションは、
  hashに`map=...`が既にある場合はMapLibre側で無視される)。
- 各操作ハンドラ(スタイル選択、行列±、向き切替、タイトル入力、Save Paperの
  トグル)の末尾に`syncHashFromState()`呼び出しを追加。
- ページロード完了直後にも一度`syncHashFromState()`を呼ぶ——hashが空の
  初回訪問でも、UIを一度も操作しないうちからURLが完全な状態を表すようにする
  ため。

### 除外セルのエンコード

`state.excludedCells`(`Set<"r,c">`)は`Array.from(...).join(",")`で
`"0,1,1,2"`のような文字列にする(区切りは全部カンマ)。`"r,c"`という
キー自体にカンマが含まれるため厳密には曖昧さが残るが、行・列番号は常に
1桁の整数(最大10)のため実害はない。

## 検証結果(2026-08-31)

Playwrightで往復テストを実施: スタイル(std)・行列(2×3)・向き(landscape)・
タイトル("Fragment Test")・Save Paperでの1セル除外、という状態をUI操作で
作った上でhashを取得し(`#map=15/42.9203/143.1954&m=2&n=3&o=l&style=std&
title=Fragment+Test&excluded=0,1`)、そのhashつきURLに**再度アクセス**して
状態が完全に復元されることを確認した(スタイル名・行列数・向き・タイトル・
除外セル数・地図の中心座標/ズームレベルのすべてが一致)。

## 影響

- `docs/index.html`のみ変更。他のファイルへの影響なし。
- Playwright/Actions経路([scripts/render/page.html](../scripts/render/page.html))は
  URLの状態を扱わないため無関係。

## 参考

- [ADR 0005](0005-range-selection-ui-interaction-model.md) — `state`オブジェクトの
  設計、Save Paperの`excludedCells`
- [ADR 0008](0008-save-paper.md) — Save Paperの`excludedCells`の意味・エンコード方針
