/**
 * ui/laneView.js — 車線を矢印で描画する
 * 推奨車線には★を付け、isValid:falseの車線はグレーアウトする（style.cssの.lane-invalidで表現）。
 * DOM文字列を組み立てるだけで、Mapbox・Turfには依存しない。
 */

// sharp left/rightは通常のleft/rightと同じ矢印で表現する（測定用UIとしては方向の大分類が分かれば十分なため）。
const ARROWS = {
  left: '←',
  'slight left': '↖',
  'sharp left': '←',
  straight: '↑',
  'slight right': '↗',
  'sharp right': '→',
  right: '→',
  uturn: '↩',
  none: '–'
};

function arrowsFor(indications) {
  return (indications ?? []).map((d) => ARROWS[d] ?? '?').join('');
}

/**
 * @param {import('../core/models.js').LaneInfo[] | null} lanes
 * @param {number[]} recommendedIndices
 * @returns {string} HTML文字列（innerHTMLへ代入して使う）
 */
export function renderLanes(lanes, recommendedIndices = []) {
  if (!lanes || lanes.length === 0) {
    return '<span class="lane-missing">取得不可</span>';
  }

  return lanes
    .map((lane, i) => {
      const classes = ['lane'];
      if (!lane.isValid) classes.push('lane-invalid');
      if (lane.isActive) classes.push('lane-active');
      const isRecommended = recommendedIndices.includes(i);
      if (isRecommended) classes.push('lane-recommended');
      const star = isRecommended ? '★' : '';
      return `<span class="${classes.join(' ')}">${star}${arrowsFor(lane.indications)}</span>`;
    })
    .join(' ');
}
