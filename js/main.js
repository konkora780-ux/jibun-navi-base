/**
 * main.js — 起動・全体の配線
 * Step 1：地図の表示
 * Step 2：現在地追従・GPS精度表示・3D地形・昼夜ライティング
 * Step 3：画面消灯防止と音声解禁
 * Step 4〜7：Core層のデータ型・Directions API正規化・routeTracker・SmartLane
 * Step 8：デバッグ表示・車線矢印描画
 * Step 9：目的地検索・自動再ルート
 * Step 10：走行ログ
 */
import {
  MAPBOX_TOKEN, MAP_STYLE, MAP_DEFAULT, MAP_FOLLOW, GPS_ACCURACY, LOG
} from './config.js';
import {
  createMap, enableTerrain, pickLightPreset, applyLightPreset,
  createUserMarker, followCamera, drawRoute, clearRoute
} from './platform/mapView.js';
import { watchPosition, clearWatch, requestWakeLock } from './platform/location.js';
import { unlockSpeech, speak } from './platform/voice.js';
import { fetchRoute } from './platform/directions.js';
import { searchDestination } from './platform/geocoding.js';
import { isSpeechInputSupported, startVoiceSearch } from './platform/speechInput.js';
import { createRouteTracker } from './nav/routeTracker.js';
import { createRerouter } from './nav/rerouter.js';
import { canStartNav } from './nav/navGuard.js';
import { renderDestResultItem } from './ui/destResultsView.js';
import { createSmartLaneInput } from './core/models.js';
import { evaluateSmartLane } from './core/smartLane.js';
import { compareRecommendation } from './core/compare.js';
import { describeManeuver } from './core/phrase.js';
import { renderDebugPanel } from './ui/debugPanel.js';
import { appendLogEntry, exportLogAsFile, clearLog } from './log/driveLog.js';

const dbg = {
  status: document.getElementById('dbgStatus'),
  gps: document.getElementById('dbgGps'),
  accuracy: document.getElementById('dbgAccuracy'),
  speed: document.getElementById('dbgSpeed')
};

function setStatus(text, isError = false) {
  dbg.status.textContent = text;
  dbg.status.className = isError ? 'warn' : '';
}

// トークン未設定を早期に検知する。理由：地図が真っ白になる原因の大半がこれで、
// 原因が分からないまま時間を溶かしやすいためです。
if (!MAPBOX_TOKEN || MAPBOX_TOKEN.startsWith('pk.ここに')) {
  setStatus('トークン未設定：js/config.js を編集してください', true);
  throw new Error('MAPBOX_TOKEN is not set');
}
if (MAPBOX_TOKEN.startsWith('sk.')) {
  setStatus('危険：sk.トークンは使用禁止です', true);
  throw new Error('secret token must not be used in a web app');
}

const map = createMap({
  container: 'map',
  style: MAP_STYLE,
  token: MAPBOX_TOKEN,
  center: MAP_DEFAULT.center,
  zoom: MAP_DEFAULT.zoom,
  pitch: MAP_DEFAULT.pitch,
  bearing: MAP_DEFAULT.bearing
});

// ---------- 3D ON/OFF トグル ----------
const btn3d = document.getElementById('btn3d');
let is3d = true;
btn3d.classList.add('active');
btn3d.addEventListener('click', () => {
  is3d = !is3d;
  map.easeTo({ pitch: is3d ? MAP_DEFAULT.pitch : 0, duration: 400 });
  btn3d.classList.toggle('active', is3d);
  btn3d.setAttribute('aria-pressed', String(is3d));
});

// ---------- DEBUGパネルの表示切替 ----------
const btnDebug = document.getElementById('btnDebug');
btnDebug.addEventListener('click', () => {
  const app = document.getElementById('app');
  app.classList.toggle('hide-debug');
  const visible = !app.classList.contains('hide-debug');
  btnDebug.classList.toggle('active', visible);
  btnDebug.setAttribute('aria-pressed', String(visible));
});

