/**
 * platform/geocoding.js — 目的地検索（Mapbox Search Box API, forward）
 * 検索ボタンを押した時だけ呼ぶこと（入力1文字ごとに呼ばない。課金事故防止）。
 *
 * Geocoding API v6ではなくSearch Box APIを使う。理由：
 * Geocoding v6はPOI（駅・コンビニ・施設名など）を返さず、住所・地名しか検索できない
 * （実際に「北上駅」で検索すると「北上市」しか返らなかった）。
 * 実機検証で確認済み：Search Box APIの/forwardエンドポイントならPOI名で正しく検索できる。
 */
import { fetchWithTimeout } from './fetchWithTimeout.js';

const SEARCH_BOX_BASE = 'https://api.mapbox.com/search/searchbox/v1/forward';

/**
 * @param {{query:string, token:string, proximity?:{lat:number,lon:number}, timeoutMs?:number}} args
 * @returns {Promise<Array<{name:string, address:string, lat:number, lon:number}>>}
 */
export async function searchDestination({ query, token, proximity = null, timeoutMs }) {
  const params = new URLSearchParams({
    q: query,
    language: 'ja',
    country: 'jp',
    limit: '5',
    access_token: token
  });
  if (proximity) params.set('proximity', `${proximity.lon},${proximity.lat}`);

  const res = await fetchWithTimeout(`${SEARCH_BOX_BASE}?${params.toString()}`, timeoutMs);
  if (!res.ok) {
    throw new Error(`目的地検索エラー: HTTP ${res.status}`);
  }
  const data = await res.json();

  return (data.features ?? []).map((f) => ({
    name: f.properties.name,
    address: f.properties.full_address ?? f.properties.place_formatted ?? '',
    lat: f.properties.coordinates.latitude,
    lon: f.properties.coordinates.longitude
  }));
}
