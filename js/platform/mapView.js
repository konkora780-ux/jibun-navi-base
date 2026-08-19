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
