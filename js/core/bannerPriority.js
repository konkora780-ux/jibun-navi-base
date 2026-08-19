/**
 * core/bannerPriority.js — 案内バナーの優先順位付け（純粋関数）。
 *
 * 地図エラー・GPS取得エラー・オフライン・ルート取得失敗・ナビ開始不可・
 * GPS精度低下・画面消灯防止失敗・ルート取得中は、同時に複数発生しうる。
 * 正常なGPS更新のような「低い優先度の状態」が「高い優先度の警告」を
 * 誤って消してしまわないよう、常に最も優先度の高いものだけを選ぶ。
 * 数字が小さい（配列の先頭に近い）ほど優先度が高い。
 */
export const BANNER_PRIORITY_ORDER = [
  'map-error',
  'gps-error',
  'offline',
  'route-fetch-failure',
  'search-failure',
  'nav-guard',
  'gps-accuracy',
  'wake-lock',
  'route-loading',
  'search-loading'
];

/**
 * @param {Map<string,string>} activeStates reason→メッセージ
 * @param {string[]} [priorityOrder]
 * @returns {string|null} 表示すべきメッセージ。アクティブな状態が無ければnull
 */
export function pickHighestPriorityMessage(activeStates, priorityOrder = BANNER_PRIORITY_ORDER) {
  for (const reason of priorityOrder) {
    if (activeStates.has(reason)) return activeStates.get(reason);
  }
  return null;
}
