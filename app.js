/* ShadeRoute C/E 修正版
 * C: レイ方向を「地上判定点 -> 太陽方向」に統一。
 * E: 解析結果を道路面へ青/赤のクランプ表示として投影。Cesiumの見た目影だけに依存しない。
 */

const JAPAN_REGIONAL_TERRAIN_ASSET_ID = 2767062;
const DEFAULT_CENTER = { lng: 139.767125, lat: 35.681236, height: 2200 };

const state = {
  viewer: null,
  terrainReady: false,
  buildings: [],
  resultEntities: [],
  debugEntities: [],
  rayEntities: [],
  lastSamples: [],
  visualShadowPreview: false,
  terrainCache: new Map(),
};

const $ = (id) => document.getElementById(id);

function setStatus(message) {
  const el = $('status');
  if (el) el.textContent = message;
  console.log('[ShadeRoute]', message);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function parseLngLat(text) {
  const parts = String(text).split(',').map(s => Number(s.trim()));
  if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) throw new Error(`座標形式が不正です: ${text}`);
  return { lng: parts[0], lat: parts[1] };
}

function getLocalDateISOForInput() {
  const now = new Date();
  const z = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

function getAnalysisDate() {
  const v = $('dateTime').value;
  if (!v) return new Date();
  // datetime-localはタイムゾーンを持たないため、ブラウザのローカル時刻として解釈される。
  return new Date(v);
}

function storageLoad() {
  $('ionToken').value = localStorage.getItem('shadeRoute.cesiumIonToken') || '';
  $('workerUrl').value = localStorage.getItem('shadeRoute.workerUrl') || '';
  $('buildingSources').value = localStorage.getItem('shadeRoute.buildingSources') || '';
  $('startCoord').value = localStorage.getItem('shadeRoute.startCoord') || '139.767125,35.681236';
  $('endCoord').value = localStorage.getItem('shadeRoute.endCoord') || '139.758101,35.674510';
  $('dateTime').value = getLocalDateISOForInput();
}

function storageSaveCommon() {
  localStorage.setItem('shadeRoute.workerUrl', $('workerUrl').value.trim());
  localStorage.setItem('shadeRoute.buildingSources', $('buildingSources').value.trim());
  localStorage.setItem('shadeRoute.startCoord', $('startCoord').value.trim());
  localStorage.setItem('shadeRoute.endCoord', $('endCoord').value.trim());
}

async function initCesium() {
  const token = localStorage.getItem('shadeRoute.cesiumIonToken') || $('ionToken').value.trim();
  if (token) Cesium.Ion.defaultAccessToken = token;

  state.viewer = new Cesium.Viewer('cesiumContainer', {
    animation: true,
    timeline: true,
    baseLayerPicker: true,
    geocoder: false,
    sceneModePicker: true,
    navigationHelpButton: false,
    shouldAnimate: true,
    shadows: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  });

  const viewer = state.viewer;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.shadowMap.enabled = false;
  viewer.scene.globe.baseColor = Cesium.Color.WHITE;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.pickTranslucentDepth = true;
  viewer.scene.requestRenderMode = false;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(DEFAULT_CENTER.lng, DEFAULT_CENTER.lat, DEFAULT_CENTER.height),
    duration: 0.8,
  });

  setupClickHandler();
  setStatus('Cesium初期化完了。Token保存後、Terrain/建物を読み込んでください。');

  if (token) {
    try { await applyJapanRegionalTerrain(); } catch (e) { console.warn(e); }
  }
}

async function applyJapanRegionalTerrain() {
  if (!$('ionToken').value.trim() && !localStorage.getItem('shadeRoute.cesiumIonToken')) {
    throw new Error('Cesium ion Tokenが必要です。');
  }
  const viewer = state.viewer;
  setStatus(`Japan Regional Terrainを適用中... Asset ID ${JAPAN_REGIONAL_TERRAIN_ASSET_ID}`);
  const terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(JAPAN_REGIONAL_TERRAIN_ASSET_ID, {
    requestVertexNormals: true,
    requestWaterMask: false,
  });
  viewer.terrainProvider = terrainProvider;
  state.terrainReady = true;
  state.terrainCache.clear();
  setStatus(`Japan Regional Terrain適用完了。Asset ID ${JAPAN_REGIONAL_TERRAIN_ASSET_ID}`);
}

