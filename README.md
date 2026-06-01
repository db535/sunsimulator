# ShadeRoute PLATEAU - OpenRouteService + Terrain版

Google Maps Platformを使わず、OpenRouteService + Cloudflare Workers + GitHub Pages + Cesium + PLATEAUで日陰優先ルートを検索するサンプルです。

## セットアップ

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ORS_API_KEY
npx wrangler deploy
```

`frontend/` の中身をGitHub Pagesへ配置します。

## 追加機能

- 範囲コードに `13101`（市区町村/区）、`13`（都道府県）、`all`（全国）を指定可能。
- 広域表示は `LOD1 軽量` 推奨。
- 建物が浮く場合のため、Cesium ion Token入力欄とTerrain Asset ID入力欄を追加。
- デフォルトTerrain Asset IDは `2488101`。必要に応じてCesium ion側のJapan Regional Terrain等に変更してください。

## 地形を使う手順

1. Cesium ionでTokenを作成
2. アプリの「Cesium ion Token」に貼り付け
3. 「Token保存」
4. 地形モードを `PLATEAU Terrain / ion` にして「地形を適用」

Tokenはコードには書かず、ブラウザのlocalStorageに保存します。共有PCでは注意してください。
