/**
 * ui/maneuverIcon.js — 次の操作を表す方向アイコン（自作SVG、24x24 viewBox）
 *
 * 他社カーナビ（COCCHi等）の画像・アイコンはコピーせず、単純な線と矢印だけで
 * 独自に構成する。未知のtype/modifierの組み合わせが来た場合は、誤った矢印を
 * 推測せず、汎用的な「直進矢印」へ安全にフォールバックする（安全原則1・8）。
 */

const SVG_OPEN = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
const SVG_CLOSE = '</svg>';
const STROKE = 'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"';

const ICONS = {
  straight: `${SVG_OPEN}<path d="M12,20 L12,6 M6,11 L12,5 L18,11" ${STROKE}/>${SVG_CLOSE}`,

  left: `${SVG_OPEN}<path d="M12,20 L12,13 C12,8 9,6 4,6 M8,2 L2,6 L8,10" ${STROKE}/>${SVG_CLOSE}`,
  right: `${SVG_OPEN}<path d="M12,20 L12,13 C12,8 15,6 20,6 M16,2 L22,6 L16,10" ${STROKE}/>${SVG_CLOSE}`,

  slightLeft: `${SVG_OPEN}<path d="M12,20 L12,10 C12,7 10,5 6,4 M9,1 L4,4 L8,7" ${STROKE}/>${SVG_CLOSE}`,
  slightRight: `${SVG_OPEN}<path d="M12,20 L12,10 C12,7 14,5 18,4 M15,1 L20,4 L16,7" ${STROKE}/>${SVG_CLOSE}`,

  uturn: `${SVG_OPEN}<path d="M9,20 L9,10 C9,5 15,5 15,10 L15,15 M11,12 L15,18 L19,12" ${STROKE}/>${SVG_CLOSE}`,

  // 合流：脇道からの線がメインの上向き矢印に合流する。
  merge: `${SVG_OPEN}<path d="M6,20 L12,12 M12,20 L12,12 L12,6 M7,11 L12,6 L17,11" ${STROKE}/>${SVG_CLOSE}`,

  // 分岐：1本の道が2方向に分かれる（Y字）。
  fork: `${SVG_OPEN}<path d="M12,20 L12,12 M12,12 L6,5 M12,12 L18,5" ${STROKE}/>${SVG_CLOSE}`,

  roundabout: `${SVG_OPEN}<circle cx="12" cy="12" r="6" ${STROKE}/><path d="M12,20 L12,17 M13,2 L18,5 L14,8" ${STROKE}/>${SVG_CLOSE}`,

  // 目的地到着：シンプルな旗（自作。特定サービスの意匠は模倣しない）。
  arrive: `${SVG_OPEN}<path d="M7,21 L7,3 M7,4 L18,7.5 L7,11" ${STROKE}/>${SVG_CLOSE}`
};

// Mapbox maneuver.type / modifier の組み合わせから、上記アイコンキーへ対応させる。
// off ramp/on rampは、方向(modifier)を優先しつつ、無ければfork/mergeへフォールバックする。
function resolveIconKey(maneuver) {
  const type = maneuver?.type;
  const modifier = maneuver?.modifier;

  if (type === 'arrive') return 'arrive';
  if (type === 'roundabout' || type === 'rotary' || type === 'roundabout turn' || type === 'exit roundabout' || type === 'exit rotary') {
    return 'roundabout';
  }
  if (type === 'merge' || type === 'on ramp') {
    if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') return 'left';
    if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') return 'right';
    return 'merge';
  }
  if (type === 'off ramp' || type === 'fork') {
    if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') return 'left';
    if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') return 'right';
    return 'fork';
  }

  switch (modifier) {
    case 'left':
    case 'sharp left':
      return 'left';
    case 'right':
    case 'sharp right':
      return 'right';
    case 'slight left':
      return 'slightLeft';
    case 'slight right':
      return 'slightRight';
    case 'uturn':
      return 'uturn';
    case 'straight':
      return 'straight';
    default:
      // 未知の組み合わせ・modifier無し（depart等）は、誤った矢印を推測せず
      // 汎用的な直進矢印にフォールバックする。
      return 'straight';
  }
}

/**
 * @param {{type:string, modifier:string|null}|null} maneuver
 * @returns {string} インラインSVGのHTML文字列
 */
export function renderManeuverIcon(maneuver) {
  const key = maneuver ? resolveIconKey(maneuver) : 'straight';
  return ICONS[key] ?? ICONS.straight;
}
