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
    return { ok: false, reason: '目的地を検索してから「ナビ開始」を押してください' };
  }
  if (!position) {
    return { ok: false, reason: '現在地を取得できていません。少し待ってから試してください' };
  }
  return { ok: true };
}
