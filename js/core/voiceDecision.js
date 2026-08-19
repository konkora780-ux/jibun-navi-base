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
 * @param {{distanceToManeuverM:number, roadClass:string, speedMPS:number|null, announcedKeys:Set<string>}} state
 * @returns {{key:string, distanceM:number} | null} 新たに案内すべき距離段階。無ければnull
 */
export function decideDistanceAnnouncement({ distanceToManeuverM, roadClass, speedMPS, announcedKeys }) {
  if (!Number.isFinite(distanceToManeuverM) || distanceToManeuverM < 0) return null;

  const thresholds = isHighway(roadClass) ? HIGHWAY_THRESHOLDS_M : GENERAL_ROAD_THRESHOLDS_M;
  const speed = Number.isFinite(speedMPS) && speedMPS > 0 ? speedMPS : 0;
  const immediateDistanceM = Math.max(IMMEDIATE_MIN_METERS, speed * IMMEDIATE_SECONDS);

  // 「直前」を最優先でチェック（一番近い、最も重要な案内のため）。
  if (distanceToManeuverM <= immediateDistanceM && !announcedKeys.has('immediate')) {
    return { key: 'immediate', distanceM: distanceToManeuverM };
  }

  // 遠い方から順に、まだ案内しておらず、既に距離を下回っている最初の段階を返す。
  for (const t of thresholds) {
    if (distanceToManeuverM <= t && !announcedKeys.has(String(t))) {
      return { key: String(t), distanceM: t };
    }
  }
  return null;
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
