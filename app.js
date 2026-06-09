(() => {
  const statusEl = document.getElementById('appStatus');
  function status(msg) {
    if (statusEl) statusEl.textContent = msg;
    console.log('[ShadeRoute diagnostic]', msg);
  }

  window.addEventListener('error', (e) => {
    status('JSエラー:\n' + e.message + '\n' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', (e) => {
    status('Promiseエラー:\n' + ((e.reason && e.reason.message) || e.reason));
  });

  document.getElementById('reloadBtn')?.addEventListener('click', () => {
    location.href = location.pathname + '?v=' + Date.now();
  });

  async function boot() {
    status('app.jsは読み込まれました。Cesiumを確認中...');
    if (typeof Cesium === 'undefined') {
      status('Cesiumが読み込まれていません。\n原因候補:\n1. Cesium CDNのURLが読めない\n2. ネットワーク/CSPでブロック\n3. ブラウザキャッシュが古い\n\nNetworkタブで Cesium.js が200になっているか確認してください。');
      return;
    }
    status('Cesium読込OK。Viewerを作成中...');
    try {
      const viewer = new Cesium.Viewer('cesiumContainer', {
        animation: false,
        timeline: false,
        geocoder: false,
        sceneModePicker: true,
        baseLayerPicker: true,
        navigationHelpButton: false,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      });
      viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(139.76, 35.68, 3000) });
      window.__shadeRouteViewer = viewer;
      status('起動成功。\n原因は前回 app.js の初期化途中停止またはキャッシュの可能性が高いです。\n通常版へ戻す前に、この表示が出るか確認してください。');
    } catch (e) {
      status('Cesium Viewer作成エラー:\n' + (e.message || e));
      console.error(e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
