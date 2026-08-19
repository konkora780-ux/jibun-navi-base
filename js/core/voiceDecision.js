/**
 * core/voiceDecision.js — 通常の右左折案内の発話タイミングと文言を決める純粋関数
 *
 * 「今、新たに何を発話すべきか」を返すだけで、実際の発話（speechSynthesis）や
 * 既発話状態の管理はnav/voiceScheduler.jsが行う。Mapbox・DOMには依存しない。
 */
import { describeManeuver } from './phrase.js';

// 一般道／高速道路それぞれの案内距離(m)。大きい順。
export const GENERAL_ROAD_THRESHOLDS_M = [700, 300, 100];
export const HIGHWAY_THRESHOLDS_M = [2000, 1000, 500];

// 「直前」案内は、速度から逆算した秒数と最低距離のどちらか大きい方を使う。
// 高速走行中でも十分な距離的余裕を持って「直前」を発話するため。
const IMMEDIATE_SECONDS = 4;
const IMMEDIATE_MIN_METERS = 30;

function isHighway(roadClass) {
  return roadClass === 'motorway' || roadClass === 'trunk';
}

/**
 * しきい値は「距離がそこまで縮まった瞬間に一度だけ発話する」もの。
 * 逆戻り（古い段階が後から流れる）を防ぐため、今回の距離ですでに満たしている
 * （＝通過済みの）しきい値が複数あっても、一番近い（数値が一番小さい）ものだけを
 * 発話し、それより遠い段階は `consumedKeys` として「発話せず済み扱い」にする。
 * 呼び出し側（nav/voiceScheduler.js）は consumedKeys も announcedKeys に加えることで、
 * 以後その段階が二度と（距離が遠ざかっても）鳴らないようにする。
 *
 * 例：25mから開始 → 「まもなく」だけ発話し、700/300/100は無音で消費する。
 * 例：250mから開始 → 300のみ発話し、700は無音で消費する（700は言わない）。
 *
 * @param {{distanceToManeuverM:number, roadClass:string, speedMPS:number|null, announcedKeys:Set<string>}} state
 * @returns {{key:string, distanceM:number, consumedKeys:string[]} | null} 新たに案内すべき距離段階。無ければnull
 */
export function decideDistanceAnnouncement({ distanceToManeuverM, roadClass, speedMPS, announcedKeys }) {
  if (!Number.isFinite(distanceToManeuverM) || distanceToManeuverM < 0) return null;

  const thresholds = isHighway(roadClass) ? HIGHWAY_THRESHOLDS_M : GENERAL_ROAD_THRESHOLDS_M;
  const speed = Number.isFinite(speedMPS) && speedMPS > 0 ? speedMPS : 0;
  const immediateDistanceM = Math.max(IMMEDIATE_MIN_METERS, speed * IMMEDIATE_SECONDS);

  // 現時点の距離で満たしている（＝すでに通過している）が、まだ発話していないしきい値。
  const satisfiedThresholdKeys = thresholds
    .filter((t) => distanceToManeuverM <= t && !announcedKeys.has(String(t)))
    .map((t) => String(t));

  // 「直前」を最優先でチェック（一番近い、最も重要な案内のため）。
  if (distanceToManeuverM <= immediateDistanceM && !announcedKeys.has('immediate')) {
    return { key: 'immediate', distanceM: distanceToManeuverM, consumedKeys: satisfiedThresholdKeys };
  }

  if (satisfiedThresholdKeys.length === 0) return null;

  const chosenKey = satisfiedThresholdKeys.reduce((min, k) => (Number(k) < Number(min) ? k : min));
  const consumedKeys = satisfiedThresholdKeys.filter((k) => k !== chosenKey);

  return { key: chosenKey, distanceM: Number(chosenKey), consumedKeys };
}

/**
 * 通常の右左折案内文と、可能であればSmartLane車線案内文を1つの自然な文章にまとめる。
 * SmartLaneはConfidenceがhigh/mediumのときだけ声に混ぜる（安全原則5：low/unknownは音声を出さない）。
 *
 * @param {{thresholdKey:string, distanceM:number, roadName:string|null, maneuver:object|null,
 *          smartLanePhrase:string|null, smartLaneConfidence:string|null}} args
 * @returns {string}
 */
export function composeAnnouncementText({
  thresholdKey, distanceM, roadName, maneuver, smartLanePhrase, smartLaneConfidence
}) {
  const modifierLabel = describeManeuver(maneuver) ?? '進路変更';
  const roadText = roadName ? `${roadName}を` : '';

  const base =
    thresholdKey === 'immediate'
      ? `まもなく${roadText}${modifierLabel}です`
      : `${Math.round(distanceM / 10) * 10}メートル先、${roadText}${modifierLabel}です`;

  const canSpeakSmartLane =
    !!smartLanePhrase && (smartLaneConfidence === 'high' || smartLaneConfidence === 'medium');

  return canSpeakSmartLane ? `${base}。${smartLanePhrase}` : base;
}
