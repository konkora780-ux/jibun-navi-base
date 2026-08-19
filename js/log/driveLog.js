/**
 * log/driveLog.js — 走行ログの記録とエクスポート
 * localStorageに保存し、JSONファイルとしてダウンロードできる。
 * 記録頻度（交差点通過時＋10秒ごと）の判断はmain.js側が行う。ここは保存/読み出しだけ。
 */
import { LOG } from '../config.js';

export function loadLog() {
  try {
    const raw = localStorage.getItem(LOG.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('走行ログの読み込みに失敗:', err.message);
    return [];
  }
}

function saveLog(entries) {
  localStorage.setItem(LOG.STORAGE_KEY, JSON.stringify(entries));
}

export function appendLogEntry(entry) {
  const entries = loadLog();
  entries.push(entry);
  saveLog(entries);
}

export function clearLog() {
  localStorage.removeItem(LOG.STORAGE_KEY);
}

export function exportLogAsFile() {
  const entries = loadLog();
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jibunnavi_drivelog_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
