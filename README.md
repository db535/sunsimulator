# PLATEAU × Cesium 日差し・影シミュレーター

GitHub Pagesに置くだけで動く、PLATEAU実在建物対応版です。

## 公開方法

1. このZIPを解凍
2. `index.html`, `style.css`, `app.js`, `README.md` をGitHubリポジトリ直下へ配置
3. Settings → Pages → Deploy from a branch → main / root

## PLATEAUの使い方

### 推奨: PLATEAU配信サービス spec
画面の「自治体/区コード」「LOD」「テクスチャ」「年度」からURLを自動生成します。
例: `13101-bldg-maxlod2-latest` → 千代田区の建物を最新年度・最大LOD2で取得。

### 任意URL
PLATEAU VIEW/データカタログで取得した `tileset.json` URLを貼り付けて読み込めます。

### Cesium ion Japan 3D Buildings
Cesium ionのAsset DepotでJapan 3D BuildingsをMy Assetsに追加し、Asset IDとTokenを入力すると利用できます。

## 注意

- PLATEAU配信サービスは試験運用のため、サービス仕様やURLが変更される可能性があります。
- 影の描画はWebGL可視化目的です。法的な日影規制・建築確認用途には専門の計算エンジンで検証してください。
- 大規模LOD2/全国データは重いので、最初は自治体単位・maxlod2/lod1がおすすめです。
