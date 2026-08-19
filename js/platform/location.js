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

// 画面消灯防止。sentinelはOS側の判断（画面ロック・タブ非表示等）で自動的にreleaseされるため、
// 呼び出し側（main.js）が 'release' イベントを見て再取得の要否を判断する。
// 戻り値は「未対応」と「対応しているが取得に失敗」を呼び出し側が区別できる形にする
// （利用者向けに違う案内を出すため）。
/**
 * @returns {Promise<{ok:true, sentinel:object} | {ok:false, reason:'unsupported'|'failed'}>}
 */
export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return { ok: false, reason: 'unsupported' };
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    return { ok: true, sentinel };
  } catch (err) {
    console.warn('WakeLock取得失敗:', err.message);
    return { ok: false, reason: 'failed' };
  }
}
