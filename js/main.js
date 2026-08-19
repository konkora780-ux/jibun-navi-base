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
  MAPBOX_TOKEN, MAP_STYLE, MAP_DEFAULT, MAP_FOLLOW, GPS_ACCURACY, LOG, ARRIVAL, API_RETRY
} from './config.js';
import {
  createMap, enableTerrain, pickLightPreset, applyLightPreset,
  createUserMarker, createDestinationMarker, followCamera, drawRoute, clearRoute
} from './platform/mapView.js';
import { watchPosition, clearWatch, requestWakeLock } from './platform/location.js';
import { unlockSpeech, speak, cancelSpeech } from './platform/voice.js';
import { fetchRoute } from './platform/directions.js';
import { searchDestination } from './platform/geocoding.js';
import { isSpeechInputSupported, startVoiceSearch } from './platform/speechInput.js';
import { createRouteTracker } from './nav/routeTracker.js';
import { createRerouter } from './nav/rerouter.js';
import { createNavSession } from './nav/navSession.js';
import { createNavigationProgress } from './nav/navigationProgress.js';
import { createArrivalTracker } from './nav/arrivalTracker.js';
import { createVoiceScheduler } from './nav/voiceScheduler.js';
import { createApiRetryPolicy } from './nav/apiRetryPolicy.js';
import { renderDestResultItem } from './ui/destResultsView.js';
import { renderNavigationPanel } from './ui/navigationPanel.js';
import { setBannerState, clearBannerState } from './ui/statusBannerController.js';
import { renderSmartLaneGuide } from './ui/smartLaneGuide.js';
import { createSmartLaneInput, pickTargetRoad } from './core/models.js';
import { evaluateSmartLane } from './core/smartLane.js';
import { compareRecommendation } from './core/compare.js';
import { describeManeuver } from './core/phrase.js';
import {
  formatDistance, formatDuration, formatETA, resolveUpcomingRoadName, formatUpcomingRoadLabel
} from './core/formatNavigation.js';
import {
  describeGeolocationError, describeNetworkStatus, describeRouteFetchFailure,
  describeMapError, describeGpsAccuracyDegraded, describeRequestTimeout,
  describeSearchNoResults, describeSearchFailure, describeWakeLockUnavailable
} from './core/connectivityMessages.js';
import { renderDebugPanel } from './ui/debugPanel.js';
import { appendLogEntry, exportLogAsFile, clearLog } from './log/driveLog.js';
import {
  recordDestinationUse, getHistory, toggleFavorite, isFavorite, getFavorites, excludeFavorites
} from './log/destinationHistory.js';
import { formatDestinationLabel, isDestinationSelectionValid } from './core/destinationSelection.js';

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
// 技術的な例外文はDEBUG欄だけに出し、利用者向けバナーには分かりやすい文言を出す。
if (!MAPBOX_TOKEN || MAPBOX_TOKEN.startsWith('pk.ここに')) {
  setStatus('トークン未設定：js/config.js を編集してください', true);
  setBannerState('map-error', '地図の設定が完了していません。設定内容を確認してください');
  throw new Error('MAPBOX_TOKEN is not set');
}
if (MAPBOX_TOKEN.startsWith('sk.')) {
  setStatus('危険：sk.トークンは使用禁止です', true);
  setBannerState('map-error', '地図の設定が完了していません。設定内容を確認してください');
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

// btnRecenterは「現在地へ戻る」単発操作ボタンとして扱う（aria-pressedは付けない）。
// activeクラスは「追従が止まっていて、押すと復帰できる」という視覚的な注意喚起のみに使う。
function pauseFollow() {
  isFollowing = false;
  btnRecenter.classList.add('active');
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(resumeFollow, MAP_FOLLOW.RESUME_AFTER_SECONDS * 1000);
}

function resumeFollow() {
  isFollowing = true;
  btnRecenter.classList.remove('active');
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

// ---------- 目的地検索まわりの折りたたみ ----------
// 地図の邪魔にならないよう既定で折りたたみ、押したときだけ展開する。
// ナビが始まったら自動的にまた折りたたむ（startNavのonSuccess参照）。
const btnToggleSearch = document.getElementById('btnToggleSearch');
const destSearchGroup = document.getElementById('destSearchGroup');

function setSearchExpanded(expanded) {
  destSearchGroup.classList.toggle('hidden', !expanded);
  btnToggleSearch.classList.toggle('active', expanded);
  btnToggleSearch.setAttribute('aria-pressed', String(expanded));
  if (!expanded) hideDestResults();
}

btnToggleSearch.addEventListener('click', () => {
  const expanding = destSearchGroup.classList.contains('hidden');
  setSearchExpanded(expanding);
  if (expanding) destInput.focus();
});

let destinationMarker = null;

function selectDestination(r) {
  selectedDestination = r;
  destInput.value = formatDestinationLabel(r);
  setStatus(`目的地を設定: ${r.name}`);
  hideDestResults();
  recordDestinationUse(r);
  // 「目的地未設定」が原因だったナビ開始不可バナー・検索失敗バナーは、
  // 目的地が決まった時点で解除する。
  clearBannerState('nav-guard');
  clearBannerState('search-failure');

  if (!destinationMarker) destinationMarker = createDestinationMarker(map);
  destinationMarker.update([r.lon, r.lat]);

  // 選んだ場所を地図で一瞬確認できるようにする。自動追従は既存のpauseFollowの
  // 仕組みでMAP_FOLLOW.RESUME_AFTER_SECONDS秒後に自動的に自車位置へ戻る。
  pauseFollow();
  map.easeTo({ center: [r.lon, r.lat], zoom: Math.min(map.getZoom(), 14), duration: 600 });
}

// 入力欄が選択時の文字列と食い違ったら（利用者が手入力で書き換えた等）選択を解除する。
// 画面表示と違う目的地へナビが始まってしまう事故を防ぐ（優先度A対応）。
function clearSelectedDestinationIfMismatched() {
  if (!selectedDestination) return;
  if (isDestinationSelectionValid(destInput.value, selectedDestination)) return;

  selectedDestination = null;
  if (destinationMarker) destinationMarker.remove();
  setStatus('目的地の選択が解除されました。候補から選び直してください', true);
}

let lastShownResults = [];

// 現在地からの直線距離ラベル（同名候補の絞り込み用）。現在地未取得時はnull（非表示）。
function distanceLabelFor(r) {
  if (typeof turf === 'undefined' || !lastPosition || r.lat == null || r.lon == null) return null;
  const meters = turf.distance([lastPosition.lon, lastPosition.lat], [r.lon, r.lat], { units: 'kilometers' }) * 1000;
  return formatDistance(meters);
}

function showDestResults(results) {
  lastShownResults = results;
  destResults.innerHTML = '';
  results.forEach((r) => {
    destResults.appendChild(renderDestResultItem(r, selectDestination, {
      isFavorite: isFavorite(r),
      onToggleFavorite: handleToggleFavorite,
      distanceLabel: distanceLabelFor(r)
    }));
  });
  destResults.classList.remove('hidden');
}

function handleToggleFavorite(destination) {
  toggleFavorite(destination);
  // ★の状態を反映するため一覧を再描画する。入力欄が空（履歴/お気に入り表示中）
  // なら並び替えを含めて組み直し、検索結果表示中ならそのままの並びで★だけ更新する。
  if (destInput.value.trim() === '') {
    showHistoryOrFavoritesIfInputEmpty();
  } else {
    showDestResults(lastShownResults);
  }
}

// 検索ボタン・Enterキーどちらから呼ばれても同じ経路を通す（二重送信防止も一箇所で行う）。
let searchInFlight = false;

async function performSearch() {
  const query = destInput.value.trim();
  if (!query) {
    // 空欄での検索は行わず、お気に入り・履歴を候補として出す。
    showHistoryOrFavoritesIfInputEmpty();
    return;
  }
  if (searchInFlight) return; // 連打・Enter連打での二重送信を防ぐ

  searchInFlight = true;
  btnSearch.disabled = true;
  setBannerState('search-loading', '検索中…');
  try {
    const results = await searchDestination({
      query,
      token: MAPBOX_TOKEN,
      proximity: lastPosition ? { lat: lastPosition.lat, lon: lastPosition.lon } : null
    });
    if (results.length === 0) {
      setStatus('検索結果が見つかりません', true);
      hideDestResults();
      setBannerState('search-failure', describeSearchNoResults());
      return;
    }
    showDestResults(results);
    setStatus(`候補${results.length}件から目的地を選んでください`);
    clearBannerState('search-failure');
  } catch (err) {
    setStatus(`検索エラー: ${err.message}`, true);
    setBannerState('search-failure', err.isTimeout ? describeRequestTimeout() : describeSearchFailure());
  } finally {
    // 検索の成否にかかわらず、ボタンは必ず再操作できる状態へ戻す。
    btnSearch.disabled = false;
    searchInFlight = false;
    clearBannerState('search-loading');
  }
}

btnSearch.addEventListener('click', performSearch);
// 目的地入力欄でEnterを押したら検索を開始する。
destInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performSearch();
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

// 入力欄が空のとき（未入力でタップした/全部消した）は、お気に入り→履歴の順に候補として出す
// （お気に入りに入っている項目は履歴側には重複して出さない）。
// どちらもlocalStorageのみに保存され外部へは送信しない（log/destinationHistory.js）。
function showHistoryOrFavoritesIfInputEmpty() {
  if (destInput.value.trim() !== '') return;
  const favorites = getFavorites();
  const history = excludeFavorites(favorites, getHistory());
  const combined = [...favorites, ...history];
  if (combined.length > 0) showDestResults(combined);
}

// 入力し直したら古い候補一覧は消す（空になった場合はお気に入り/履歴を表示し直す）。
// 手入力で書き換えられた場合は選択済みの目的地を解除する（selectDestination自身が
// destInput.value を書き換えてもinputイベントは発火しないため、ここでは常に
// 「利用者が実際に編集した」場合だけを扱える）。
destInput.addEventListener('input', () => {
  clearSelectedDestinationIfMismatched();
  clearBannerState('search-failure'); // 新しく入力し直したので古い検索失敗表示は消す
  hideDestResults();
  showHistoryOrFavoritesIfInputEmpty();
});
destInput.addEventListener('focus', showHistoryOrFavoritesIfInputEmpty);
// 候補以外をタップ/クリックしたら閉じる
document.addEventListener('click', (e) => {
  if (!destResults.classList.contains('hidden') && !e.target.closest('#destWrap')) {
    hideDestResults();
  }
});

// ---------- ナビ本体（Step6〜10 + Phase2A：ルート取得・追跡・SmartLane評価・ログ） ----------
let currentRoute = null;
let tracker = null;
const rerouter = createRerouter();
const navigationProgress = createNavigationProgress();
const arrivalTracker = createArrivalTracker(ARRIVAL);
const voiceScheduler = createVoiceScheduler();
const rerouteRetryPolicy = createApiRetryPolicy(API_RETRY);
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
  const targetRoadSnapshot = pickTargetRoad(advice, input.currentRoad, input.nextRoad);
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

  // ---------- 到着判定（Phase2A） ----------
  const straightLineDistanceM = typeof turf !== 'undefined' && selectedDestination
    ? turf.distance([pos.lon, pos.lat], [selectedDestination.lon, selectedDestination.lat], { units: 'kilometers' }) * 1000
    : null;
  const { remainingDistanceM, remainingSeconds } = navigationProgress.update(currentRoute, trackResult);

  const arrived = arrivalTracker.update({
    straightLineDistanceM,
    routeRemainingDistanceM: remainingDistanceM,
    speedMPS: pos.speed,
    gpsAccuracyM: pos.accuracy
  });

  if (arrived) {
    appendLogEntry({
      timestamp: new Date().toISOString(),
      recordReason: 'arrival',
      testRouteId: testRouteSelect.value,
      lat: pos.lat, lon: pos.lon, gpsAccuracy: pos.accuracy, speed: pos.speed,
      roadName: snap.roadName, roadClass: snap.roadClass,
      laneCount: snap.laneCount, lanesRaw: snap.lanesRaw,
      mapboxRecommendedLanes: snap.mapboxRecommendedLanes,
      smartLaneRecommendedLanes: snap.smartLaneRecommendedLanes,
      recommendationMatched: snap.recommendationMatched,
      nextManeuver: snap.nextManeuver, distanceToNext: snap.distanceToNext,
      followingManeuver: snap.followingManeuver, distanceToFollowing: snap.distanceToFollowing,
      nextRoadName: snap.nextRoadName, nextRoadLaneCount: snap.nextRoadLaneCount,
      nextRoadLanesRaw: snap.nextRoadLanesRaw,
      confidence: snap.confidence, reason: snap.reason, gpsDowngraded: snap.gpsDowngraded,
      missingFields: snap.missingFields
    });
    handleArrival();
    return;
  }

  // ---------- 実走用ナビパネル＋標準の右左折音声案内（Phase2A） ----------
  // SmartLaneが「次の道路」向けの推奨をしている場合は、次の道路の車線データを渡す
  // （現在道路の車線図をそのまま出すと、推奨と車線数・形状が食い違って見えるため）。
  const smartLaneGuide = renderSmartLaneGuide(advice, targetRoadSnapshot?.lanes ?? null);

  // 画面表示・音声案内とも、同じresolveUpcomingRoadName()を元にする
  // （これから入る道路名を優先し、分からない場合だけ現在の道路名にフォールバック）。
  const upcomingRoadName = resolveUpcomingRoadName(input.currentRoad, input.nextRoad);
  const displayRoadName = formatUpcomingRoadLabel(input.currentRoad, input.nextRoad);

  renderNavigationPanel({
    phase: 'guiding',
    maneuver: input.currentManeuver,
    distanceToManeuverText: formatDistance(trackResult.distanceToCurrentManeuver),
    roadName: displayRoadName,
    smartLane: smartLaneGuide,
    eta: formatETA(Date.now(), remainingSeconds),
    remainingTime: formatDuration(remainingSeconds),
    remainingDistance: formatDistance(remainingDistanceM)
  });

  voiceScheduler.update({
    maneuverSignature: String(stepIndex),
    distanceToManeuverM: trackResult.distanceToCurrentManeuver,
    roadClass: input.currentRoad.roadClass,
    speedMPS: pos.speed,
    roadName: upcomingRoadName,
    maneuver: input.currentManeuver,
    smartLanePhrase: advice.phrase,
    smartLaneConfidence: advice.confidence
  });

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

  // ---------- 自動再ルート（逸脱検知、最短10秒間隔＋回数上限） ----------
  if (!rerouting && rerouter.shouldReroute(trackResult.isOffRoute, now) && selectedDestination) {
    const retryCheck = rerouteRetryPolicy.canRetry(now);
    if (!retryCheck.ok) {
      setBannerState('route-fetch-failure', describeRouteFetchFailure(retryCheck));
    } else {
      rerouting = true;
      rerouteRetryPolicy.recordAttempt(now);
      setStatus('ルートから外れました。再検索中…');
      setBannerState('route-loading', 'ルートから外れました。再検索中…');
      fetchRoute({ origin: { lat: pos.lat, lon: pos.lon }, destination: selectedDestination, token: MAPBOX_TOKEN })
        .then((route) => {
          currentRoute = route;
          tracker = createRouteTracker(route);
          navigationProgress.reset();
          voiceScheduler.reset();
          lastLoggedStepIndex = -1;
          drawRoute(map, route.geometry);
          setStatus('再ルートしました');
          rerouteRetryPolicy.reset();
          clearBannerState('route-loading');
          clearBannerState('route-fetch-failure');
        })
        .catch((err) => {
          setStatus(`再ルートエラー: ${err.message}`, true);
          clearBannerState('route-loading');
          const message = err.isTimeout
            ? describeRequestTimeout()
            : describeRouteFetchFailure(rerouteRetryPolicy.canRetry(Date.now()));
          setBannerState('route-fetch-failure', message);
        })
        .finally(() => { rerouting = false; });
    }
  }
}

let firstFixReceived = false;

function onPositionUpdate(pos) {
  lastPosition = pos;
  updateGpsDebug(pos);

  // 位置情報を取得できているので「GPS取得エラー」状態は解除する。
  // オフライン等の他の警告があれば、優先度に従ってそちらが引き続き表示される
  // （statusBannerControllerが優先順位を見て自動的に選ぶため、ここで気にしなくてよい）。
  clearBannerState('gps-error');

  if (!userMarker) userMarker = createUserMarker(map);
  userMarker.update([pos.lon, pos.lat], pos.heading);

  if (isFollowing) {
    followCamera(map, [pos.lon, pos.lat], pos.heading, { is3d });
  }

  if (!firstFixReceived) {
    firstFixReceived = true;
    setStatus('地図+GPS OK（Step 2完了）');
  }

  // 位置情報自体は取得できているが、精度が悪い場合は利用者に分かる形で伝える。
  if (pos.accuracy != null && pos.accuracy > GPS_ACCURACY.DEGRADED) {
    setBannerState('gps-accuracy', describeGpsAccuracyDegraded());
  } else {
    clearBannerState('gps-accuracy');
  }

  processNavUpdate(pos);
}

function onPositionError(err) {
  setStatus(`GPSエラー：${err.message ?? '取得できません'}`, true);
  setBannerState('gps-error', describeGeolocationError(err));
}

// ---------- 地図の読み込み完了後に開始 ----------
map.on('load', () => {
  setStatus('地図OK（Step 1完了）');
  enableTerrain(map);
  applyLightPreset(map, pickLightPreset());

  watchId = watchPosition(onPositionUpdate, onPositionError);
});

map.on('error', (e) => {
  // 技術的な例外文はDEBUG欄だけに出し、利用者向けの案内バナーには出さない。
  setStatus('地図エラー：' + (e.error?.message ?? '不明'), true);
  setBannerState('map-error', describeMapError());
});

window.addEventListener('beforeunload', () => {
  clearWatch(watchId);
});

// ---------- ナビ開始／終了：画面消灯防止・音声解禁・ルート取得 ----------
const btnStart = document.getElementById('btnStart');
let navActive = false;
let wakeLockSentinel = null;

// 実走用ナビパネルの初期表示（未開始状態）。
renderNavigationPanel({
  phase: 'idle', maneuver: null, distanceToManeuverText: '', roadName: null,
  smartLane: null, eta: '—', remainingTime: '', remainingDistance: ''
});

// ---------- 通信状態の表示 ----------
// 技術的なエラー文をそのまま出さず、利用者が次に何をすればよいかを日本語で示す。
function updateConnectivityBanner() {
  const message = describeNetworkStatus(navigator.onLine);
  if (message) {
    setBannerState('offline', message);
  } else {
    clearBannerState('offline');
  }
}
window.addEventListener('online', updateConnectivityBanner);
window.addEventListener('offline', updateConnectivityBanner);
updateConnectivityBanner();

async function acquireWakeLock() {
  const result = await requestWakeLock();
  if (result.ok) {
    wakeLockSentinel = result.sentinel;
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
    clearBannerState('wake-lock');
  } else {
    // 未対応・取得失敗のどちらでもナビ自体は止めない。画面が消える可能性があることだけ伝える。
    wakeLockSentinel = null;
    setBannerState('wake-lock', describeWakeLockUnavailable());
  }
}

const navSession = createNavSession({ fetchRouteFn: fetchRoute });

async function startNav() {
  // 最終安全確認：入力欄の文字列が選択済み目的地と食い違っていないか、
  // ナビ開始の直前にもう一度検証する（優先度A対応。二重チェックで事故を防ぐ）。
  clearSelectedDestinationIfMismatched();

  // iOS Safari対策：unlockSpeech()はクリックハンドラ内でawaitより前に同期的に呼ぶ
  unlockSpeech();

  const result = await navSession.start(
    { destination: selectedDestination, position: lastPosition, token: MAPBOX_TOKEN },
    {
      onLoadingStart: () => {
        // ルート取得中は連打で複数回fetchが走らないようボタンを無効化する
        // （navSession自体も二重起動を防ぐが、UI上も分かりやすく無効化する）。
        btnStart.disabled = true;
        setBannerState('route-loading', 'ルート取得中…');
      },
      onSuccess: async (route) => {
        currentRoute = route;
        tracker = createRouteTracker(route);
        lastLoggedStepIndex = -1;
        drawRoute(map, route.geometry);

        // 前回のナビ終了時にvoiceSchedulerは無効化されている(stop())ため、
        // 新しいナビ開始のたびに明示的に有効化し直す。
        voiceScheduler.reset();

        navActive = true;
        btnStart.classList.add('active');
        btnStart.setAttribute('aria-pressed', 'true');
        btnStart.textContent = 'ナビ終了';
        // ナビが始まったら目的地検索まわりを自動的にたたみ、地図の邪魔にならないようにする。
        setSearchExpanded(false);
        clearBannerState('route-loading');
        clearBannerState('route-fetch-failure');
        clearBannerState('nav-guard');
        speak('ナビを開始します');

        // 成功時だけWake Lockを取得する。
        await acquireWakeLock();
      },
      onFailure: (err) => {
        // 失敗時は「未開始」状態へ確実に戻す（ボタン表示・navActive・案内バー・ルート情報）。
        // Wake Lockはここでは一度も取得していない。
        currentRoute = null;
        tracker = null;
        clearRoute(map);
        navActive = false;
        btnStart.classList.remove('active');
        btnStart.setAttribute('aria-pressed', 'false');
        btnStart.textContent = 'ナビ開始';
        renderNavigationPanel({
          phase: 'idle', maneuver: null, distanceToManeuverText: '', roadName: null,
          smartLane: null, eta: '—', remainingTime: '', remainingDistance: ''
        });
        setStatus(`ルート取得エラー: ${err.message}`, true);
        clearBannerState('route-loading');
        setBannerState('route-fetch-failure', err.isTimeout ? describeRequestTimeout() : describeRouteFetchFailure({ ok: false }));
        speak('ルートを取得できませんでした');
      }
    }
  );

  // ガード判定（目的地/現在地未取得）で開始できなかった場合のみ、ここでメッセージを出す。
  // ルート取得失敗の場合はonFailureで既に表示済みなので重複させない。
  // DEBUG欄だけでなく利用者向けバナーにも理由を表示する（優先度A対応）。
  if (result.phase === 'guard') {
    setStatus(result.reason, true);
    setBannerState('nav-guard', result.reason);
  }

  btnStart.disabled = false;
}

// ナビを終える際の共通後始末（手動停止・到着の両方から呼ばれる）。
// 「案内を止める」処理を一箇所にまとめ、片方だけ更新し忘れる事故を防ぐ。
// cancelVoice: 読み上げ中の音声も止めるか。手動停止では止めるが、到着時は
// 直前にspeak()した「目的地周辺です」の案内を消してしまわないようfalseで呼ぶ。
function resetNavState({ cancelVoice = true } = {}) {
  if (cancelVoice) cancelSpeech();
  navSession.stop();
  navActive = false;
  btnStart.classList.remove('active');
  btnStart.setAttribute('aria-pressed', 'false');
  btnStart.textContent = 'ナビ開始';

  currentRoute = null;
  tracker = null;
  lastLoggedStepIndex = -1;
  clearRoute(map);

  navigationProgress.reset();
  arrivalTracker.reset();
  voiceScheduler.stop();
  rerouteRetryPolicy.reset();

  // ナビの状態にひもづくバナーだけを消す。GPS精度/オフライン/地図エラー/
  // 画面消灯防止の警告は、ナビが終了しても状況自体は続いている場合があるため触らない。
  clearBannerState('route-loading');
  clearBannerState('route-fetch-failure');
  clearBannerState('nav-guard');

  if (wakeLockSentinel) {
    wakeLockSentinel.release();
    wakeLockSentinel = null;
  }
}

function stopNav() {
  resetNavState();
  renderNavigationPanel({
    phase: 'idle', maneuver: null, distanceToManeuverText: '', roadName: null,
    smartLane: null, eta: '—', remainingTime: '', remainingDistance: ''
  });
}

// 目的地到着時の後始末（3-4）。手動停止(stopNav)と違い、到着メッセージを
// 音声で知らせ、パネルを「到着」状態にしてから共通の後始末を行う。
function handleArrival() {
  cancelSpeech();
  speak('目的地周辺です。ナビを終了します');
  renderNavigationPanel({
    phase: 'arrived', maneuver: null, distanceToManeuverText: '', roadName: null,
    smartLane: null, eta: '—', remainingTime: '', remainingDistance: ''
  });
  resetNavState({ cancelVoice: false });
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
