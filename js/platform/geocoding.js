/**
 * platform/geocoding.js — 目的地検索（Mapbox Geocoding API v6, forward）
 * 検索ボタンを押した時だけ呼ぶこと（入力1文字ごとに呼ばない。課金事故防止）。
 */

const GEOCODING_BASE = 'https://api.mapbox.com/search/geocode/v6/forward';

/**
 * @param {{query:string, token:string, proximity?:{lat:number,lon:number}}} args
 * @returns {Promise<Array<{name:string, address:string, lat:number, lon:number}>>}
 */
export async function searchDestination({ query, token, proximity = null }) {
  const params = new URLSearchParams({
    q: query,
    language: 'ja',
    country: 'jp',
    limit: '5',
    access_token: token
  });
  if (proximity) params.set('proximity', `${proximity.lon},${proximity.lat}`);

  const res = await fetch(`${GEOCODING_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Geocoding APIエラー: HTTP ${res.status}`);
  }
  const data = await res.json();

  return (data.features ?? []).map((f) => ({
    name: f.properties.name,
    address: f.properties.full_address ?? f.properties.place_formatted ?? '',
    lat: f.properties.coordinates.latitude,
    lon: f.properties.coordinates.longitude
  }));
}
