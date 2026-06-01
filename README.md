# ShadeRoute PLATEAU - Japan Regional Terrain版

Asset ID `2767062` を最初から入力済みにした版です。

## 変更点

- UI表記を `Japan Regional Terrain / ion` に修正
- Terrain Asset ID 初期値を `2767062` に設定
- Terrain適用時に `CesiumTerrainProvider.fromIonAssetId(assetId)` を await
- Terrain適用時にPLATEAU Orthoを自動ON
- Lighting / ShadowMap はOFF
- 時刻入力バグ修正済み
- 建物高さ補正も残しています

## 使い方

既存Workerはそのまま使えます。GitHub Pages側は `frontend/` の中身で上書きしてください。

Cesium ion Tokenを入力して「Token保存」→「Terrain適用」を押してください。
