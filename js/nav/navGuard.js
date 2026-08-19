/**
 * nav/navGuard.js — ナビ開始可否の判定（純粋関数）
 * main.jsの状態（destination/position）を受け取って判定するだけで、
 * DOM・Mapbox・fetch等には一切依存しない。単体テストしやすくするための分離。
 */

/**
 * @param {{destination: unknown, position: unknown}} args
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function canStartNav({ destination, position }) {
  if (!destination) {
    return { ok: false, reason: '先に目的地を検索し、候補から選んでください' };
  }
  if (!position) {
    return { ok: false, reason: '現在地を確認しています。位置情報を許可して、少しお待ちください' };
  }
  return { ok: true };
}
