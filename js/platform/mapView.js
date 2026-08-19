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

// 検索で選んだ目的地のマーカー。Mapbox標準のピン(赤)をそのまま使う。
export function createDestinationMarker(map) {
  const marker = new mapboxgl.Marker({ color: '#f85149' }).setLngLat([0, 0]);
  let added = false;

  return {
    update(lngLat) {
      marker.setLngLat(lngLat);
      if (!added) {
        marker.addTo(map);
        added = true;
      }
    }
  };
}

// ズームレベルに応じて線幅を変える式。各層ごとに独立したinterpolate式にしている。
// 理由：Mapboxのスタイル仕様では ["zoom"] を使った式は他の式（["*", 係数, 式] 等）に
// 入れ子にできず、必ず独立したトップレベルのinterpolate式である必要があるため。
const ROUTE_GLOW_OUTER_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 12, 14, 22, 16, 31, 17, 38, 18, 49, 20, 66
];
const ROUTE_GLOW_INNER_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 9, 14, 17, 16, 24, 17, 30, 18, 39, 20, 53
];
const ROUTE_CASING_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 9, 14, 17, 16, 26, 17, 30, 18, 32, 20, 43
];
const ROUTE_OUTER_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 7, 14, 14, 16, 22, 17, 26, 18, 28, 20, 38
];
const ROUTE_MAIN_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 5, 14, 11, 16, 18, 17, 22, 18, 24, 20, 34
];
const ROUTE_HIGHLIGHT_WIDTH = [
  'interpolate', ['linear'], ['zoom'],
  10, 2, 14, 4, 16, 7, 17, 8, 18, 10, 20, 14
];

const ROUTE_COLORS = {
  glow: '#55FF33',
  casing: '#007A00',
  outer: '#00C800',
  main: '#55FF33',
  highlight: '#B8FF9E'
};

// ルート線の描画（Step9で取得したルートを地図上に表示する）。
// グロー(2重)→縁取り→外側の濃い緑→メイン→中心のハイライトの6層で重ねる。
export function drawRoute(map, geometry) {
  const data = { type: 'Feature', geometry };
  const source = map.getSource('route-line');
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource('route-line', { type: 'geojson', data });

  const layers = [
    { id: 'route-line-glow-outer', color: ROUTE_COLORS.glow, width: ROUTE_GLOW_OUTER_WIDTH, opacity: 0.18 },
    { id: 'route-line-glow-inner', color: ROUTE_COLORS.glow, width: ROUTE_GLOW_INNER_WIDTH, opacity: 0.25 },
    { id: 'route-line-casing', color: ROUTE_COLORS.casing, width: ROUTE_CASING_WIDTH, opacity: 1.0 },
    { id: 'route-line-outer', color: ROUTE_COLORS.outer, width: ROUTE_OUTER_WIDTH, opacity: 1.0 },
    { id: 'route-line-main', color: ROUTE_COLORS.main, width: ROUTE_MAIN_WIDTH, opacity: 1.0 },
    { id: 'route-line-highlight', color: ROUTE_COLORS.highlight, width: ROUTE_HIGHLIGHT_WIDTH, opacity: 0.9 }
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
