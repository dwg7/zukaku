# Handover

zukakuの現在の状態。次にこれを引き継ぐ人(人間でもAIでも)向け。

## 現状(2026-08-30時点)

調査・設計判断に加えて、レンダリングパイプラインと範囲指定UIのプロトタイプまで
一通り動く状態。ADR 0001〜0005 の経緯は [DECISIONS.md](DECISIONS.md) を参照。

- スコープ・技術方針は [CLAUDE.md](CLAUDE.md) 参照。zukaku自身はMartin等のタイル
  サーバーを持たず、stars.optgeo.orgのデータをHeadless Chromium(Playwright)+
  MapLibre GL JS v6で直接レンダリングしてPDF化する([ADR 0002](adr/0002-headless-chromium-maplibre-gl-js.md))。
- 用紙はA4のみ(portrait/landscape切替必須)、当面10ページ程度の規模、選択可能スタイルは
  `bvmap-dark`(日本国内専用)/`positron`(グローバル)の2つ。terrainは常に無効化、
  fill-extrusion・globe投影は使わない([ADR 0004](adr/0004-terrain-and-fill-extrusion-policy.md))。

### レンダリングパイプライン([scripts/render/](scripts/render/)、[Dockerfile](Dockerfile))

- 単ページ([render.js](scripts/render/render.js))・複数ページ結合
  ([atlas.js](scripts/render/atlas.js)、pdf-libでマージ)・bbox→camera変換
  (MapLibre GL JSの`bounds`/`fitBoundsOptions`に委譲)・Docker実行、いずれも
  実機検証済み。詳細は[ADR 0002の「検証結果」各節](adr/0002-headless-chromium-maplibre-gl-js.md)参照。
- **重要な落とし穴**: Playwrightの`page.pdf()`は生きたWebGLキャンバスを含められない。
  `canvas.toDataURL()`で画像化し`<img>`に差し替えてから`page.pdf()`する必要がある
  ([page.html](scripts/render/page.html)に実装済み)。
- maplibre-gl v6はESM専用(UMDバンドル廃止)。`<script type="module">`+
  `import { Map } from ".../maplibre-gl.mjs"`で読み込む(v4→v6移行時にハマった点、
  ADR 0002に記録)。

### 範囲指定UIプロトタイプ([docs/index.html](docs/index.html))

- Field Papers本家の`leaflet-page-composer.js`を調査し、インタラクションモデル
  (画面中央固定グリッド+地図パンで位置合わせ)を[ADR 0005](adr/0005-range-selection-ui-interaction-model.md)
  として記録・プロトタイプ実装済み。
- レイアウト: 左上=スタイル選択、右上=都市プリセット(帯広/札幌/ビエンチャン)、
  上部中央=行(m)・列(n)+/-とportrait/landscape切替、左下=`Make Atlas`ボタン
  (**意図的に未配線**、押しても何も起きない)。
- Playwrightで動作確認済み(スクリーンショット目視)。**このリポジトリ作業で使っている
  埋め込みBrowserプレビューツールではWebGL/Workerが動かず地図が読み込まれない
  現象があるが、これはプレビュー環境固有の制約であり、コードの不具合ではないと
  判断した**(Playwright=実際のヘッドレスChromiumでは正常動作)。実ブラウザでの
  最終確認はまだ。
- `bvmap-dark`は国土地理院データのため日本国内専用、ビエンチャンでは空白になることを
  実機確認(CLAUDE.md 3節に反映済み)。
- **「Make Atlas」ボタンを配線し、UI→レンダリングパイプラインのend-to-endを実機検証
  済み**。グリッド各セルの地理座標は`map.unproject()`で算出、`atlas-pages.json`として
  ダウンロードさせる形にした(UI自体はヘッドレスレンダラーを実行しない、静的ページの
  ままでよい設計)。
