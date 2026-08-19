/**
 * nav/navSession.js — ナビ開始/終了の状態遷移を管理する
 *
 * DOM・Mapbox・実際のfetchRouteには依存しない（fetchRouteFnを引数で受け取る）。
 * こうすることで、main.jsの実際の画面操作を介さずにテストできる。
 * 画面表示・地図描画・Wake Lock取得などの副作用は、呼び出し側がハンドラ
 * （onLoadingStart/onSuccess/onFailure）で行う。このモジュール自身の責務は、
 *   1. canStartNav()によるガード判定
 *   2. 「取得中に連打されても2回目以降は無視する」という状態管理
 *   3. 成功/失敗に応じたハンドラの呼び分け
 * だけに絞る。
 */
import { canStartNav } from './navGuard.js';

export function createNavSession({ fetchRouteFn }) {
  let state = 'idle'; // 'idle' | 'loading' | 'active'
  let fetchCallCount = 0;

  return {
    getState: () => state,
    getFetchCallCount: () => fetchCallCount,

    /**
     * @param {{destination: unknown, position: unknown, token: string}} args
     * @param {{onLoadingStart?: () => void, onSuccess?: (route: unknown) => void, onFailure?: (err: Error) => void}} handlers
     * @returns {Promise<{started: boolean, phase?: 'busy'|'guard'|'fetch-error', reason?: string}>}
     */
    async start({ destination, position, token }, handlers = {}) {
      if (state !== 'idle') {
        return { started: false, phase: 'busy', reason: '既にルート取得中です' };
      }

      const guard = canStartNav({ destination, position });
      if (!guard.ok) {
        return { started: false, phase: 'guard', reason: guard.reason };
      }

      state = 'loading';
      fetchCallCount++;
      handlers.onLoadingStart?.();

      try {
        const route = await fetchRouteFn({
          origin: { lat: position.lat, lon: position.lon },
          destination,
          token
        });
        // onSuccess（地図描画・Wake Lock取得等の後続処理）の完了を待ってから
        // stateをactiveにする。ここをawaitしないと、onSuccess内で例外が起きても
        // 「成功・active」のまま扱われてしまう（未処理のPromise rejectionにもなる）。
        await handlers.onSuccess?.(route);
        state = 'active';
        return { started: true };
      } catch (err) {
        state = 'idle';
        handlers.onFailure?.(err);
        return { started: false, phase: 'fetch-error', reason: err.message };
      }
    },

    stop(handlers = {}) {
      state = 'idle';
      handlers.onStop?.();
    }
  };
}
