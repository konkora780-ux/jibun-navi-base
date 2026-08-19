/**
 * core/formatNavigation.js — 距離・時間・到着予定時刻の表示用フォーマット（純粋関数）
 * Mapbox・Turf・DOMに一切依存しない。NaN/Infinity/負数はすべて「取得不可」として扱う。
 */

/**
 * @param {number} meters
 * @returns {string} 例："300 m" "1.2 km" "—"（不正値のとき）
 */
export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) {
    // 近距離ほど細かく丸める：100m未満は10m単位、それ以上1km未満は50m単位。
    const step = meters < 100 ? 10 : 50;
    return `${Math.round(meters / step) * step} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * @param {number} seconds
 * @returns {string} 例："25分" "1時間5分" "—"（不正値のとき）
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}分`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/**
 * @param {number} nowMs 現在時刻（Date.now()相当）
 * @param {number} remainingSeconds 残り時間(秒)
 * @returns {string} 24時間表記の"HH:MM"。不正値のときは"—"
 */
export function formatETA(nowMs, remainingSeconds) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(remainingSeconds) || remainingSeconds < 0) return '—';
  const eta = new Date(nowMs + remainingSeconds * 1000);
  const hh = String(eta.getHours()).padStart(2, '0');
  const mm = String(eta.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 音声案内・画面表示の両方が同じ道路名を使うための、唯一の判定元。
 * 「これから入る道路」を優先し、分からない場合だけ現在の道路名にフォールバックする。
 * @param {{name:string|null}|null} currentRoad
 * @param {{name:string|null}|null} nextRoad
 * @returns {string|null}
 */
export function resolveUpcomingRoadName(currentRoad, nextRoad) {
  return nextRoad?.name ?? currentRoad?.name ?? null;
}

/**
 * 画面表示用のラベル。次の道路が分かる場合は「次：○○」、
 * 現在道路へのフォールバック時はそのままの道路名を返す（現在地の道路を
 * 「次」と呼ぶと誤解を招くため、prefixは次の道路が分かるときだけ付ける）。
 * @param {{name:string|null}|null} currentRoad
 * @param {{name:string|null}|null} nextRoad
 * @returns {string} 道路名が全く分からない場合は「（道路名不明）」
 */
export function formatUpcomingRoadLabel(currentRoad, nextRoad) {
  if (nextRoad?.name) return `次：${nextRoad.name}`;
  return resolveUpcomingRoadName(currentRoad, nextRoad) ?? '（道路名不明）';
}
