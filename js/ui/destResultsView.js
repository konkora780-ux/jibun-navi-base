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
 * @returns {HTMLLIElement}
 */
export function renderDestResultItem(result, onSelect) {
  const li = document.createElement('li');
  li.setAttribute('role', 'option');
  li.tabIndex = 0;

  const nameEl = document.createElement('div');
  nameEl.className = 'dr-name';
  nameEl.textContent = result.name;

  const addrEl = document.createElement('div');
  addrEl.className = 'dr-address';
  addrEl.textContent = result.address;

  li.appendChild(nameEl);
  li.appendChild(addrEl);

  li.addEventListener('click', () => onSelect(result));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(result);
    }
  });

  return li;
}
