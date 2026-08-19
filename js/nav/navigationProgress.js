/**
 * nav/navigationProgress.js — 残り距離・残り時間の計算（DOM非依存）
 *
 * 残り距離は routeTracker が返す progressDistance と、ルート全体の距離から算出する。
 * 残り時間は、Directions API が各stepごとに持つ distance/duration を使い、
 *   現在stepの残り時間（そのstepの残距離比率でdurationを按分） + 後続stepのduration合計
 * で算出する（高速と一般道が混ざるルートでも、区間ごとの実際の所要時間を反映できるため、
 * ルート全体の距離比率で一律に按分する簡易計算より精度が高い）。
 * stepデータが無い・不正な場合は、従来のルート全体の距離比率による簡易計算にフォールバックする。
 *
 * GPSのふらつきで自車位置が一時的に後退したように見えても、残り距離・残り時間が
 * 見た目上増えて跳ねないよう、同一ルートである限りはどちらも単調減少になるよう平滑化する
 * （再ルートでroute自体が変わった場合はリセットする）。
 */

// ルート全体の距離比率でdurationを按分する簡易計算（stepデータが使えない場合の安全なフォールバック）。
function fallbackRatioRemainingSeconds(route, trackResult) {
  const progress = Number.isFinite(trackResult?.progressDistance) ? trackResult.progressDistance : 0;
  const clampedProgress = Math.min(Math.max(progress, 0), route.distance);
  const remainingDistanceM = route.distance - clampedProgress;
  const ratio = route.distance > 0 ? remainingDistanceM / route.distance : 0;
  return route.duration * ratio;
}

// 現在stepの残距離比率でdurationを按分し、後続stepのdurationを合計する。
function computeStepBasedRemainingSeconds(route, trackResult) {
  const steps = route.steps;
  const stepIndex = trackResult?.stepIndex;
  if (!Array.isArray(steps) || !Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
    return fallbackRatioRemainingSeconds(route, trackResult);
  }

  const currentStep = steps[stepIndex];
  if (!Number.isFinite(currentStep?.distance) || !Number.isFinite(currentStep?.duration) || currentStep.distance <= 0) {
    return fallbackRatioRemainingSeconds(route, trackResult);
  }

  const remainingInStepM = Number.isFinite(trackResult?.distanceToCurrentManeuver)
    ? Math.min(Math.max(trackResult.distanceToCurrentManeuver, 0), currentStep.distance)
    : currentStep.distance;
  const currentStepRemainingSeconds = currentStep.duration * (remainingInStepM / currentStep.distance);

  let subsequentSeconds = 0;
  for (let i = stepIndex + 1; i < steps.length; i++) {
    const d = steps[i]?.duration;
    // 後続stepのdurationが不正な場合、そこだけ無視すると過少評価になり利用者の判断を誤らせるため、
    // 安全側として全体をルート比率の簡易計算へフォールバックする。
    if (!Number.isFinite(d)) return fallbackRatioRemainingSeconds(route, trackResult);
    subsequentSeconds += d;
  }

  return currentStepRemainingSeconds + subsequentSeconds;
}

export function createNavigationProgress() {
  let lastRoute = null;
  let lastRemainingDistanceM = null;
  let lastRemainingSeconds = null;

  return {
    reset() {
      lastRoute = null;
      lastRemainingDistanceM = null;
      lastRemainingSeconds = null;
    },

    /**
     * @param {{distance:number, duration:number, steps?:Array<{distance:number,duration:number}>}} route Directions APIの正規化済みルート
     * @param {{progressDistance:number, stepIndex?:number, distanceToCurrentManeuver?:number}} trackResult routeTracker.update()の戻り値
     * @returns {{remainingDistanceM:number|null, remainingSeconds:number|null}}
     */
    update(route, trackResult) {
      if (!Number.isFinite(route?.distance) || !Number.isFinite(route?.duration)) {
        return { remainingDistanceM: null, remainingSeconds: null };
      }

      const progress = Number.isFinite(trackResult?.progressDistance) ? trackResult.progressDistance : 0;
      const clampedProgress = Math.min(Math.max(progress, 0), route.distance);
      let remainingDistanceM = route.distance - clampedProgress;

      let remainingSeconds = computeStepBasedRemainingSeconds(route, trackResult);
      if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) remainingSeconds = null;

      // 同じルートを走っている間は、残り距離・残り時間が一時的に増えて見えないよう
      // 単調減少にする（再ルートでrouteの参照が変わったときだけリセットされる）。
      if (lastRoute === route) {
        if (lastRemainingDistanceM != null) {
          remainingDistanceM = Math.min(remainingDistanceM, lastRemainingDistanceM);
        }
        if (lastRemainingSeconds != null && remainingSeconds != null) {
          remainingSeconds = Math.min(remainingSeconds, lastRemainingSeconds);
        }
      }

      lastRoute = route;
      lastRemainingDistanceM = remainingDistanceM;
      lastRemainingSeconds = remainingSeconds;

      return { remainingDistanceM, remainingSeconds };
    }
  };
}
