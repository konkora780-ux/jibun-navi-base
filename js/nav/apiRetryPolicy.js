/**
 * nav/apiRetryPolicy.js — 外部API（Directions等）呼び出し失敗時の再試行を管理する
 * Mapbox APIへの無制限リトライ（＝課金事故）を防ぐため、回数上限と最短間隔を設ける。
 * DOM非依存。
 */

export function createApiRetryPolicy(config) {
  let attempts = 0;
  let lastAttemptAt = 0;

  return {
    reset() {
      attempts = 0;
      lastAttemptAt = 0;
    },

    /**
     * @param {number} [now]
     * @returns {{ok:true} | {ok:false, reason:'max-attempts'|'too-soon'}}
     */
    canRetry(now = Date.now()) {
      if (attempts >= config.MAX_ATTEMPTS) return { ok: false, reason: 'max-attempts' };
      if (attempts > 0 && now - lastAttemptAt < config.INTERVAL_SECONDS * 1000) {
        return { ok: false, reason: 'too-soon' };
      }
      return { ok: true };
    },

    recordAttempt(now = Date.now()) {
      attempts += 1;
      lastAttemptAt = now;
    },

    getAttempts() {
      return attempts;
    }
  };
}