async function loadBuildings() {
  const viewer = state.viewer;
  const raw = $('buildingSources').value.trim();
  if (!raw) {
    setStatus('建物ソースが空です。PLATEAU 3D Tilesのion Asset IDまたはtileset.json URLを入力してください。');
    return;
  }
  storageSaveCommon();
  clearBuildings();
  const sources = raw.split(',').map(s => s.trim()).filter(Boolean);
  setStatus(`建物を読み込み中... ${sources.length}件`);

  for (const src of sources) {
    let tileset;
    if (/^https?:\/\//i.test(src)) {
      tileset = await Cesium.Cesium3DTileset.fromUrl(src, {
        maximumScreenSpaceError: 2,
        dynamicScreenSpaceError: true,
      });
    } else {
      const id = Number(src);
      if (!Number.isFinite(id)) throw new Error(`建物ソースが不正です: ${src}`);
      tileset = await Cesium.Cesium3DTileset.fromIonAssetId(id, {
        maximumScreenSpaceError: 2,
        dynamicScreenSpaceError: true,
      });
    }
    tileset.shadows = Cesium.ShadowMode.ENABLED;
    viewer.scene.primitives.add(tileset);
    state.buildings.push(tileset);
    if (tileset.readyPromise && typeof tileset.readyPromise.catch === 'function') {
      await tileset.readyPromise.catch(() => null);
    }
  }
  setStatus(`建物読込完了: ${state.buildings.length}件。`);
}

function clearBuildings() {
  const viewer = state.viewer;
  for (const t of state.buildings) {
    try { viewer.scene.primitives.remove(t); } catch (_) {}
  }
  state.buildings = [];
}

function clearResults() {
  const viewer = state.viewer;
  for (const e of [...state.resultEntities, ...state.debugEntities, ...state.rayEntities]) viewer.entities.remove(e);
  state.resultEntities = [];
  state.debugEntities = [];
  state.rayEntities = [];
  state.lastSamples = [];
  $('detail').style.display = 'none';
  setStatus('結果をクリアしました。');
}

async function fetchRoute() {
  const workerUrl = $('workerUrl').value.trim().replace(/\/$/, '');
  if (!workerUrl) throw new Error('Cloudflare Worker URLを入力してください。');
  storageSaveCommon();

  const start = parseLngLat($('startCoord').value);
  const end = parseLngLat($('endCoord').value);
  const profile = $('profile').value;
  const url = new URL(`${workerUrl}/routes`);
  url.searchParams.set('profile', profile);
  url.searchParams.set('start', `${start.lng},${start.lat}`);
  url.searchParams.set('end', `${end.lng},${end.lat}`);

  setStatus(`ORSルート取得中...\n${url.toString()}`);
  const r = await fetch(url.toString(), { method: 'GET' });
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`ルート取得失敗 HTTP ${r.status}: ${JSON.stringify(json)}`);

  const coords = extractRouteCoordinates(json);
  if (coords.length < 2) throw new Error('ルート座標が取得できませんでした。Workerの/routesレスポンス形式を確認してください。');
  return coords;
}

function extractRouteCoordinates(json) {
  // ORS GeoJSON: FeatureCollection -> features[0].geometry.coordinates [[lng,lat],...]
  if (json?.type === 'FeatureCollection' && json.features?.[0]?.geometry?.coordinates) {
    return json.features[0].geometry.coordinates.map(c => ({ lng: c[0], lat: c[1] }));
  }
  if (json?.type === 'Feature' && json.geometry?.coordinates) {
    return json.geometry.coordinates.map(c => ({ lng: c[0], lat: c[1] }));
  }
  if (json?.features?.[0]?.geometry?.coordinates) {
    return json.features[0].geometry.coordinates.map(c => ({ lng: c[0], lat: c[1] }));
  }
  // ORS JSON fallback: routes[0].geometry may be encoded polyline,ここでは未対応
  return [];
}

