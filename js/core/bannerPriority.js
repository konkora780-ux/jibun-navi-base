/**
 * core/bannerPriority.js — 案内バナーの優先順位付け（純粋関数）。
 *
 * 地図の致命的エラー・一時的エラー・GPS取得エラー・オフライン・ルート取得失敗・
 * 検索失敗・音声検索失敗・ナビ開始不可・GPS精度低下・画面消灯防止の警告・
 * ルート取得中/検索中は、同時に複数発生しうる。正常なGPS更新のような
 * 「低い優先度の状態」が「高い優先度の警告」を誤って消してしまわないよう、
 * 常に最も優先度の高いものだけを選ぶ。数字が小さい（配列の先頭に近い）ほど優先度が高い。
 *
 * map-fatal：初期の地図読み込み自体が失敗（トークン未設定・秘密トークン使用・
 *   最初のstyle読み込み失敗など、map.on('load')が一度も発火する前のerror）。
 * map-temporary：初期読み込み完了後に起きた一時的な地図通信エラー（タイル取得失敗等）。
 *   地図自体は動作を続けている可能性が高いため、致命的エラーより優先度を下げる。
 */
export const BANNER_PRIORITY_ORDER = [
  'map-fatal',
  'gps-error',
  'offline',
  'map-temporary',
  'route-fetch-failure',
  'search-failure',
  'voice-search-failure',
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

/**
 * setBannerStateへ渡されたreasonがBANNER_PRIORITY_ORDERに存在するか判定する（優先度C対応）。
 * 未知のreasonはMapには記録されるが優先順位表に無いため、表示されず静かに埋もれてしまう。
 * 開発中にタイプミス等を発見できるよう、呼び出し側（statusBannerController.js）で使う。
 * @param {string} reason
 * @returns {boolean}
 */
export function isKnownBannerReason(reason) {
  return BANNER_PRIORITY_ORDER.includes(reason);
}

/**
 * 一時的な地図エラーからの回復（'idle'イベント等）を検知しても、表示直後すぐに
 * 消さないようにするための最低表示時間の判定（純粋関数）。エラーが短時間に連発しても
 * バナーが激しく点滅しないようにするために使う（優先度A対応）。
 * @param {number|null} setAt バナーを表示した時刻(ms)。表示していなければnull
 * @param {number} now 現在時刻(ms)
 * @param {number} minDisplayMs 最低表示時間(ms)
 * @returns {boolean} 消してよければtrue
 */
export function canClearAfterMinDisplay(setAt, now, minDisplayMs) {
  if (setAt == null) return false;
  return now - setAt >= minDisplayMs;
}
