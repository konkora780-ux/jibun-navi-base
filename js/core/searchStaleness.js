/**
 * core/searchStaleness.js — 目的地検索の結果が「もう古い」かどうかを判定する（純粋関数）。
 *
 * 通信中に入力欄が書き換えられた場合、後から返ってきた検索結果を画面に反映すると、
 * 入力欄の文字列と食い違う目的地候補が表示されてしまう（誤った目的地選択につながる）。
 * この判定を検索の成功・0件・失敗・タイムアウトのすべてで使うことで、
 * 「今の入力欄と対応しない結果」を一律に無視できるようにする。
 */

/**
 * @param {{
 *   searchId: number,           検索開始時に発行した通し番号
 *   latestSearchId: number,     現在の最新の通し番号（新しい検索や入力変更で進む）
 *   queryAtStart: string,       検索開始時の入力値（trim済み）
 *   currentInputValue: string   結果を反映しようとしている時点の入力値（未trim可）
 * }} args
 * @returns {boolean} 古い（無視すべき）結果ならtrue
 */
export function isSearchResultStale({ searchId, latestSearchId, queryAtStart, currentInputValue }) {
  if (searchId !== latestSearchId) return true;
  return currentInputValue.trim() !== queryAtStart;
}