// ---------- 現在地追従 ----------
const btnRecenter = document.getElementById('btnRecenter');
let isFollowing = true;
let resumeTimer = null;
let lastPosition = null;
let userMarker = null;
let watchId = null;

function pauseFollow() {
  isFollowing = false;
  btnRecenter.classList.add('active');
  btnRecenter.setAttribute('aria-pressed', 'true');
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(resumeFollow, MAP_FOLLOW.RESUME_AFTER_SECONDS * 1000);
}

function resumeFollow() {
  isFollowing = true;
  btnRecenter.classList.remove('active');
  btnRecenter.setAttribute('aria-pressed', 'false');
  if (resumeTimer) clearTimeout(resumeTimer);
  if (lastPosition) {
    followCamera(map, [lastPosition.lon, lastPosition.lat], lastPosition.heading, { is3d });
  }
}

btnRecenter.addEventListener('click', resumeFollow);

// dragstart/zoomstart/rotatestart/pitchstart は、originalEvent があるときだけ
// ユーザー操作起点（プログラムによる easeTo/jumpTo では originalEvent が付かない）。
['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach((evt) => {
  map.on(evt, (e) => {
    if (e.originalEvent) pauseFollow();
  });
});

// ---------- GPS精度の色分け ----------
function accuracyClass(accuracy) {
  if (accuracy == null) return 'acc-unknown';
  if (accuracy <= GPS_ACCURACY.GOOD) return 'acc-good';
  if (accuracy <= GPS_ACCURACY.DEGRADED) return 'acc-degrade';
  return 'acc-bad';
}

function updateGpsDebug(pos) {
  dbg.gps.textContent = `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`;
  dbg.accuracy.textContent = pos.accuracy != null ? `${pos.accuracy.toFixed(1)} m` : '取得不可';
  dbg.accuracy.className = accuracyClass(pos.accuracy);
  dbg.speed.textContent = pos.speed != null ? `${Math.round(pos.speed * 3.6)} km/h` : '—';
}

// ---------- 目的地検索（Step9） ----------
const destInput = document.getElementById('destInput');
const btnSearch = document.getElementById('btnSearch');
const testRouteSelect = document.getElementById('testRouteId');
let selectedDestination = null;

const destResults = document.getElementById('destResults');

function hideDestResults() {
  destResults.classList.add('hidden');
  destResults.innerHTML = '';
}

function selectDestination(r) {
  selectedDestination = r;
  destInput.value = `${r.name}（${r.address}）`;
  setStatus(`目的地を設定: ${r.name}`);
  hideDestResults();
}

function showDestResults(results) {
  destResults.innerHTML = '';
  results.forEach((r) => {
    destResults.appendChild(renderDestResultItem(r, selectDestination));
  });
  destResults.classList.remove('hidden');
}

btnSearch.addEventListener('click', async () => {
  const query = destInput.value.trim();
  if (!query) return;

  btnSearch.disabled = true;
  try {
    const results = await searchDestination({
      query,
      token: MAPBOX_TOKEN,
      proximity: lastPosition ? { lat: lastPosition.lat, lon: lastPosition.lon } : null
    });
    if (results.length === 0) {
      setStatus('検索結果が見つかりません', true);
      hideDestResults();
      return;
    }
    showDestResults(results);
    setStatus(`候補${results.length}件から目的地を選んでください`);
  } catch (err) {
    setStatus(`検索エラー: ${err.message}`, true);
  } finally {
    btnSearch.disabled = false;
  }
});

// ---------- 音声検索 ----------
// 既知の制約：iOS Safariはホーム画面追加後（PWA状態）だとこのAPIが動かないことがある。
// 動かない場合もテキスト検索は独立して使えるようにしてあるので、ナビ自体は止まらない。
const btnVoiceSearch = document.getElementById('btnVoiceSearch');
if (!isSpeechInputSupported()) {
  btnVoiceSearch.disabled = true;
  btnVoiceSearch.title = 'この端末では音声検索が使えません（テキスト検索をお使いください）';
}

