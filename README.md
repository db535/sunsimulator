# ShadeRoute PLATEAU - OpenRouteService版

Google Maps Platformを使わず、OpenRouteService + Cloudflare Workers + GitHub Pages + Cesium + PLATEAUで「日陰優先ルート」を検索するサンプルです。

## 構成

- `frontend/` : GitHub Pagesに置く静的サイト
- `worker/` : Cloudflare Workers。ORS APIキーをSecretとして保持

## 1. OpenRouteService APIキー

1. https://openrouteservice.org/ でアカウント作成
2. DashboardでAPIキーを作成

## 2. Cloudflare Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put ORS_API_KEY
npx wrangler deploy
```

デプロイ後に出るURLを、フロント画面の「Cloudflare Worker URL」に入力してください。

## 3. GitHub Pages

`frontend/` の中身をGitHub Pages公開用リポジトリへ置いてください。

## 注意

- ORSの公開APIには利用制限があります。本格運用では有料プランや自前ホストを検討してください。
- 日陰判定はCesiumのレイ判定を使うWeb可視化向け近似です。法規判定・安全用途には使わないでください。
- PLATEAU配信サービスは試験運用のため、安定運用する場合は対象3D Tilesの自前配信も検討してください。
