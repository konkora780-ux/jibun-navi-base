/**
 * core/connectivityMessages.js — 通信・GPSの状態を、利用者が次に何をすればよいか
 * 分かる日本語メッセージへ変換する（純粋関数）。技術的なエラー文をそのまま出さない。
 */

/**
 * @param {{code:number}|null} err GeolocationPositionError相当
 * @returns {string}
 */
export function describeGeolocationError(err) {
  // GeolocationPositionError.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
  switch (err?.code) {
    case 1:
      return '位置情報の利用が許可されていません。端末の設定でこのサイトの位置情報を許可してください';
    case 2:
      return '現在地を取得できません。屋外の見晴らしの良い場所へ移動してください';
    case 3:
      return '現在地の取得に時間がかかっています。しばらくお待ちください';
    default:
      return '現在地を取得できません';
  }
}

/**
 * @param {boolean} isOnline navigator.onLine相当
 * @returns {string|null} オンラインならnull
 */
export function describeNetworkStatus(isOnline) {
  return isOnline ? null : 'オフラインです。通信状態の良い場所に移動してから操作してください';
}

/**
 * @param {{ok:boolean, reason:('max-attempts'|'too-soon'|undefined)}} retryStatus
 * @returns {string}
 */
export function describeRouteFetchFailure(retryStatus) {
  if (retryStatus?.reason === 'max-attempts') {
    return 'ルートを取得できません。電波の良い場所で「ナビ開始」を押し直してください';
  }
  return '通信エラーが発生しました。しばらくしてから再度お試しください';
}
