/**
 * core/compare.js — SmartLane推奨とMapbox標準(isActive)推奨の比較
 * Mapbox・Turf・DOMに一切依存しない。docs/01_SmartLane仕様.md 6節に準拠。
 */

/**
 * @param {number[]} mapboxActiveIndices  isActive===trueの車線indexの配列
 * @param {number[]} smartLaneIndices     SmartLaneの推奨index配列
 * @returns {'exact'|'partial'|'different'|'unavailable'}
 */
export function compareRecommendation(mapboxActiveIndices, smartLaneIndices) {
  if (!mapboxActiveIndices?.length || !smartLaneIndices?.length) return 'unavailable';

  const mb = new Set(mapboxActiveIndices);
  const sl = new Set(smartLaneIndices);
  const intersection = [...sl].filter((i) => mb.has(i));

  if (intersection.length === mb.size && intersection.length === sl.size) return 'exact';
  if (intersection.length > 0) return 'partial';
  return 'different';
}
