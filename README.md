# ShadeRoute PLATEAU - OpenRouteService + Terrain Fixed版

修正内容:

- 時刻入力で分が消える問題を修正
- `dateFromInputs()` と `setDate()` を安全化
- 地形適用時に真っ黒になりにくいよう、ライティング/ShadowMapをOFF
- `CesiumTerrainProvider.fromIonAssetId()` を await して terrainProvider を直接設定
- 地形適用時にPLATEAU Orthoを自動ON

## Worker

既存Workerが動いている場合、Worker側の再デプロイは不要です。新規の場合のみ:

```powershell
cd worker
npm install
npx.cmd wrangler login
npx.cmd wrangler secret put ORS_API_KEY
npx.cmd wrangler deploy
```

## GitHub Pages

`frontend/` の中身をGitHub Pages側へ上書きしてください。
