/**
 * nav/arrivalTracker.js — 到着判定の継続時間を管理する（DOM非依存）
 *
 * core/arrivalJudge.jsの瞬間判定を毎回の位置更新で呼び、到着候補の状態が
 * ARRIVAL.SUSTAIN_SECONDS秒続いたら正式に「到着」と判定する。
 * 範囲外に出たら継続時間はリセットされる（GPSの一瞬のブレで早期終了しないため）。
 */
import { isWithinArrivalRange } from '../core/arrivalJudge.js';

export function createArrivalTracker(config) {
  let withinSince = null; // 到着候補の状態に入った時刻(ms) | null

  return {
    reset() {
      withinSince = null;
    },

    /**
     * @param {{straightLineDistanceM:number, routeRemainingDistanceM:number|null,
     *          speedMPS:number|null, gpsAccuracyM:number|null}} snapshot
     * @param {number} [now]
     * @returns {boolean} 今回の更新で正式に「到着」と判定されたか
     */
    update(snapshot, now = Date.now()) {
      const within = isWithinArrivalRange(snapshot, config);
      if (!within) {
        withinSince = null;
        return false;
      }
      if (withinSince == null) withinSince = now;
      return now - withinSince >= config.SUSTAIN_SECONDS * 1000;
    }
  };
}