- **概要ページ(1ページ目)+A1/A2/B1/B2形式のグリッド参照を実装**。ユーザーが共有した
  Field Papers本家の実サンプル(`fieldpapers.org/atlases/4ibxrgcu`)に合わせて、連番
  ラベルから「行=アルファベット・列=数字」の参照方式に変更し、各詳細ページ右上に
  その参照を大きく表示するようにした。グリッド線・ラベルの色も本家に合わせて黒に。
  QRコード・位置合わせドット(本家のスキャンバック用マーカー)は非実装(スコープ外)。
  帯広2×2グリッドでend-to-end動作確認済み。詳細は
  [ADR 0005](adr/0005-range-selection-ui-interaction-model.md)参照。
- **印刷仕上げの調整**: 各ページに8mm印刷マージン+図郭線(細い黒枠)、左下に
  MapLibre標準`ScaleControl`によるスケールバー、右下に`NavigationControl`
  (コンパスボタン流用)による方位記号、左上に「Zukaku」ワードマーク(スタイル名の
  ラベルは削除。範囲指定UI側のスタイル選択ボタンはそのまま)。目視確認済み。
- **GitHub Actionsでのレンダリング + GitHub「新規ファイル」URLでのPR起票**を実装
  ([ADR 0006](adr/0006-github-actions-render-pipeline.md))。`docs/index.html`の
  「Make Atlas」はGitHubの`/new/{branch}?filename=&value=`URLを開いてPR起票を
  促す形に変更(認証情報は一切埋め込まない)。ローカル/Docker向けに「Download
  JSON only」ボタンも維持。`.github/workflows/atlas.yml`を新設し、
  `requests/*.json`のpush/PRをトリガーに`atlas.js`を実行してPDFをartifact化する。
  **Playwright+MapLibre GL JS+starsタイル+PDF保存が、Actions相当のコンテナ
  (`mcr.microsoft.com/playwright:v1.62.1-jammy`)で動くことはローカルで実機確認済み**
  (5ページの有効なPDFを生成)。ただしこのセッションでは一度もcommit/pushしておらず、
  **実際のGitHub上での動作(PR起票→Actions実行)は未検証**。

## 次にやること(優先度順)

1. **commit・push、GitHub Pages/Actionsの実地確認**(ユーザーの許可が必要、
   [ADR 0006](adr/0006-github-actions-render-pipeline.md)参照): リポジトリ設定で
   GitHub Pages(Settings → Pages → `/docs`)を有効化。「Make Atlas」→GitHubの
   新規ファイル画面→PR作成→`.github/workflows/atlas.yml`起動→artifactのPDF、
   という一連の流れを実際のGitHub上で確認する。ローカルでのコンテナ内検証は
   済んでいるが、GitHub上での動作(特に`tj-actions/changed-files`)は未確認。
2. `docs/index.html`を実ブラウザ(GitHub Pages公開後、または手元のChrome)で
   最終確認する(Playwrightでは検証済みだが、実ブラウザでの目視はまだ)。
3. README.mdの拡充。
4. UXの磨き込み(優先度中): ページ数・推定生成時間のプレビュー表示など。
5. 残りの実機検証(優先度低): GSI GitHub Pages等の外部ホスト依存・cache-busting の要否。

## 読むべき順序

1. [README.md](README.md) — プロジェクトの概要
2. [CLAUDE.md](CLAUDE.md) — 設計思想・スコープ(最初に読む)
3. このファイル — 現在の状態・次にやること
4. [DECISIONS.md](DECISIONS.md) — 「なぜこうなっているか」の索引
5. [adr/](adr/) — 各決定の詳細記録

## 実装詳細

- `scripts/render/` — ヘッドレスPDF生成(Node.js、Playwright、pdf-lib)。
  `npm install` 後、`node scripts/render/render.js --help`相当は無いが
  ソース内のUsageコメント参照。`node scripts/render/atlas.js --pages <config.json> --out atlas.pdf`。
- `docs/` — GitHub Pages予定の範囲指定UI(静的HTML、ビルド不要、MapLibre GL JSは
  unpkg CDN経由)。ローカル確認は `python3 -m http.server` 等で`docs/index.html`を
  配信すればよい。
- `Dockerfile` — `docker build -t zukaku . && docker run --rm -v "$PWD/out:/out" zukaku --pages scripts/render/sample-atlas.json --out /out/atlas.pdf`。