btnVoiceSearch.addEventListener('click', () => {
  startVoiceSearch({
    onStart: () => {
      btnVoiceSearch.classList.add('active');
      btnVoiceSearch.setAttribute('aria-pressed', 'true');
      setStatus('音声を聞いています…');
    },
    onResult: (text) => {
      destInput.value = text;
      setStatus(`音声認識: ${text}`);
      btnSearch.click();
    },
    onError: (message) => setStatus(message, true),
    onEnd: () => {
      btnVoiceSearch.classList.remove('active');
      btnVoiceSearch.setAttribute('aria-pressed', 'false');
    }
  });
});

// 入力し直したら古い候補一覧は消す
destInput.addEventListener('input', hideDestResults);
// 候補以外をタップ/クリックしたら閉じる
document.addEventListener('click', (e) => {
  if (!destResults.classList.contains('hidden') && !e.target.closest('#destWrap')) {
    hideDestResults();
  }
});

// ---------- ナビ本体（Step6〜10：ルート取得・追跡・SmartLane評価・ログ） ----------
let currentRoute = null;
let tracker = null;
const rerouter = createRerouter();
let lastLogAt = 0;
let lastLoggedStepIndex = -1;
let rerouting = false;

function buildStepInputs(route, stepIndex, pos) {
  const step = route.steps[stepIndex];
  const nextStep = route.steps[stepIndex + 1] ?? null;
  return createSmartLaneInput({
    currentRoad: step.road,
    currentManeuver: step.endManeuver,
    distanceToCurrent: 0, // 下でtrackResultの値に差し替える
    nextRoad: nextStep?.road ?? null,
    followingManeuver: nextStep?.endManeuver ?? null,
    distanceToFollowing: nextStep?.distance ?? null,
    currentSpeed: pos.speed ?? 0,
    gpsAccuracy: pos.accuracy
  });
}

function activeIndicesOf(road) {
  if (!road?.lanes) return [];
  return road.lanes.map((lane, i) => (lane.isActive ? i : null)).filter((i) => i !== null);
}

function collectMissingFields({ currentRoad, nextRoad, followingManeuver, gpsAccuracy }) {
  const missing = [];
  if (!currentRoad.lanes) missing.push('現在車線');
  if (currentRoad.roadClass === 'unknown') missing.push('道路種別');
  if (!nextRoad || !nextRoad.lanes) missing.push('次道路車線');
  if (!followingManeuver) missing.push('次々の曲がり方');
  if (gpsAccuracy == null) missing.push('GPS精度');
  return missing;
}