function haversineMeters(a, b) {
  const R = 6371008.8;
  const p1 = toRad(a.lat), p2 = toRad(b.lat);
  const dp = toRad(b.lat - a.lat);
  const dl = toRad(b.lng - a.lng);
  const x = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function interpolateLngLat(a, b, f) {
  return { lng: a.lng + (b.lng - a.lng) * f, lat: a.lat + (b.lat - a.lat) * f };
}

function sampleRouteByDistance(route, stepMeters, maxSamples) {
  const out = [];
  if (route.length < 2) return out;
  let nextAt = 0;
  let travelled = 0;
  out.push({ ...route[0], routeDistance: 0, sourceIndex: 0 });
  nextAt = stepMeters;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i+1];
    const segLen = haversineMeters(a, b);
    while (travelled + segLen >= nextAt && out.length < maxSamples) {
      const f = (nextAt - travelled) / segLen;
      out.push({ ...interpolateLngLat(a, b, f), routeDistance: nextAt, sourceIndex: i });
      nextAt += stepMeters;
    }
    travelled += segLen;
    if (out.length >= maxSamples) break;
  }
  if (out.length < maxSamples) out.push({ ...route[route.length-1], routeDistance: travelled, sourceIndex: route.length-2 });
  return out;
}

function offsetPointMeters(p, eastMeters, northMeters) {
  const R = 6378137.0;
  const dLat = northMeters / R;
  const dLng = eastMeters / (R * Math.cos(toRad(p.lat)));
  return { lng: p.lng + toDeg(dLng), lat: p.lat + toDeg(dLat) };
}

function routeTangentENU(samples, idx) {
  const prev = samples[Math.max(0, idx - 1)];
  const next = samples[Math.min(samples.length - 1, idx + 1)];
  const lat = toRad(samples[idx].lat);
  const east = toRad(next.lng - prev.lng) * Math.cos(lat) * 6378137.0;
  const north = toRad(next.lat - prev.lat) * 6378137.0;
  const len = Math.hypot(east, north) || 1;
  return { east: east / len, north: north / len };
}

function lateralOffsets(count, width) {
  if (count <= 1 || width <= 0) return [0];
  const n = Math.max(1, Math.round(count));
  const arr = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0..1
    arr.push(-width + 2 * width * t);
  }
  return arr;
}

function getTerrainCacheKey(lng, lat) {
  return `${lng.toFixed(7)},${lat.toFixed(7)}`;
}

async function sampleTerrainHeights(points) {
  const provider = state.viewer.terrainProvider;
  const toSample = [];
  const refs = [];

  for (const p of points) {
    const key = getTerrainCacheKey(p.lng, p.lat);
    if (state.terrainCache.has(key)) {
      p.terrainHeight = state.terrainCache.get(key);
    } else {
      const carto = Cesium.Cartographic.fromDegrees(p.lng, p.lat);
      toSample.push(carto);
      refs.push({ p, key });
    }
  }

  if (toSample.length) {
    try {
      const sampled = await Cesium.sampleTerrainMostDetailed(provider, toSample);
      sampled.forEach((c, i) => {
        const h = Number.isFinite(c.height) ? c.height : 0;
        refs[i].p.terrainHeight = h;
        state.terrainCache.set(refs[i].key, h);
      });
    } catch (e) {
      console.warn('sampleTerrainMostDetailed failed, fallback to globe.getHeight/0', e);
      for (let i = 0; i < toSample.length; i++) {
        const c = toSample[i];
        const h = state.viewer.scene.globe.getHeight(c) || 0;
        refs[i].p.terrainHeight = h;
        state.terrainCache.set(refs[i].key, h);
      }
    }
  }
}

