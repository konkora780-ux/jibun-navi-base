/**
 * ui/navigationPanel.js — 実走用ナビ案内パネルの描画（下部guidebar）
 *
 * DOM操作のみ。road名など外部データ（Mapbox由来）はtextContentで設定し、
 * innerHTMLへ直接埋め込まない。自作アイコン(maneuverIcon.js)・車線表示
 * (smartLaneGuide.js)のような内部生成HTMLはinnerHTMLで反映する。
 * DEBUGパネルとは完全に別の要素・別のIDを使う（実走用とDEBUGを混ぜない）。
 */
import { renderManeuverIcon } from './maneuverIcon.js';

function el(id) {
  return document.getElementById(id);
}

/**
 * @param {{
 *   phase: 'idle'|'guiding'|'arrived',
 *   maneuver: {type:string, modifier:string|null}|null,
 *   distanceToManeuverText: string,
 *   roadName: string|null,
 *   smartLane: {text:string, lanesHtml:string, confidence:string}|null,
 *   eta: string, remainingTime: string, remainingDistance: string
 * }} state
 */
export function renderNavigationPanel(state) {
  const {
    phase, maneuver, distanceToManeuverText, roadName,
    smartLane, eta, remainingTime, remainingDistance
  } = state;

  el('navIcon').innerHTML = renderManeuverIcon(phase === 'arrived' ? { type: 'arrive' } : maneuver);
  el('navDistance').textContent = phase === 'guiding' ? distanceToManeuverText : '';

  const roadNameEl = el('navRoadName');
  if (phase === 'idle') {
    roadNameEl.textContent = 'ナビ未開始';
  } else if (phase === 'arrived') {
    roadNameEl.textContent = '目的地周辺です';
  } else {
    roadNameEl.textContent = roadName || '（道路名不明）';
  }

  const smartLaneTextEl = el('navSmartLaneText');
  const lanesEl = el('navLanes');
  if (phase === 'guiding' && smartLane) {
    smartLaneTextEl.textContent = smartLane.text;
    smartLaneTextEl.className = `nav-smartlane-text conf-${smartLane.confidence}`;
    lanesEl.innerHTML = smartLane.lanesHtml;
  } else {
    smartLaneTextEl.textContent = '';
    smartLaneTextEl.className = 'nav-smartlane-text';
    lanesEl.innerHTML = '';
  }

  el('navEta').textContent = phase === 'guiding' ? `到着 ${eta}` : '—';
  el('navRemainingTime').textContent = phase === 'guiding' ? `残り ${remainingTime}` : '';
  el('navRemainingDistance').textContent = phase === 'guiding' ? remainingDistance : '';
}

// 通信・GPS状態などの案内バナー（実走用パネルの一部。技術的なエラー文をそのまま
// 出さず、利用者が次に何をすればよいかを日本語で示すために使う）。
export function showStatusBanner(message) {
  const banner = el('navStatusBanner');
  banner.textContent = message;
  banner.classList.remove('hidden');
}

export function hideStatusBanner() {
  const banner = el('navStatusBanner');
  banner.classList.add('hidden');
  banner.textContent = '';
}
