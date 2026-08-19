/**
 * log/destinationHistory.js — 目的地の検索履歴をlocalStorageに保存する。
 *
 * 目的地の履歴は個人の行動範囲が分かる情報のため、走行ログと同じ方針で
 * 端末内保存のみとし、外部へは一切送信しない。
 */

const HISTORY_STORAGE_KEY = 'jibunnavi_base_dest_history_v1';
const MAX_HISTORY = 20;

function sameDestination(a, b) {
  return a.name === b.name && a.address === b.address;
}

/**
 * 既存の履歴配列の先頭に新しい目的地を追加する（純粋関数・DOM/localStorage非依存）。
 * 同じ目的地(name+address が一致)が既にあれば、それを取り除いてから先頭に入れ直す
 * （＝最近使った順に並べ替える。重複を残さない）。上限を超えたら古いものを切り捨てる。
 *
 * @param {Array<{name:string, address:string}>} existingList
 * @param {{name:string, address:string, lat:number, lon:number}} item
 * @param {number} [maxLength]
 * @returns {Array}
 */
export function mergeIntoHistory(existingList, item, maxLength = MAX_HISTORY) {
  const withoutDuplicate = existingList.filter((d) => !sameDestination(d, item));
  return [item, ...withoutDuplicate].slice(0, maxLength);
}

function readList() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(list) {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
}

/**
 * 目的地が選ばれた（ナビの目的地として設定された）ときに呼ぶ。
 * @param {{name:string, address:string, lat:number, lon:number}} destination
 */
export function recordDestinationUse(destination) {
  const { name, address, lat, lon } = destination ?? {};
  if (!name || lat == null || lon == null) return; // 不完全なデータは記録しない（安全原則1と同じ考え方）
  const item = { name, address: address ?? '', lat, lon, lastUsedAt: new Date().toISOString() };
  writeList(mergeIntoHistory(readList(), item));
}

/** @returns {Array<{name:string, address:string, lat:number, lon:number, lastUsedAt:string}>} */
export function getHistory() {
  return readList();
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}