// NOAA系の太陽位置近似。azimuthは北=0°,東=90°、elevationは地平線上=正。
function solarPositionNOAA(date, latDeg, lngDeg) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  let L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  if (L0 < 0) L0 += 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(toRad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(toRad(2*M)) * (0.019993 - 0.000101 * T) + Math.sin(toRad(3*M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(toRad(omega));
  const epsilon0 = 23 + (26 + ((21.448 - T*(46.815 + T*(0.00059 - T*0.001813))))/60)/60;
  const epsilon = epsilon0 + 0.00256 * Math.cos(toRad(omega));
  const decl = toDeg(Math.asin(Math.sin(toRad(epsilon)) * Math.sin(toRad(lambda))));

  const y = Math.tan(toRad(epsilon) / 2) ** 2;
  const eqTime = 4 * toDeg(
    y * Math.sin(2*toRad(L0))
    - 2 * e * Math.sin(toRad(M))
    + 4 * e * y * Math.sin(toRad(M)) * Math.cos(2*toRad(L0))
    - 0.5 * y*y * Math.sin(4*toRad(L0))
    - 1.25 * e*e * Math.sin(2*toRad(M))
  );

  const utcMinutes = date.getUTCHours()*60 + date.getUTCMinutes() + date.getUTCSeconds()/60 + date.getUTCMilliseconds()/60000;
  let trueSolarTime = (utcMinutes + eqTime + 4 * lngDeg) % 1440;
  if (trueSolarTime < 0) trueSolarTime += 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const lat = toRad(latDeg);
  const dec = toRad(decl);
  const ha = toRad(hourAngle);
  const cosZenith = clamp(Math.sin(lat)*Math.sin(dec) + Math.cos(lat)*Math.cos(dec)*Math.cos(ha), -1, 1);
  const zenith = Math.acos(cosZenith);
  const elevation = 90 - toDeg(zenith);

  let azimuth;
  const azDenom = Math.cos(lat) * Math.sin(zenith);
  if (Math.abs(azDenom) > 1e-6) {
    let azRad = Math.acos(clamp(((Math.sin(lat) * Math.cos(zenith)) - Math.sin(dec)) / azDenom, -1, 1));
    let azDeg = toDeg(azRad);
    azimuth = hourAngle > 0 ? (azDeg + 180) % 360 : (540 - azDeg) % 360;
  } else {
    azimuth = latDeg > 0 ? 180 : 0;
  }
  return { azimuth, elevation, declination: decl, equationOfTime: eqTime, hourAngle };
}

function sunDirectionFromPoint(pointCartesian, azimuthDeg, elevationDeg) {
  // 重要: このベクトルは「太陽光が降ってくる向き」ではなく、
  //       「判定点から太陽へ向かう向き」。pickFromRayはこの方向へ飛ばす。
  const az = toRad(azimuthDeg);
  const el = toRad(elevationDeg);
  const localEastNorthUp = new Cesium.Cartesian3(
    Math.sin(az) * Math.cos(el), // east
    Math.cos(az) * Math.cos(el), // north
    Math.sin(el)                 // up
  );
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(pointCartesian);
  const world = Cesium.Matrix4.multiplyByPointAsVector(enu, localEastNorthUp, new Cesium.Cartesian3());
  return Cesium.Cartesian3.normalize(world, world);
}

function rayEndPoint(origin, direction, distanceMeters) {
  const scaled = Cesium.Cartesian3.multiplyByScalar(direction, distanceMeters, new Cesium.Cartesian3());
  return Cesium.Cartesian3.add(origin, scaled, new Cesium.Cartesian3());
}

function pickBlockedByBuilding(origin, direction, maxRayDistance) {
  const scene = state.viewer.scene;
  const ray = new Cesium.Ray(origin, direction);
  let hit = null;
  try {
    hit = scene.pickFromRay(ray);
  } catch (e) {
    console.warn('pickFromRay failed', e);
    return { blocked: false, distance: null, hitPosition: null, error: String(e) };
  }
  if (!hit || !hit.position) return { blocked: false, distance: null, hitPosition: null };
  const distance = Cesium.Cartesian3.distance(origin, hit.position);
  // 自己ヒット/極近傍ノイズを除去。上向きレイなので地面は通常拾わない。
  const blocked = distance > 0.8 && distance <= maxRayDistance;
  return { blocked, distance, hitPosition: hit.position };
}

async function analyzeShade(routeCoords) {
  const viewer = state.viewer;
  const sampleStep = Number($('sampleStep').value) || 10;
  const maxSamples = Number($('maxSamples').value) || 500;
  const sideWidth = Number($('sideWidth').value) || 0;
  let sideCount = Math.round(Number($('sideCount').value) || 5);
  if (sideCount % 2 === 0) sideCount += 1;
  sideCount = clamp(sideCount, 1, 9);
  const heights = $('heightList').value.split(',').map(s => Number(s.trim())).filter(Number.isFinite);
  if (!heights.length) throw new Error('高さ設定が不正です。例: 0.2,1.0,1.7');
  const threshold = clamp(Number($('shadeThreshold').value) || 45, 1, 100) / 100;
  const maxRayDistance = Number($('maxRayDistance').value) || 1500;
  const date = getAnalysisDate();

  const samples = sampleRouteByDistance(routeCoords, sampleStep, maxSamples);
  if (samples.length < 2) throw new Error('サンプル点が不足しています。');

  const positions = routeCoords.map(p => Cesium.Cartesian3.fromDegrees(p.lng, p.lat));
  const baseRouteEntity = viewer.entities.add({
    name: 'ORSルート中心線',
    polyline: { positions, width: 3, clampToGround: true, material: Cesium.Color.WHITE.withAlpha(0.55) }
  });
  state.resultEntities.push(baseRouteEntity);

  await viewer.flyTo(viewer.entities, { duration: 0.7 }).catch(() => null);
  const waitMs = Number($('tileWait').value) || 0;
  setStatus(`カメラ移動完了。PLATEAUタイル読込待ち ${waitMs}ms...`);
  await sleep(waitMs);

  const offsets = lateralOffsets(sideCount, sideWidth);
  const allProbePoints = [];
  for (let i = 0; i < samples.length; i++) {
    const tangent = routeTangentENU(samples, i);
    // 左右方向: 進行方向に直交。offset正は進行方向左側。
    const leftEast = -tangent.north;
    const leftNorth = tangent.east;
    samples[i].probes = offsets.map((off) => {
      const p = offsetPointMeters(samples[i], leftEast * off, leftNorth * off);
      p.offset = off;
      allProbePoints.push(p);
      return p;
    });
  }
  await sampleTerrainHeights(allProbePoints);

  let blockedTotal = 0;
  let rayTotal = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const sun = solarPositionNOAA(date, s.lat, s.lng);
    s.sun = sun;
    s.dateISO = date.toISOString();
    s.rays = [];
    let blocked = 0;
    let total = 0;

    if (sun.elevation <= 0) {
      // 夜間/太陽高度0以下は日射なしとして日陰扱い。ただしレイは飛ばさない。
      for (const p of s.probes) {
        for (const h of heights) {
          s.rays.push({ lng: p.lng, lat: p.lat, terrainHeight: p.terrainHeight, height: h, offset: p.offset, blocked: true, reason: 'sun_below_horizon' });
          blocked++; total++;
        }
      }
    } else {
      for (const p of s.probes) {
        for (const h of heights) {
          const origin = Cesium.Cartesian3.fromDegrees(p.lng, p.lat, (p.terrainHeight || 0) + h);
          const dirToSun = sunDirectionFromPoint(origin, sun.azimuth, sun.elevation);
          const res = pickBlockedByBuilding(origin, dirToSun, maxRayDistance);
          s.rays.push({
            lng: p.lng, lat: p.lat,
            terrainHeight: p.terrainHeight || 0,
            height: h,
            offset: p.offset,
            blocked: !!res.blocked,
            hitDistance: res.distance,
            azimuth: sun.azimuth,
            elevation: sun.elevation,
          });
          if (res.blocked) blocked++;
          total++;
        }
      }
    }
    s.blockedCount = blocked;
    s.rayCount = total;
    s.shadeScore = total ? blocked / total : 0;
    s.shade = s.shadeScore >= threshold;
    blockedTotal += blocked;
    rayTotal += total;
  }

  state.lastSamples = samples;
  drawAnalysisResults(samples, routeCoords);

  const routeShadeRatio = samples.filter(s => s.shade).length / samples.length;
  const rayShadeRatio = rayTotal ? blockedTotal / rayTotal : 0;
  setStatus(
    `日陰判定完了\n` +
    `サンプル数: ${samples.length}\n` +
    `レイ本数: ${rayTotal} / 遮蔽: ${blockedTotal}\n` +
    `点ベース日陰率: ${(routeShadeRatio*100).toFixed(1)}%\n` +
    `レイベース遮蔽率: ${(rayShadeRatio*100).toFixed(1)}%\n` +
    `太陽方向: 地点→太陽へ pickFromRay（C修正済み）\n` +
    `道路面オーバーレイ: ${$('showRoadOverlay').checked ? 'ON' : 'OFF'}（E修正済み）`
  );
}

function drawAnalysisResults(samples, routeCoords) {
  const viewer = state.viewer;
  const showOverlay = $('showRoadOverlay').checked;
  const showDebug = $('showDebugPoints').checked;
  const overlayWidth = Number($('overlayWidth').value) || 9;

  // 道路面への青/赤オーバーレイ。点だけではなく「道に判定影が乗る」ようにする。
  if (showOverlay) {
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i+1];
      const color = a.shade ? Cesium.Color.ROYALBLUE.withAlpha(0.62) : Cesium.Color.RED.withAlpha(0.55);
      const e = viewer.entities.add({
        name: a.shade ? '日陰オーバーレイ' : '日なたオーバーレイ',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([a.lng, a.lat, b.lng, b.lat]),
          width: overlayWidth,
          clampToGround: true,
          material: color,
        },
        properties: { sampleIndex: i, shadeScore: a.shadeScore, blockedCount: a.blockedCount, rayCount: a.rayCount }
      });
      state.resultEntities.push(e);
    }
  }

  // 判定中心点
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const e = viewer.entities.add({
      name: `sample-${i}`,
      position: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, (s.probes?.[0]?.terrainHeight || 0) + 0.25),
      point: {
        pixelSize: 7,
        color: s.shade ? Cesium.Color.DODGERBLUE : Cesium.Color.ORANGERED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { sampleIndex: i, kind: 'sample' }
    });
    state.resultEntities.push(e);
  }

  if (showDebug) {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      // 横点ごとの集計を小点で表示
      const byOffset = new Map();
      for (const r of s.rays) {
        const k = String(r.offset);
        if (!byOffset.has(k)) byOffset.set(k, { total: 0, blocked: 0, lng: r.lng, lat: r.lat, terrainHeight: r.terrainHeight, offset: r.offset });
        const g = byOffset.get(k);
        g.total++;
        if (r.blocked) g.blocked++;
      }
      for (const g of byOffset.values()) {
        const ratio = g.total ? g.blocked / g.total : 0;
        const color = Cesium.Color.fromBytes(
          Math.round(239 * (1-ratio) + 37 * ratio),
          Math.round(68 * (1-ratio) + 99 * ratio),
          Math.round(68 * (1-ratio) + 235 * ratio),
          230
        );
        const e = viewer.entities.add({
          name: `probe-${i}-${g.offset}`,
          position: Cesium.Cartesian3.fromDegrees(g.lng, g.lat, (g.terrainHeight || 0) + 0.4),
          point: {
            pixelSize: 4,
            color,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.7),
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { sampleIndex: i, kind: 'probe', offset: g.offset, blocked: g.blocked, total: g.total }
        });
        state.debugEntities.push(e);
      }
    }
  }
}

