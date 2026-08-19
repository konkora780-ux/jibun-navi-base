/**
 * platform/mapView.js — Mapbox GL JS のラッパ
 * 地図の生成・3D地形・昼夜ライティング・現在地マーカー・追従カメラをまとめる。
 * Mapbox GL JS への依存はこのファイルに閉じ込め、main.js からは関数呼び出しだけで使えるようにする。
 */
import { MAP_FOLLOW, TERRAIN } from '../config.js';

export function createMap({ container, style, token, center, zoom, pitch, bearing }) {
  mapboxgl.accessToken = token;
  return new mapboxgl.Map({
    container,
    style,
    center,
    zoom,
    pitch,
    bearing,
    language: 'ja', // 地名・道路名ラベルを日本語表示にする
    attributionControl: true
  });
}

export function enableTerrain(map) {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14
    });
  }
  map.setTerrain({ source: 'mapbox-dem', exaggeration: TERRAIN.EXAGGERATION });
}

// 夜間かどうかは端末の現在時刻から簡易判定する。
// 理由：Phase 1は測定装置であり、日没時刻APIを別途呼ぶほどの精度は不要なため。
export function pickLightPreset(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

export function applyLightPreset(map, preset) {
  map.setConfigProperty('basemap', 'lightPreset', preset);
}

// 現在地マーカー。heading（度）に合わせて向きを回転させる。
export function createUserMarker(map) {
  const el = document.createElement('div');
  el.className = 'user-marker';
  const marker = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
    .setLngLat([0, 0])
    .addTo(map);

  return {
    update(lngLat, heading) {
      marker.setLngLat(lngLat);
      if (heading != null) marker.setRotation(heading);
    }
  };
}

// ズームレベルに応じて線幅を変える式。道路そのものを塗りつぶすくらいの太さになるよう、
// ズームが上がる（拡大する）ほど太くする。値はナビ標準ズーム(config.js MAP_FOLLOW.ZOOM=17)
// 付近で「外側26〜32px・内側18〜22px」（指定値）になるよう調整している。
const ROUTE_CASING_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 7,
  14, 13,
  16, 19,
  17, 24,
  18, 31,
  20, 42
];
const ROUTE_MAIN_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 4,
  14, 9,
  16, 14,
  17, 18,
  18, 24,
  20, 34
];

// Mapbox GL JSのline-widthは太さ方向（線を横切る向き）のグラデーションを
// サポートしないため、「中心が明るく外側ほど濃い」指定色は、太さの異なる
// 単色の線を何重にも重ねることで近似する（内側ほど細く・明るい色を上に重ねる）。
// 発光(グロー)効果も同様に、広く・薄い色の線を一番下に重ねて表現する。
//
// 注意：Mapboxのスタイル仕様では ["zoom"] を使った式（interpolate等）は
// 他の式（["*", 係数, 式] など）の中に入れ子にできず、必ず独立したトップレベルの
// interpolate式である必要がある。そのため「ズーム式を係数倍する」場合は、
// ["*", 係数, interpolate式] ではなく、stopの値をあらかじめ係数倍した
// 新しいinterpolate式を作る（実行時ではなく定義時に計算する）。
function scaleWidth(baseExpr, factor) {
  const [type, interpolation, zoomRef, ...stops] = baseExpr;
  const scaledStops = [];
  for (let i = 0; i < stops.length; i += 2) {
    scaledStops.push(stops[i], stops[i + 1] * factor);
  }
  return [type, interpolation, zoomRef, ...scaledStops];
}

const ROUTE_COLORS = {
  glow: 'rgba(85,255,51,0.35)',   // 指定のグロー効果
  casing: '#007A00',              // 最外側の縁取り（濃緑）
  outer: '#00C800',               // 外側の濃い部分
  main: '#55FF33',                // メイン色（ルート中央）
  highlight: '#B8FF9E'            // 中心色（明るい部分）
};

// ルート線の描画（Step9で取得したルートを地図上に表示する）。
// 指定色を外側から順に、グロー(2重・幅広で淡く)→縁取り→外側の濃い緑→メイン→
// 中心のハイライトの6層で重ねる。
export function drawRoute(map, geometry) {
  const data = { type: 'Feature', geometry };
  const source = map.getSource('route-line');
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource('route-line', { type: 'geojson', data });

  const layers = [
    { id: 'route-line-glow-outer', color: ROUTE_COLORS.glow, width: scaleWidth(ROUTE_CASING_WIDTH, 1.8), opacity: 0.5 },
    { id: 'route-line-glow-inner', color: ROUTE_COLORS.glow, width: scaleWidth(ROUTE_CASING_WIDTH, 1.3), opacity: 1 },
    { id: 'route-line-casing', color: ROUTE_COLORS.casing, width: ROUTE_CASING_WIDTH, opacity: 1 },
    { id: 'route-line-outer', color: ROUTE_COLORS.outer, width: scaleWidth(ROUTE_CASING_WIDTH, 0.75), opacity: 1 },
    { id: 'route-line-main', color: ROUTE_COLORS.main, width: ROUTE_MAIN_WIDTH, opacity: 1 },
    { id: 'route-line-highlight', color: ROUTE_COLORS.highlight, width: scaleWidth(ROUTE_MAIN_WIDTH, 0.35), opacity: 1 }
  ];

  layers.forEach(({ id, color, width, opacity }) => {
    map.addLayer({
      id,
      type: 'line',
      source: 'route-line',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': color, 'line-width': width, 'line-opacity': opacity }
    });
  });
}

const ROUTE_LAYER_IDS = [
  'route-line-glow-outer', 'route-line-glow-inner', 'route-line-casing',
  'route-line-outer', 'route-line-main', 'route-line-highlight'
];

export function clearRoute(map) {
  ROUTE_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource('route-line')) map.removeSource('route-line');
}

// 追従カメラ。is3d に応じてpitchを切り替える。
export function followCamera(map, lngLat, heading, { is3d }) {
  map.easeTo({
    center: lngLat,
    zoom: MAP_FOLLOW.ZOOM,
    pitch: is3d ? MAP_FOLLOW.PITCH_3D : MAP_FOLLOW.PITCH_2D,
    bearing: heading ?? map.getBearing(),
    duration: MAP_FOLLOW.EASE_DURATION_MS
  });
}
