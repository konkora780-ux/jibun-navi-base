/**
 * core/smartLane.js — SmartLaneRecommendation本体
 *
 * docs/01_SmartLane仕様.md の8原則・判定アルゴリズムに従う。
 * Mapbox・Turf・DOMに一切依存しない純粋なJavaScript。
 *
 * 【安全原則（最上位ルール）】
 * 1. 取得できない車線情報を推測で補完しない
 * 2. isValid===falseの車線は絶対に推奨しない
 * 3. GPS精度が悪い場合は独自車線案内を抑制する
 * 4. 直前の無理な車線変更を促さない
 * 5. Confidenceが LOW/UNKNOWN の場合は独自車線音声案内を出さない
 * 6. Mapbox標準案内を常にフォールバックとして残す（＝呼び出し側の責務）
 * 7. SmartLaneは「最短ルート」ではなく「安全かつ次の操作につながりやすい車線」を選ぶ
 * 8. データ不足時は、案内しないことを正解とする
 */
import { createSmartLaneAdvice } from './models.js';
import { buildPhrase, describeManeuver } from './phrase.js';
import { GPS_ACCURACY, LANE_CHANGE, SMART_LANE_ENABLED_ROAD_CLASSES } from '../config.js';

function noGuidance({ confidence, reason, targetRoad = 'current', gpsDowngraded = false }) {
  return createSmartLaneAdvice({
    recommendedLanes: [],
    phrase: '',
    reason,
    confidence,
    targetRoad,
    gpsDowngraded
  });
}

// 次々の曲がり方から「候補のどちら端に寄せるか」を決める（日本は左側通行）。
// sharp left/rightは仕様書の表に無いが、left/rightと同じ寄せ方が妥当なため含める。
// uturnは明確な根拠が無いため中央寄り(isActive優先)にフォールバックし、推測で断定しない。
function resolveSide(maneuver) {
  if (!maneuver) return 'unknown';
  if (maneuver.type === 'off ramp' || maneuver.type === 'on ramp') return 'left';
  switch (maneuver.modifier) {
    case 'left':
    case 'slight left':
    case 'sharp left':
      return 'left';
    case 'right':
    case 'slight right':
    case 'sharp right':
      return 'right';
    case 'straight':
      return 'straight';
    default:
      return 'unknown';
  }
}

// candidates: [{lane, index}]（isValid===trueのものだけ。左から右の順）
function pickIndices(candidates, side) {
  const indices = candidates.map((c) => c.index);
  if (side === 'left') return [Math.min(...indices)];
  if (side === 'right') return [Math.max(...indices)];

  // straight/unknown: isActiveを優先。無ければ候補の中央寄りを選ぶ。
  const activeIndices = candidates.filter((c) => c.lane.isActive).map((c) => c.index);
  if (activeIndices.length > 0) return activeIndices;
  const mid = indices[Math.floor((indices.length - 1) / 2)];
  return [mid];
}

/**
 * 現在道路上での車線変更に十分な距離があるかを確認する。
 * 基準（reference）は isActive な車線。無ければ判定不能として'unknown'を返す
 * （基準が無いまま「不足」と決めつけるのは推測になるため）。
 */
function checkLaneChangeDistance({ chosenIndices, validCurrent, distanceToCurrent, currentSpeed }) {
  const activeIndices = validCurrent.filter((c) => c.lane.isActive).map((c) => c.index);
  if (activeIndices.length === 0) return { status: 'unknown', changesNeeded: null };

  const changesNeeded = Math.min(
    ...chosenIndices.map((chosen) => Math.min(...activeIndices.map((a) => Math.abs(chosen - a))))
  );
  if (changesNeeded === 0) return { status: 'ok', changesNeeded };

  const requiredDistance = changesNeeded * LANE_CHANGE.SECONDS_PER_CHANGE * (currentSpeed ?? 0);
  if (distanceToCurrent >= requiredDistance) return { status: 'ok', changesNeeded };
  if (distanceToCurrent >= requiredDistance * LANE_CHANGE.CRITICAL_RATIO) {
    return { status: 'insufficient', changesNeeded };
  }
  return { status: 'critical', changesNeeded };
}

/**
 * @param {import('./models.js').SmartLaneInput} input
 * @returns {import('./models.js').SmartLaneAdvice}
 */
