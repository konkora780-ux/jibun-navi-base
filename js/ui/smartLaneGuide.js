/**
 * ui/smartLaneGuide.js — 実走用ナビパネルに表示するSmartLane車線案内
 *
 * DEBUGパネル用のui/laneView.jsとは表示先が異なるため分離しているが、
 * 車線矢印の描画自体（色・太さ・枠・打ち消し線での判別）はlaneView.jsを再利用する。
 *
 * Confidenceごとの表示ルール（安全原則5・7・8）：
 *   high   … 推奨車線を強調して文言表示。音声案内も可
 *   medium … 幅のある案内文言を表示。音声案内も可（ただし慎重な言い回し）
 *   low    … 参考表示のみ。音声案内はしない
 *   unknown… 独自の推奨は表示しない。控えめな「取得不可」表示のみ
 */
import { renderLanes } from './laneView.js';

/**
 * @param {{confidence:string, phrase:string, recommendedLanes:number[]}|null} advice
 * @param {import('../core/models.js').LaneInfo[]|null} lanesRaw
 * @returns {{text:string, lanesHtml:string, confidence:string}}
 */
export function renderSmartLaneGuide(advice, lanesRaw) {
  const confidence = advice?.confidence ?? 'unknown';
  const showLanes = !!lanesRaw && lanesRaw.length > 0;

  let text;
  if ((confidence === 'high' || confidence === 'medium') && advice?.phrase) {
    text = advice.phrase;
  } else if (confidence === 'low') {
    text = '車線情報は参考程度です';
  } else {
    // unknown、またはphraseが無い場合。データがあるかどうかで文言を変える。
    text = showLanes ? '' : '車線情報を取得できません';
  }

  const lanesHtml = showLanes ? renderLanes(lanesRaw, advice?.recommendedLanes ?? []) : '';
  return { text, lanesHtml, confidence };
}
