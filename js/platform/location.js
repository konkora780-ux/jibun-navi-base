/**
 * platform/location.js — Geolocation のラッパ
 * Mapbox・DOM描画には触れず、座標データを渡すだけにする。
 */

export function watchPosition(onUpdate, onError) {
  if (!('geolocation' in navigator)) {
    onError(new Error('この端末はGeolocationに対応していません'));
    return null;
  }
  return navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,   // メートル。SmartLaneの安全判定に必須
        speed: pos.coords.speed ?? null,         // m/s。取得不可はnull
        heading: pos.coords.heading ?? null,     // 度。静止時はnullになりやすい
        timestamp: pos.timestamp
      });
    },
    (err) => onError(err),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
  );
}

export function clearWatch(watchId) {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
}
