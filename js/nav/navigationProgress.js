/**
 * nav/navigationProgress.js — 残り距離・残り時間の計算（DOM非依存）
 *
 * routeTrackerが返すprogressDistanceと、ルート全体の距離・所要時間から算出する。
 * GPSのふらつきで自車位置が一時的に後退したように見えても、残り距離が
 * 見た目上増えて跳ねないよう、同一ルートである限りは単調減少になるよう平滑化する
 * （再ルートでroute自体が変わった場合はリセットする）。
 */

export function createNavigationProgress() {
  let lastRoute = null;
  let lastRemainingDistanceM = null;

  return {
    reset() {
      lastRoute = null;
      lastRemainingDistanceM = null;
    },

    /**
     * @param {{distance:number, duration:number}} route Directions APIの正規化済みルート
     * @param {{progressDistance:number}} trackResult routeTracker.update()の戻り値
     * @returns {{remainingDistanceM:number|null, remainingSeconds:number|null}}
     */
    update(route, trackResult) {
      if (!Number.isFinite(route?.distance) || !Number.isFinite(route?.duration)) {
        return { remainingDistanceM: null, remainingSeconds: null };
      }

      const progress = Number.isFinite(trackResult?.progressDistance) ? trackResult.progressDistance : 0;
      const clampedProgress = Math.min(Math.max(progress, 0), route.distance);
      let remainingDistanceM = route.distance - clampedProgress;

      // 同じルートを走っている間は、残り距離が一時的に増えて見えないよう
      // 単調減少にする（再ルートでrouteの参照が変わったときだけリセットされる）。
      if (lastRoute === route && lastRemainingDistanceM != null) {
        remainingDistanceM = Math.min(remainingDistanceM, lastRemainingDistanceM);
      }
      lastRoute = route;
      lastRemainingDistanceM = remainingDistanceM;

      // Directions APIは区間ごとの所要時間の内訳までは正規化していないため、
      // 全体の距離に対する残り距離の比率で所要時間を按分する簡易計算とする。
      const ratio = route.distance > 0 ? remainingDistanceM / route.distance : 0;
      const remainingSeconds = route.duration * ratio;

      return { remainingDistanceM, remainingSeconds };
    }
  };
}
