/**
 * core/arrivalJudge.js — 到着の瞬間判定（純粋関数）
 *
 * ここでは「今この瞬間、到着範囲内と言えるか」だけを判定する。
 * 「一定時間その状態が続いたら正式に到着とする」という継続時間の管理は
 * nav/arrivalTracker.js が行う（GPSの一瞬のブレだけで到着と誤判定しないため）。
 *
 * 安全原則：データが不足している・信頼できない場合は「到着していない」を返す
 * （早期終了より、到着し損ねる方が安全）。
 */

/**
 * @param {{straightLineDistanceM:number, routeRemainingDistanceM:number|null,
 *          speedMPS:number|null, gpsAccuracyM:number|null}} snapshot
 * @param {{RADIUS_M:number, MAX_GPS_ACCURACY_M:number, MAX_SPEED_MPS:number}} config
 * @returns {boolean}
 */
export function isWithinArrivalRange(
  { straightLineDistanceM, routeRemainingDistanceM, speedMPS, gpsAccuracyM },
  config
) {
  if (!Number.isFinite(straightLineDistanceM)) return false;

  // GPS精度が悪い、または取得不可のときは判定しない（安全側に倒す）。
  if (gpsAccuracyM == null || !Number.isFinite(gpsAccuracyM) || gpsAccuracyM > config.MAX_GPS_ACCURACY_M) {
    return false;
  }

  // 速い速度で目的地付近を通過しているだけの場合（例：近くの高速道路を走行中）は
  // 到着とみなさない。速度が取得できない場合は、この条件では弾かない。
  if (Number.isFinite(speedMPS) && speedMPS > config.MAX_SPEED_MPS) return false;

  const withinStraightLine = straightLineDistanceM <= config.RADIUS_M;

  // ルート上の残り距離が分かる場合は、それも到着範囲内であることを求める。
  // 直線距離だけが近くても、実際の道路上ではまだ大きく迂回が必要なことがあるため
  // （例：川や線路を挟んで目的地の対岸にいる場合）。
  const withinRoute =
    routeRemainingDistanceM == null || !Number.isFinite(routeRemainingDistanceM)
      ? true
      : routeRemainingDistanceM <= config.RADIUS_M * 2;

  return withinStraightLine && withinRoute;
}
