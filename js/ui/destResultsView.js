/**
 * ui/destResultsView.js — 検索候補1件ぶんのDOM要素を組み立てる
 *
 * 施設名・住所はMapboxから返る外部データのため、innerHTMLへ直接埋め込まず
 * createElement + textContent で組み立てる（意図しないHTML/スクリプトの混入を防ぐ）。
 * キーボード操作（Tab移動＋Enter/Spaceで選択）にも対応する。
 */

/**
 * @param {{name:string, address:string}} result
 * @param {(result: object) => void} onSelect
 * @param {{isFavorite?: boolean, onToggleFavorite?: (result: object) => void, distanceLabel?: string|null}} [options]
 *   onToggleFavoriteを渡した場合のみお気に入り星ボタンを、distanceLabelを渡した場合のみ
 *   現在地からの距離表示を出す（同名候補の絞り込みに使う。距離の計算自体は呼び出し側の責任）。
 * @returns {HTMLLIElement}
 */
export function renderDestResultItem(result, onSelect, options = {}) {
  const { isFavorite = false, onToggleFavorite = null, distanceLabel = null } = options;

  const li = document.createElement('li');
  li.setAttribute('role', 'option');
  li.tabIndex = 0;

  const textWrap = document.createElement('div');
  textWrap.className = 'dr-text';

  const nameEl = document.createElement('div');
  nameEl.className = 'dr-name';
  nameEl.textContent = result.name;

  const addrEl = document.createElement('div');
  addrEl.className = 'dr-address';
  addrEl.textContent = result.address;

  textWrap.appendChild(nameEl);
  textWrap.appendChild(addrEl);

  if (distanceLabel) {
    const distEl = document.createElement('div');
    distEl.className = 'dr-distance';
    distEl.textContent = `現在地から ${distanceLabel}`;
    textWrap.appendChild(distEl);
  }

  li.appendChild(textWrap);

  if (onToggleFavorite) {
    const starBtn = document.createElement('button');
    starBtn.type = 'button';
    starBtn.className = 'dr-favorite' + (isFavorite ? ' active' : '');
    starBtn.setAttribute('aria-label', isFavorite ? 'お気に入りから外す' : 'お気に入りに追加');
    starBtn.setAttribute('aria-pressed', String(isFavorite));
    starBtn.textContent = isFavorite ? '★' : '☆';
    // liのクリック/Enter/Space（onSelect）と衝突しないよう、click・keydownの両方で止める。
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggleFavorite(result);
    });
    starBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
    });
    li.appendChild(starBtn);
  }

  li.addEventListener('click', () => onSelect(result));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(result);
    }
  });

  return li;
}
