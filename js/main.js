/**
 * main.js — 起動・全体の配線
 * Step 1：地図の表示
 * Step 2：現在地追従・GPS精度表示・3D地形・昼夜ライティング
 * Step 3：画面消灯防止と音声解禁（実走テスト成立の前提条件）
 */
import { MAPBOX_TOKEN, MAP_STYLE, MAP_DEFAULT, MAP_FOLLOW, GPS_ACCURACY } from './config.js';
import {
  createMap, enableTerrain, pickLightPreset, applyLightPreset,
  createUserMarker, followCamera
} from './platform/mapView.js';
import { watchPosition, clearWatch, requestWakeLock } from './platform/location.js';
import { unlockSpeech, speak } from './platform/voice.js';

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
});

// ---------- DEBUGパネルの表示切替 ----------
const btnDebug = document.getElementById('btnDebug');
btnDebug.addEventListener('click', () => {
  document.getElementById('app').classList.toggle('hide-debug');
  btnDebug.classList.toggle('active');
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

function updateDebugPanel(pos) {
  dbg.gps.textContent = `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}`;
  dbg.accuracy.textContent = pos.accuracy != null ? `${pos.accuracy.toFixed(1)} m` : '取得不可';
  dbg.accuracy.className = accuracyClass(pos.accuracy);
  dbg.speed.textContent = pos.speed != null ? `${Math.round(pos.speed * 3.6)} km/h` : '—';
}

let firstFixReceived = false;

function onPositionUpdate(pos) {
  lastPosition = pos;
  updateDebugPanel(pos);

  if (!userMarker) userMarker = createUserMarker(map);
  userMarker.update([pos.lon, pos.lat], pos.heading);

  if (isFollowing) {
    followCamera(map, [pos.lon, pos.lat], pos.heading, { is3d });
  }

  if (!firstFixReceived) {
    firstFixReceived = true;
    setStatus('地図+GPS OK（Step 2完了）');
  }
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

// ---------- ナビ開始：画面消灯防止と音声解禁 ----------
// Step 9で目的地検索・ルート案内につなぐまでは、ここでは「実走テストに必要な
// 画面消灯防止と音声が実機で機能するか」だけを確認する。
const btnStart = document.getElementById('btnStart');
const guideMain = document.getElementById('guideMain');
let navActive = false;
let wakeLockSentinel = null;

async function startNav() {
  // iOS Safari対策：unlockSpeech()はクリックハンドラ内でawaitより前に同期的に呼ぶ
  unlockSpeech();
  speak('ナビを開始します');

  navActive = true;
  btnStart.classList.add('active');
  btnStart.textContent = 'ナビ終了';
  guideMain.textContent = 'ナビ中（Step 3テスト）';

  wakeLockSentinel = await requestWakeLock();
  if (wakeLockSentinel) {
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    });
  }
}

function stopNav() {
  navActive = false;
  btnStart.classList.remove('active');
  btnStart.textContent = 'ナビ開始';
  guideMain.textContent = 'ナビ未開始';

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
document.addEventListener('visibilitychange', async () => {
  if (navActive && document.visibilityState === 'visible' && !wakeLockSentinel) {
    wakeLockSentinel = await requestWakeLock();
    if (wakeLockSentinel) {
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  }
});

// Turf.js の読み込み確認（Step 6 で使うため、ここで動作を確かめておく）
if (typeof turf === 'undefined') {
  console.warn('Turf.js が読み込まれていません');
} else {
  console.log('Turf.js OK');
}
