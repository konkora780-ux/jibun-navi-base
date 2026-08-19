/**
 * ui/debugPanel.js — DEBUGパネルの表示更新
 * DOM操作のみ。Mapbox・Turfには依存しない。
 */
import { renderLanes } from './laneView.js';

const MATCH_LABEL = {
  exact: '完全一致',
  partial: '一部一致',
  different: '不一致',
  unavailable: '比較不能'
};

const CONFIDENCE_LABEL = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', unknown: 'UNKNOWN' };

function el(id) {
  return document.getElementById(id);
}

/**
 * @param {object} snap main.jsが組み立てるNavSnapshot
 */
export function renderDebugPanel(snap) {
  el('dbgRoadClass').textContent = snap.roadClass ?? '取得不可';
  el('dbgRoadName').textContent = snap.roadName ?? '（無名道路）';

  const laneCountEl = el('dbgLaneCount');
  laneCountEl.textContent = snap.laneCount != null ? `${snap.laneCount}車線` : '取得不可';
  laneCountEl.classList.toggle('warn', snap.laneCount == null);

  el('dbgLanes').innerHTML = renderLanes(snap.lanesRaw, snap.smartLaneRecommendedLanes);

  el('dbgMapboxLanes').textContent = snap.mapboxRecommendedLanes.length
    ? snap.mapboxRecommendedLanes.join(',')
    : '—';
  el('dbgSmartLanes').textContent = snap.smartLaneRecommendedLanes.length
    ? snap.smartLaneRecommendedLanes.join(',')
    : '—';
  el('dbgMatched').textContent = MATCH_LABEL[snap.recommendationMatched] ?? '—';

  el('dbgNext').textContent = snap.nextManeuver
    ? `${snap.nextManeuver} ${Math.round(snap.distanceToNext)}m`
    : '—';
  el('dbgFollowing').textContent = snap.followingManeuver
    ? `${snap.followingManeuver}${snap.distanceToFollowing != null ? ' ' + Math.round(snap.distanceToFollowing) + 'm' : ''}`
    : '—';

  const nextLanesEl = el('dbgNextLanes');
  if (snap.nextRoadLaneCount != null) {
    nextLanesEl.textContent = `${snap.nextRoadName ?? '（無名道路）'} ${snap.nextRoadLaneCount}車線`;
    nextLanesEl.classList.remove('warn');
  } else {
    nextLanesEl.textContent = '取得不可';
    nextLanesEl.classList.add('warn');
  }

  el('dbgConfidence').textContent = CONFIDENCE_LABEL[snap.confidence] ?? '—';
  el('dbgMissing').textContent = snap.missingFields.length ? snap.missingFields.join('・') : 'なし';
}
