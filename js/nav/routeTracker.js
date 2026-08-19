/**
 * nav/routeTracker.js — 自車位置→ルート上の位置・残距離・現在stepの追跡
 *
 * Turf.js の nearestPointOnLine で自車位置をルートのLineStringに吸着させ、
 * 進行距離（ルート先頭からの累積距離）から「今どのstepにいるか」「次の曲がり角まで何m」を算出する。
 * ルートから REROUTE.OFF_ROUTE_METERS 以上離れた状態が REROUTE.OFF_ROUTE_SECONDS 秒続いたら
 * 逸脱と判定する（実際の再ルート要求はStep9のrerouter.jsが行う。ここでは判定のみ）。
 *
 * Mapbox・DOMには依存しないが、Turf.js（CDNで読み込むグローバル turf）には依存する。
 *
 * nearestPointOnLine の戻り値は新プロパティ名（lineDistance/pointDistance）を使う。
 * 旧名（location/dist）は非推奨のため使わない（実際に読み込んだTurf 7系でどちらも
 * 返ることを確認済みだが、将来のバージョンで旧名が削除される可能性があるため）。
 */
import { REROUTE } from '../config.js';

export function createRouteTracker(route) {
  const lineString = turf.lineString(route.geometry.coordinates);

  // 各stepの開始距離（ルート先頭からの累積距離,m）を事前計算しておく。
  const stepStartDistances = [];
  let cumulative = 0;
  route.steps.forEach((step) => {
    stepStartDistances.push(cumulative);
    cumulative += step.distance;
  });

  let offRouteSince = null; // 逸脱候補になった時刻(ms) | null（連続していなければリセット）

  function findStepIndex(progressDistance) {
    for (let i = stepStartDistances.length - 1; i >= 0; i--) {
      if (progressDistance >= stepStartDistances[i]) return i;
    }
    return 0;
  }

  return {
    /**
     * @param {{lat:number, lon:number}} position
     * @param {number} [now] テスト用に時刻を差し替えられるようにDate.now()をデフォルト引数にする
     */
    update({ lat, lon }, now = Date.now()) {
      const snapped = turf.nearestPointOnLine(lineString, turf.point([lon, lat]), { units: 'meters' });
      const progressDistance = snapped.properties.lineDistance;
      const offRouteDistance = snapped.properties.pointDistance;

      const stepIndex = findStepIndex(progressDistance);
      const step = route.steps[stepIndex];
      const distanceToCurrentManeuver = Math.max(
        0,
        stepStartDistances[stepIndex] + step.distance - progressDistance
      );

      let isOffRoute = false;
      if (offRouteDistance > REROUTE.OFF_ROUTE_METERS) {
        if (offRouteSince == null) offRouteSince = now;
        isOffRoute = now - offRouteSince >= REROUTE.OFF_ROUTE_SECONDS * 1000;
      } else {
        offRouteSince = null;
      }

      return {
        snappedLocation: snapped.geometry.coordinates, // [lon, lat]
        progressDistance,       // ルート先頭からの進行距離(m)
        offRouteDistance,       // ルートからの垂直距離(m)
        isOffRoute,
        stepIndex,
        distanceToCurrentManeuver // 現在stepを終える曲がり角までの残距離(m)
      };
    }
  };
}