export function evaluateSmartLane(input) {
  const {
    currentRoad, currentManeuver, distanceToCurrent,
    nextRoad, followingManeuver,
    currentSpeed, gpsAccuracy
  } = input;

  // ステップ-1：この道路種別でSmartLaneが有効化されているか（Phase2判定パターンB対応）。
  // データが取得できるかどうかとは別軸の「方針としてOFFにする」判定のため、最初に行う。
  if (!SMART_LANE_ENABLED_ROAD_CLASSES[currentRoad.roadClass]) {
    return noGuidance({
      confidence: 'unknown',
      reason: `roadClass=${currentRoad.roadClass} はSmartLane無効設定のため標準案内のみ`
    });
  }

  // ステップ0：データ有無の確認
  if (!currentRoad.lanes || currentRoad.lanes.length === 0) {
    return noGuidance({ confidence: 'unknown', reason: '現在道路の車線データが取得できない' });
  }
  if (currentRoad.lanes.length === 1) {
    return noGuidance({ confidence: 'unknown', reason: '車線が1本のため案内不要' });
  }

  // ステップ0.5：GPS精度チェック（他のどの判定よりも先に行う。安全原則3）
  const gpsUnusable = gpsAccuracy == null || gpsAccuracy > GPS_ACCURACY.DEGRADED;
  const gpsMild = !gpsUnusable && gpsAccuracy > GPS_ACCURACY.GOOD;
  if (gpsUnusable) {
    return noGuidance({
      confidence: gpsAccuracy == null ? 'unknown' : 'low',
      reason: 'GPS精度が低いため独自車線案内を停止',
      gpsDowngraded: true
    });
  }

  // ステップ1：現在道路で実行可能な車線を絞る（安全原則2：isValid=falseは候補に含めない）
  const validCurrent = currentRoad.lanes
    .map((lane, index) => ({ lane, index }))
    .filter((c) => c.lane.isValid);
  if (validCurrent.length === 0) {
    return noGuidance({ confidence: 'unknown', reason: '現在道路に有効な車線が無い' });
  }

  // ステップ2：次の次(followingManeuver)を見て、現在道路上で寄せる方向を決める。
  // currentManeuverではない点に注意：isValidの絞り込みで既に「currentManeuverを実行できる車線」
  // に候補が絞られているため、その中でどちらに寄せるかは「その後どちらに行きたいか」で決める。
  const currentSide = resolveSide(followingManeuver);
  const chosenOnCurrent = pickIndices(validCurrent, currentSide);

  // ステップ3：曲がった先の推奨車線（nextRoad.lanesがある場合のみ。isValidを先に絞ってから選ぶ）
  let targetRoad = 'current';
  let finalChosen = chosenOnCurrent;
  let nextRoadHasData = false;
  if (nextRoad?.lanes && nextRoad.lanes.length > 0) {
    const validNext = nextRoad.lanes
      .map((lane, index) => ({ lane, index }))
      .filter((c) => c.lane.isValid);
    if (validNext.length > 0) {
      const nextSide = resolveSide(followingManeuver);
      finalChosen = pickIndices(validNext, nextSide);
      targetRoad = 'next';
      nextRoadHasData = true;
    }
  }

  // ステップ4：現在道路上での車線変更に十分な距離があるか（targetRoadに関わらず現在道路の話）
  const laneChange = checkLaneChangeDistance({
    chosenIndices: chosenOnCurrent,
    validCurrent,
    distanceToCurrent,
    currentSpeed
  });
  if (laneChange.status === 'critical') {
    return noGuidance({
      confidence: 'low',
      reason: '車線変更に十分な距離が無い',
      gpsDowngraded: gpsMild
    });
  }

  // ステップ5：Confidenceの決定（デモーション要因の数で段階を決める）
  let demotions = 0;
  if (!followingManeuver) demotions += 1;
  if (!nextRoadHasData) demotions += 1;
  if (laneChange.status === 'insufficient') demotions += 1;
  if (gpsMild) demotions += 1;
  const confidence = demotions === 0 ? 'high' : demotions === 1 ? 'medium' : 'low';

  const laneCount = targetRoad === 'next'
    ? (nextRoad.laneCount ?? nextRoad.lanes.length)
    : (currentRoad.laneCount ?? currentRoad.lanes.length);

  const phrase = buildPhrase(
    { recommendedLanes: finalChosen, targetRoad },
    { laneCount, maneuverModifier: targetRoad === 'next' ? currentManeuver?.modifier ?? null : null }
  );

  const reason = targetRoad === 'next'
    ? `${describeManeuver(currentManeuver)}後、${describeManeuver(followingManeuver)}のため${finalChosen.length === 1 ? `index ${finalChosen[0]}` : `index ${finalChosen.join(',')}`}を選択`
    : `${describeManeuver(currentManeuver)}のため${finalChosen.length === 1 ? `index ${finalChosen[0]}` : `index ${finalChosen.join(',')}`}を選択`;

  return createSmartLaneAdvice({
    recommendedLanes: finalChosen,
    phrase,
    reason,
    confidence,
    targetRoad,
    gpsDowngraded: gpsMild
  });
}
