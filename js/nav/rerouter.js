/**
 * nav/rerouter.js — 逸脱検知に応じた再ルート要求の管理
 * Directions APIの呼びすぎ（課金事故）を防ぐため、再ルートの最短間隔を必ず守る。
 * routeTracker.update()のisOffRoute判定を受け取り、「今回は再ルートしてよいか」だけを返す。
 * 実際にfetchRouteを呼ぶのはmain.js側の責務。
 */
import { REROUTE } from '../config.js';

export function createRerouter() {
  let lastRerouteAt = 0;

  return {
    /**
     * @param {boolean} isOffRoute
     * @param {number} [now]
     * @returns {boolean}
     */
    shouldReroute(isOffRoute, now = Date.now()) {
      if (!isOffRoute) return false;
      if (now - lastRerouteAt < REROUTE.MIN_INTERVAL_SECONDS * 1000) return false;
      lastRerouteAt = now;
      return true;
    }
  };
}
