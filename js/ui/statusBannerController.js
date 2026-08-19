/**
 * ui/statusBannerController.js — 案内バナーの状態を一元管理する。
 *
 * これまでGPS更新・通信状態・地図エラー・ルート取得・再ルートなどが、それぞれ
 * 直接showStatusBanner/hideStatusBannerを呼んでいたため、正常なGPS更新のような
 * 低い優先度の出来事が、ルート取得中・地図エラーなどの重要な表示を消してしまう
 * ことがあった。ここでは状態をreasonごとに保持し、常に最も優先度の高い
 * メッセージだけを表示する（優先順位はcore/bannerPriority.jsを参照）。
 */
import { showStatusBanner, hideStatusBanner } from './navigationPanel.js';
import { pickHighestPriorityMessage } from '../core/bannerPriority.js';

const activeStates = new Map();

function render() {
  const message = pickHighestPriorityMessage(activeStates);
  if (message != null) {
    showStatusBanner(message);
  } else {
    hideStatusBanner();
  }
}

/**
 * @param {string} reason core/bannerPriority.js の BANNER_PRIORITY_ORDER に含まれるキー
 * @param {string} message
 */
export function setBannerState(reason, message) {
  activeStates.set(reason, message);
  render();
}

/** @param {string} reason */
export function clearBannerState(reason) {
  activeStates.delete(reason);
  render();
}

/** 現在アクティブな状態一覧（reason→メッセージ）。テスト・デバッグ用。 */
export function getActiveBannerStates() {
  return new Map(activeStates);
}

/** すべての状態を消す。テストでの初期化専用（アプリ本体からは呼ばない）。 */
export function resetBannerStates() {
  activeStates.clear();
  render();
}
