/**
 * core/phrase.js — 推奨車線から日本語文言を作る
 * Mapbox・Turf・DOMに一切依存しない。docs/01_SmartLane仕様.md 4節に準拠。
 *
 * JCT・高速出口向けの特殊な言い回し（「この先JCTがあるので」等）は、
 * 02_Phase1実装計画.md の「この段階でやらないこと：ハイウェイモード」に該当するため実装しない。
 * off ramp/on rampも通常の左右寄せロジック（smartLane.js側）でカバーする。
 */

function describeSingleLane(index, laneCount) {
  const fromLeft = index + 1;
  const fromRight = laneCount - index;
  if (fromLeft === 1) return '一番左の車線';
  if (fromRight === 1) return '一番右の車線';
  // 「左から2番目」と「右から3番目」のように2通りで言えるときは、数が小さい方を使う（数えやすいため）。
  return fromLeft <= fromRight ? `左から${fromLeft}番目の車線` : `右から${fromRight}番目の車線`;
}

function describeLaneGroup(indices, laneCount) {
  if (indices.length === 1) {
    return describeSingleLane(indices[0], laneCount) + 'がおすすめです';
  }
  const sorted = [...indices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (max < laneCount / 2) return `左側${sorted.length}車線がおすすめです`;
  if (min >= laneCount / 2) return `右側${sorted.length}車線がおすすめです`;
  return '中央車線がおすすめです';
}

const MODIFIER_LABEL = {
  left: '左折', 'slight left': '斜め左折', 'sharp left': '急な左折',
  right: '右折', 'slight right': '斜め右折', 'sharp right': '急な右折',
  straight: '直進', uturn: 'Uターン'
};

/** maneuverオブジェクトを短い日本語ラベルにする（デバッグ表示・ログ用）。 */
export function describeManeuver(maneuver) {
  if (!maneuver) return null;
  return MODIFIER_LABEL[maneuver.modifier] ?? maneuver.type ?? '進行';
}

const MODIFIER_PREFIX = {
  left: '左折後は',
  'slight left': '左折後は',
  'sharp left': '左折後は',
  right: '右折後は',
  'slight right': '右折後は',
  'sharp right': '右折後は',
  straight: '直進後は',
  uturn: 'Uターン後は'
};

/**
 * @param {{recommendedLanes:number[], targetRoad:'current'|'next'}} advice
 * @param {{laneCount:number, maneuverModifier?:string|null}} context
 */
export function buildPhrase({ recommendedLanes, targetRoad }, { laneCount, maneuverModifier = null }) {
  if (!recommendedLanes || recommendedLanes.length === 0 || !laneCount) return '';

  const body = describeLaneGroup(recommendedLanes, laneCount);
  if (targetRoad !== 'next') return body;

  const prefix = MODIFIER_PREFIX[maneuverModifier] ?? '';
  return prefix + body;
}
