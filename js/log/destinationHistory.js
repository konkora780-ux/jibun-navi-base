/**
 * log/destinationHistory.js — 目的地の検索履歴・お気に入りをlocalStorageに保存する。
 *
 * 目的地の履歴・お気に入りは個人の行動範囲が分かる情報のため、走行ログと同じ方針で
 * 端末内保存のみとし、外部へは一切送信しない。
 */

const HISTORY_STORAGE_KEY = 'jibunnavi_base_dest_history_v1';
const FAVORITES_STORAGE_KEY = 'jibunnavi_base_dest_favorites_v1';
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

/**
 * お気に入り一覧の追加/削除を切り替える（純粋関数）。
 * 既にあれば取り除き、無ければ先頭に追加する。
 * @param {Array<{name:string, address:string}>} existingFavorites
 * @param {{name:string, address:string, lat:number, lon:number}} item
 * @returns {{list: Array, isFavorite: boolean}}
 */
export function toggleInFavorites(existingFavorites, item) {
  const already = existingFavorites.some((d) => sameDestination(d, item));
  if (already) {
    return { list: existingFavorites.filter((d) => !sameDestination(d, item)), isFavorite: false };
  }
  return { list: [item, ...existingFavorites], isFavorite: true };
}

/**
 * お気に入りに無い履歴だけを残す（お気に入り欄と履歴欄で同じ項目が二重に
 * 表示されないようにするための純粋関数）。
 * @param {Array} favorites
 * @param {Array} history
 * @returns {Array}
 */
export function excludeFavorites(favorites, history) {
  return history.filter((h) => !favorites.some((f) => sameDestination(f, h)));
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

function normalizeDestination(destination) {
  const { name, address, lat, lon } = destination ?? {};
  if (!name || lat == null || lon == null) return null; // 不完全なデータは記録しない（安全原則1と同じ考え方）
  return { name, address: address ?? '', lat, lon };
}

/**
 * 目的地が選ばれた（ナビの目的地として設定された）ときに呼ぶ。
 * @param {{name:string, address:string, lat:number, lon:number}} destination
 */
export function recordDestinationUse(destination) {
  const item = normalizeDestination(destination);
  if (!item) return;
  writeList(HISTORY_STORAGE_KEY, mergeIntoHistory(readList(HISTORY_STORAGE_KEY), { ...item, lastUsedAt: new Date().toISOString() }));
}

/** @returns {Array<{name:string, address:string, lat:number, lon:number, lastUsedAt:string}>} */
export function getHistory() {
  return readList(HISTORY_STORAGE_KEY);
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}

/**
 * お気に入りへの追加/削除を切り替える。
 * @param {{name:string, address:string, lat:number, lon:number}} destination
 * @returns {boolean} 切り替え後にお気に入りに入っているか
 */
export function toggleFavorite(destination) {
  const item = normalizeDestination(destination);
  if (!item) return false;
  const { list, isFavorite } = toggleInFavorites(readList(FAVORITES_STORAGE_KEY), item);
  writeList(FAVORITES_STORAGE_KEY, list);
  return isFavorite;
}

/** @param {{name:string, address:string}} destination */
export function isFavorite(destination) {
  if (!destination?.name) return false;
  return readList(FAVORITES_STORAGE_KEY).some((d) => sameDestination(d, destination));
}

/** @returns {Array<{name:string, address:string, lat:number, lon:number}>} */
export function getFavorites() {
  return readList(FAVORITES_STORAGE_KEY);
}
