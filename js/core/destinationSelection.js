/**
 * core/destinationSelection.js — 目的地入力欄の表示文字列と、実際に選択されている
 * 目的地(selectedDestination)が食い違っていないかを判定する（純粋関数）。
 *
 * 検索候補・履歴・お気に入りのいずれを選んだ場合も、入力欄には
 * formatDestinationLabel()と同じ文字列が入る。この文字列と選択済み目的地が
 * 一致しない場合（利用者が手入力で書き換えた場合等）は選択を無効とみなし、
 * 画面表示と違う場所へナビが始まってしまう事故を防ぐ。
 */

/**
 * @param {{name:string, address:string}|null} destination
 * @returns {string} destinationが無ければ空文字
 */
export function formatDestinationLabel(destination) {
  if (!destination?.name) return '';
  return `${destination.name}（${destination.address ?? ''}）`;
}

/**
 * @param {string} inputValue 入力欄の現在の文字列
 * @param {{name:string, address:string}|null} selectedDestination
 * @returns {boolean} 選択済み目的地が無い場合や、文字列が食い違っている場合はfalse
 */
export function isDestinationSelectionValid(inputValue, selectedDestination) {
  if (!selectedDestination) return false;
  return inputValue === formatDestinationLabel(selectedDestination);
}
