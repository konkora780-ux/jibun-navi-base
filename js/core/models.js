/**
 * core/models.js — データ型の定義とファクトリ関数
 *
 * Mapbox・Turf・DOM に一切依存しない純粋なJavaScript。
 * 将来Androidネイティブ版を作るとき、そのままKotlinへ写せるようにするための制約。
 * 詳細は docs/01_SmartLane仕様.md の「1. データ型」を参照。
 */

export const LANE_DIRECTIONS = [
  'left', 'slightLeft', 'straight', 'slightRight', 'right', 'uturn', 'none'
];

export const ROAD_CLASSES = [
  'motorway', 'trunk', 'primary', 'secondary', 'street', 'unknown'
];

export const MANEUVER_TYPES = [
  'turn', 'fork', 'merge', 'on ramp', 'off ramp', 'roundabout', 'arrive'
];

export const MANEUVER_MODIFIERS = [
  'left', 'slight left', 'straight', 'slight right', 'right', 'uturn'
];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low', 'unknown'];

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} は ${allowed.join(' / ')} のいずれかである必要があります（実際: ${value}）`);
  }
}

/**
 * LaneInfo — 1車線ぶんの情報。
 * 車線配列は必ず左から右の順に並べる（index 0 が一番左）。これは呼び出し側の責任。
 */
export function createLaneInfo({ indications, isValid, isActive }) {
  if (!Array.isArray(indications) || indications.length === 0) {
    throw new Error('LaneInfo.indications は空でない配列である必要があります');
  }
  indications.forEach((d) => assertOneOf(d, LANE_DIRECTIONS, 'LaneInfo.indications の要素'));
  return {
    indications: [...indications],
    isValid: Boolean(isValid),
    isActive: Boolean(isActive)
  };
}

/**
 * RoadSnapshot — ある道路の状態。
 * lanes/laneCount は、取得できない場合は必ず null にする（0や空配列で誤魔化さない。安全原則1）。
 */
export function createRoadSnapshot({ name = null, lanes = null, laneCount = null, roadClass }) {
  assertOneOf(roadClass, ROAD_CLASSES, 'RoadSnapshot.roadClass');

  let normalizedLanes = null;
  if (lanes != null) {
    if (!Array.isArray(lanes)) {
      throw new Error('RoadSnapshot.lanes は配列または null である必要があります');
    }
    normalizedLanes = lanes.map((lane) => createLaneInfo(lane));
  }

  return {
    name,
    lanes: normalizedLanes,
    laneCount: normalizedLanes != null ? normalizedLanes.length : laneCount,
    roadClass
  };
}

/**
 * ManeuverInfo — 曲がり方の情報。
 */
export function createManeuverInfo({ type, modifier = null, isJunction = false }) {
  assertOneOf(type, MANEUVER_TYPES, 'ManeuverInfo.type');
  if (modifier !== null) {
    assertOneOf(modifier, MANEUVER_MODIFIERS, 'ManeuverInfo.modifier');
  }
  return { type, modifier, isJunction: Boolean(isJunction) };
}

/**
 * SmartLaneInput — SmartLane判定への入力一式。
 * gpsAccuracy は安全原則3・5の判定に必須（取得不可なら null）。
 */
export function createSmartLaneInput({
  currentRoad,
  currentManeuver,
  distanceToCurrent,
  nextRoad = null,
  followingManeuver = null,
  distanceToFollowing = null,
  currentSpeed,
  gpsAccuracy = null
}) {
  return {
    currentRoad,
    currentManeuver,
    distanceToCurrent,
    nextRoad,
    followingManeuver,
    distanceToFollowing,
    currentSpeed,
    gpsAccuracy
  };
}

/**
 * SmartLaneAdvice — SmartLane判定の出力一式。
 */
export function createSmartLaneAdvice({
  recommendedLanes = [],
  phrase = '',
  reason = '',
  confidence,
  targetRoad,
  gpsDowngraded = false
}) {
  assertOneOf(confidence, CONFIDENCE_LEVELS, 'SmartLaneAdvice.confidence');
  assertOneOf(targetRoad, ['current', 'next'], 'SmartLaneAdvice.targetRoad');
  return {
    recommendedLanes: [...recommendedLanes],
    phrase,
    reason,
    confidence,
    targetRoad,
    gpsDowngraded: Boolean(gpsDowngraded)
  };
}
