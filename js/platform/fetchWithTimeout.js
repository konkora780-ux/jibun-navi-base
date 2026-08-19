/**
 * platform/fetchWithTimeout.js — fetch()にタイムアウトを付ける共通ヘルパー。
 * Directions API・Search Box APIの両方で使う（platform/directions.js・platform/geocoding.js）。
 *
 * タイムアウトで中断した場合はエラーに isTimeout:true を付けて投げる。
 * 呼び出し側はこれを見て、通常の通信エラーと区別した案内文を出せる
 * （core/connectivityMessages.js の describeRequestTimeout()）。
 */

export const DEFAULT_TIMEOUT_MS = 15000;

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('通信がタイムアウトしました');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