function processNavUpdate(pos) {
  if (!tracker || !currentRoute) return;

  const trackResult = tracker.update(pos);
  const stepIndex = trackResult.stepIndex;
  const step = currentRoute.steps[stepIndex];
  const nextStep = currentRoute.steps[stepIndex + 1] ?? null;

  const input = buildStepInputs(currentRoute, stepIndex, pos);
  input.distanceToCurrent = trackResult.distanceToCurrentManeuver;

  const advice = evaluateSmartLane(input);
  const targetRoadSnapshot = advice.targetRoad === 'next' ? input.nextRoad : input.currentRoad;
  const mapboxRecommendedLanes = activeIndicesOf(targetRoadSnapshot);
  const recommendationMatched = compareRecommendation(mapboxRecommendedLanes, advice.recommendedLanes);
  const missingFields = collectMissingFields(input);

  const snap = {
    roadClass: input.currentRoad.roadClass,
    roadName: input.currentRoad.name,
    laneCount: input.currentRoad.laneCount,
    lanesRaw: input.currentRoad.lanes,
    mapboxRecommendedLanes,
    smartLaneRecommendedLanes: advice.recommendedLanes,
    recommendationMatched,
    nextManeuver: describeManeuver(input.currentManeuver),
    distanceToNext: trackResult.distanceToCurrentManeuver,
    followingManeuver: describeManeuver(input.followingManeuver),
    distanceToFollowing: input.distanceToFollowing,
    nextRoadName: input.nextRoad?.name ?? null,
    nextRoadLaneCount: input.nextRoad?.laneCount ?? null,
    nextRoadLanesRaw: input.nextRoad?.lanes ?? null,
    confidence: advice.confidence,
    reason: advice.reason,
    gpsDowngraded: advice.gpsDowngraded,
    missingFields
  };
  renderDebugPanel(snap);

  // ---------- 走行ログ（交差点通過時 ＋ LOG.INTERVAL_SECONDSごと） ----------
  const now = Date.now();
  const stepChanged = stepIndex !== lastLoggedStepIndex;
  const intervalElapsed = now - lastLogAt >= LOG.INTERVAL_SECONDS * 1000;
  if (stepChanged || intervalElapsed) {
    appendLogEntry({
      timestamp: new Date(now).toISOString(),
      recordReason: stepChanged ? 'intersection' : 'interval',
      testRouteId: testRouteSelect.value,
      lat: pos.lat,
      lon: pos.lon,
      gpsAccuracy: pos.accuracy,
      speed: pos.speed,
      roadName: snap.roadName,
      roadClass: snap.roadClass,
      laneCount: snap.laneCount,
      lanesRaw: snap.lanesRaw,
      mapboxRecommendedLanes: snap.mapboxRecommendedLanes,
      smartLaneRecommendedLanes: snap.smartLaneRecommendedLanes,
      recommendationMatched: snap.recommendationMatched,
      nextManeuver: snap.nextManeuver,
      distanceToNext: snap.distanceToNext,
      followingManeuver: snap.followingManeuver,
      distanceToFollowing: snap.distanceToFollowing,
      nextRoadName: snap.nextRoadName,
      nextRoadLaneCount: snap.nextRoadLaneCount,
      nextRoadLanesRaw: snap.nextRoadLanesRaw,
      confidence: snap.confidence,
      reason: snap.reason,
      gpsDowngraded: snap.gpsDowngraded,
      missingFields: snap.missingFields
    });
    lastLogAt = now;
    lastLoggedStepIndex = stepIndex;
  }

  // ---------- 自動再ルート（逸脱検知、最短10秒間隔） ----------
  if (!rerouting && rerouter.shouldReroute(trackResult.isOffRoute, now) && selectedDestination) {
    rerouting = true;
    setStatus('ルートから外れました。再検索中…');
    fetchRoute({ origin: { lat: pos.lat, lon: pos.lon }, destination: selectedDestination, token: MAPBOX_TOKEN })
      .then((route) => {
        currentRoute = route;
        tracker = createRouteTracker(route);
        lastLoggedStepIndex = -1;
        drawRoute(map, route.geometry);
        setStatus('再ルートしました');
      })
      .catch((err) => setStatus(`再ルートエラー: ${err.message}`, true))
      .finally(() => { rerouting = false; });
  }
}

let firstFixReceived = false;

function onPositionUpdate(pos) {
  lastPosition = pos;
  updateGpsDebug(pos);

  if (!userMarker) userMarker = createUserMarker(map);
  userMarker.update([pos.lon, pos.lat], pos.heading);

  if (isFollowing) {
    followCamera(map, [pos.lon, pos.lat], pos.heading, { is3d });
  }

  if (!firstFixReceived) {
    firstFixReceived = true;
    setStatus('地図+GPS OK（Step 2完了）');
  }

  processNavUpdate(pos);
}

function onPositionError(err) {
  setStatus(`GPSエラー：${err.message ?? '取得できません'}`, true);
}

