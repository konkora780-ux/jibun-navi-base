/**
 * platform/directions.js — Directions API 呼び出し + Coreデータ型への正規化
 *
 * 【車線データの対応関係について（実データで検証済み）】
 * Mapbox公式ドキュメントには「lanesは次のターンを実行する交差点に付与される」とあり、
 * 実際のレスポンスで `maneuver.location === intersections[0].location` が常に成立することを確認した。
 * つまり、あるstep[i]の道路を走り終える曲がり角（=次のstep[i+1]のmaneuver）の車線情報は、
 * step[i]自身の中にはなく、**step[i+1].intersections[0].lanes に現れる**。
 * （docs/00_調査報告.md 6節の簡略図はこの対応が逆に書かれているため注意。ここでの実装が正）
 *
 * 【roadClassについて】
 * intersections[].classes は toll/ferry/restricted/motorway/tunnel の限定フラグしか持たず、
 * primary/secondary等の一般的な道路分類は intersections[].mapbox_streets_v8.class から取る
 * （driving profileでは steps=true だけで自動的に付与される。追加パラメータは不要）。
 * このフィールドの値は Mapbox Streets v8 の詳細分類（tertiary等を含む）なので、
 * アプリの6分類（motorway/trunk/primary/secondary/street/unknown）に丸め込む。
 */
import { createRoadSnapshot, createManeuverInfo } from '../core/models.js';

const DIRECTIONS_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

function toRoadClass(streetsV8Class) {
  switch (streetsV8Class) {
    case 'motorway':
    case 'motorway_link':
      return 'motorway';
    case 'trunk':
    case 'trunk_link':
      return 'trunk';
    case 'primary':
    case 'primary_link':
      return 'primary';
    case 'secondary':
    case 'secondary_link':
      return 'secondary';
    case undefined:
    case null:
      return 'unknown';
    default:
      // tertiary・street・service・track・pedestrian等はすべて「street」にまとめる。
      // アプリのroadClassは6分類のみで、Streets v8の詳細分類とは1対1に対応しないため。
      return 'street';
  }
}

function extractLanes(intersection) {
  if (!intersection?.lanes) return null;
  return intersection.lanes.map((lane) => ({
    indications: lane.indications,
    isValid: lane.valid,
    isActive: lane.active
  }));
}

function buildRoadSnapshot(step, lanesIntersection) {
  const entry = step.intersections?.[0];
  try {
    return createRoadSnapshot({
      name: step.name || null,
      lanes: extractLanes(lanesIntersection),
      roadClass: toRoadClass(entry?.mapbox_streets_v8?.class)
    });
  } catch (err) {
    // 想定外の値が来た場合は「取得不可」に倒す（安全原則8：データ不足時は案内しないことが正解）。
    console.warn('RoadSnapshot正規化に失敗、unknown扱いにします:', err.message);
    return createRoadSnapshot({ name: step.name || null, lanes: null, roadClass: 'unknown' });
  }
}

function buildEndManeuver(nextStep) {
  if (!nextStep) return null;
  const m = nextStep.maneuver;
  const bearingsCount = (nextStep.intersections?.[0]?.bearings ?? []).length;
  try {
    return createManeuverInfo({
      type: m.type,
      modifier: m.modifier ?? null,
      // Mapboxのレスポンスに isJunction 相当のフィールドは無いため、
      // 交差点にある道の本数（bearings）が2本（単純な通過点）を超える場合を簡易的にjunction扱いする。
      isJunction: bearingsCount > 2
    });
  } catch (err) {
    console.warn('ManeuverInfo正規化に失敗:', err.message);
    return null;
  }
}

/**
 * Directions APIを呼び出し、Coreのデータ型に正規化したstep配列を返す。
 *
 * 戻り値のsteps[i]は「Mapboxのstep[i]（=1本の道路区間）」に対応し、次を持つ：
 *   - road          : RoadSnapshot（この区間を走る道路）
 *   - endManeuver   : ManeuverInfo | null（この区間を終える曲がり角＝次の区間へのmaneuver）
 *   - distance      : この区間の長さ(m)
 *   - duration      : この区間の所要時間(s)
 *   - geometry      : GeoJSON LineString（Step6のTurf処理用）
 *   - voiceInstructions / bannerInstructions : Step9で使う元データ
 *
 * SmartLaneInputへの組み立て（Step6以降）は、隣接するsteps[i]とsteps[i+1]を使う：
 *   currentRoad = steps[i].road,       currentManeuver = steps[i].endManeuver
 *   nextRoad    = steps[i+1].road,     followingManeuver = steps[i+1].endManeuver
 *   distanceToFollowing = steps[i+1].distance
 */
export async function fetchRoute({ origin, destination, token }) {
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const params = new URLSearchParams({
    steps: 'true',
    overview: 'full',
    geometries: 'geojson',
    language: 'ja',
    voice_instructions: 'true',
    banner_instructions: 'true',
    access_token: token
  });

  const res = await fetch(`${DIRECTIONS_BASE}/${coords}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Directions APIエラー: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.code !== 'Ok') {
    throw new Error(`Directions APIエラー: ${data.code} ${data.message ?? ''}`);
  }

  const rawSteps = data.routes[0].legs[0].steps;

  const steps = rawSteps.map((step, i) => {
    const nextStep = rawSteps[i + 1] ?? null;
    const lanesIntersection = nextStep?.intersections?.[0] ?? null;

    return {
      distance: step.distance,
      duration: step.duration,
      geometry: step.geometry,
      road: buildRoadSnapshot(step, lanesIntersection),
      endManeuver: buildEndManeuver(nextStep),
      voiceInstructions: step.voiceInstructions ?? [],
      bannerInstructions: step.bannerInstructions ?? []
    };
  });

  return {
    distance: data.routes[0].distance,
    duration: data.routes[0].duration,
    geometry: data.routes[0].geometry,
    steps
  };
}
