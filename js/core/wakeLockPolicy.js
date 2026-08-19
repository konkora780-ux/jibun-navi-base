/**
 * core/wakeLockPolicy.js — Wake Lockが解除されたときに利用者へ警告すべきかを判定する（純粋関数）。
 *
 * 手動でのナビ終了によるreleaseでは警告を出さない（想定どおりの動作のため）。
 * ナビ実行中にOS側の都合（画面ロック・省電力モード等）で予期せず解除された場合だけ警告する。
 */

/**
 * @param {{wasManual: boolean, navActive: boolean}} args
 * @returns {boolean} 警告バナーを出すべきならtrue
 */
export function shouldWarnOnWakeLockRelease({ wasManual, navActive }) {
  if (wasManual) return false;
  return navActive;
}