// ---------- 地図の読み込み完了後に開始 ----------
map.on('load', () => {
  setStatus('地図OK（Step 1完了）');
  enableTerrain(map);
  applyLightPreset(map, pickLightPreset());

  watchId = watchPosition(onPositionUpdate, onPositionError);
});

map.on('error', (e) => {
  setStatus('地図エラー：' + (e.error?.message ?? '不明'), true);
});

window.addEventListener('beforeunload', () => {
  clearWatch(watchId);
});

// ---------- ナビ開始／終了：画面消灯防止・音声解禁・ルート取得 ----------
const btnStart = document.getElementById('btnStart');
const guideMain = document.getElementById('guideMain');
let navActive = false;
let wakeLockSentinel = null;

async function acquireWakeLock() {
  wakeLockSentinel = await requestWakeLock();
  if (wakeLockSentinel) {
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
  }
}

async function startNav() {
  const check = canStartNav({ destination: selectedDestination, position: lastPosition });
  if (!check.ok) {
    setStatus(check.reason, true);
    return;
  }

  // iOS Safari対策：unlockSpeech()はクリックハンドラ内でawaitより前に同期的に呼ぶ
  unlockSpeech();

  // ルート取得中は連打で複数回fetchが走らないようボタンを無効化する。
  // navActiveは「ルート取得に成功してから」trueにする（失敗時に半端な状態が残らないように）。
  btnStart.disabled = true;
  guideMain.textContent = 'ルート取得中…';

  try {
    const route = await fetchRoute({
      origin: { lat: lastPosition.lat, lon: lastPosition.lon },
      destination: selectedDestination,
      token: MAPBOX_TOKEN
    });

    currentRoute = route;
    tracker = createRouteTracker(route);
    lastLoggedStepIndex = -1;
    drawRoute(map, route.geometry);

    navActive = true;
    btnStart.classList.add('active');
    btnStart.setAttribute('aria-pressed', 'true');
    btnStart.textContent = 'ナビ終了';
    guideMain.textContent = 'ナビ中';
    speak('ナビを開始します');

    await acquireWakeLock();
  } catch (err) {
    // 失敗時は「未開始」状態へ確実に戻す（ボタン表示・navActive・案内バー・ルート情報）。
    currentRoute = null;
    tracker = null;
    clearRoute(map);
    navActive = false;
    btnStart.classList.remove('active');
    btnStart.setAttribute('aria-pressed', 'false');
    btnStart.textContent = 'ナビ開始';
    guideMain.textContent = 'ナビ未開始';
    setStatus(`ルート取得エラー: ${err.message}`, true);
    speak('ルートを取得できませんでした');
  } finally {
    btnStart.disabled = false;
  }
}

function stopNav() {
  navActive = false;
  btnStart.classList.remove('active');
  btnStart.setAttribute('aria-pressed', 'false');
  btnStart.textContent = 'ナビ開始';
  guideMain.textContent = 'ナビ未開始';

  currentRoute = null;
  tracker = null;
  lastLoggedStepIndex = -1;
  clearRoute(map);

  if (wakeLockSentinel) {
    wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

btnStart.addEventListener('click', () => {
  if (navActive) {
    stopNav();
  } else {
    startNav();
  }
});

// タブがバックグラウンドから復帰した際、WakeLockは自動解放されているため再取得する。
document.addEventListener('visibilitychange', () => {
  if (navActive && document.visibilityState === 'visible' && !wakeLockSentinel) {
    acquireWakeLock();
  }
});

// ---------- 走行ログの操作 ----------
document.getElementById('btnLogExport').addEventListener('click', exportLogAsFile);
document.getElementById('btnLogClear').addEventListener('click', () => {
  if (confirm('走行ログを全て削除します。よろしいですか？')) clearLog();
});

// Turf.js の読み込み確認
if (typeof turf === 'undefined') {
  console.warn('Turf.js が読み込まれていません');
} else {
  console.log('Turf.js OK');
}