function setupClickHandler() {
  const viewer = state.viewer;
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (!Cesium.defined(picked) || !picked.id || !picked.id.properties) return;
    const props = picked.id.properties;
    const idxProp = props.sampleIndex;
    if (!idxProp) return;
    const idx = idxProp.getValue ? idxProp.getValue() : idxProp;
    const sample = state.lastSamples[idx];
    if (!sample) return;
    showSampleDetail(idx, sample);
    if ($('showSunRayOnClick').checked) drawSunRayForSample(sample);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function showSampleDetail(idx, s) {
  const grouped = {};
  for (const r of s.rays || []) {
    const k = `offset ${Number(r.offset).toFixed(2)}m`;
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push({ height: r.height, blocked: r.blocked, hitDistance: r.hitDistance ? Number(r.hitDistance.toFixed(2)) : null });
  }
  const payload = {
    index: idx,
    lng: Number(s.lng.toFixed(7)),
    lat: Number(s.lat.toFixed(7)),
    shade: s.shade,
    shadeScore: Number((s.shadeScore * 100).toFixed(1)) + '%',
    blockedCount: s.blockedCount,
    rayCount: s.rayCount,
    sunAzimuthDeg_clockwiseFromNorth: Number(s.sun.azimuth.toFixed(2)),
    sunElevationDeg: Number(s.sun.elevation.toFixed(2)),
    dateUTC: s.dateISO,
    raysBySideOffset: grouped,
    note: 'ray direction = 判定点から太陽へ向かうベクトル。黄色レイも同じ向き。'
  };
  $('detailText').textContent = JSON.stringify(payload, null, 2);
  $('detail').style.display = 'block';
}

function drawSunRayForSample(s) {
  const viewer = state.viewer;
  for (const e of state.rayEntities) viewer.entities.remove(e);
  state.rayEntities = [];

  const centerRay = (s.rays || []).find(r => Math.abs(r.offset) < 1e-6) || (s.rays || [])[0];
  if (!centerRay) return;
  const h = (centerRay.terrainHeight || 0) + (centerRay.height || 1.7);
  const origin = Cesium.Cartesian3.fromDegrees(centerRay.lng, centerRay.lat, h);
  const dir = sunDirectionFromPoint(origin, s.sun.azimuth, s.sun.elevation);
  const end = rayEndPoint(origin, dir, 350);
  const e = viewer.entities.add({
    name: '太陽方向レイ / point-to-sun',
    polyline: {
      positions: [origin, end],
      width: 4,
      material: Cesium.Color.YELLOW.withAlpha(0.92),
      clampToGround: false,
    }
  });
  state.rayEntities.push(e);
}

function toggleVisualShadowPreview() {
  const viewer = state.viewer;
  state.visualShadowPreview = !state.visualShadowPreview;

  viewer.clock.currentTime = Cesium.JulianDate.fromDate(getAnalysisDate());
  viewer.scene.globe.enableLighting = state.visualShadowPreview;
  viewer.shadows = state.visualShadowPreview;
  viewer.scene.shadowMap.enabled = state.visualShadowPreview;
  viewer.scene.shadowMap.softShadows = true;
  viewer.scene.shadowMap.size = 2048;

  for (const t of state.buildings) t.shadows = state.visualShadowPreview ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;

  setStatus(
    state.visualShadowPreview
      ? '見た目の影プレビューON。これは確認用です。解析結果は青/赤オーバーレイを優先してください。'
      : '見た目の影プレビューOFF。解析用の青/赤オーバーレイ表示に戻しました。'
  );
}

async function run() {
  const btn = $('runBtn');
  btn.disabled = true;
  try {
    clearResults();
    storageSaveCommon();
    if (!state.terrainReady) {
      try { await applyJapanRegionalTerrain(); } catch (e) { console.warn('terrain apply skipped/failed', e); }
    }
    const coords = await fetchRoute();
    await analyzeShade(coords);
  } catch (e) {
    console.error(e);
    setStatus(`エラー: ${e.message || e}`);
  } finally {
    btn.disabled = false;
  }
}

function setupUI() {
  storageLoad();
  $('saveTokenBtn').addEventListener('click', () => {
    const token = $('ionToken').value.trim();
    localStorage.setItem('shadeRoute.cesiumIonToken', token);
    Cesium.Ion.defaultAccessToken = token;
    setStatus('Cesium ion TokenをlocalStorageに保存しました。');
  });
  $('applyTerrainBtn').addEventListener('click', () => applyJapanRegionalTerrain().catch(e => setStatus(`Terrain適用エラー: ${e.message || e}`)));
  $('loadBuildingsBtn').addEventListener('click', () => loadBuildings().catch(e => setStatus(`建物読込エラー: ${e.message || e}`)));
  $('clearBuildingsBtn').addEventListener('click', () => { clearBuildings(); setStatus('建物をクリアしました。'); });
  $('runBtn').addEventListener('click', run);
  $('clearBtn').addEventListener('click', clearResults);
  $('visualShadowBtn').addEventListener('click', toggleVisualShadowPreview);
}

window.addEventListener('DOMContentLoaded', async () => {
  setupUI();
  await initCesium();
});
