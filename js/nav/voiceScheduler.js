/**
 * nav/voiceScheduler.js — 通常の右左折案内とSmartLane案内の発話タイミングを管理する
 *
 * 純粋な判定（core/voiceDecision.js）を呼び、「今回新たに発話すべきか」が
 * 決まったら実際にspeak()する。この層の責務：
 *   - 現在のmaneuverごとに「どの距離段階を発話済みか」を保持する
 *   - maneuverが変わった（次のstepへ進んだ）ら発話済み状態をリセットする
 *   - 再ルート時・ナビ開始時も発話済み状態をリセットする
 *   - ナビ終了後(stop)は発話しない
 *   - 新しい案内が来たら、古い発話をcancelSpeechで破棄してから発話する
 *     （直前の案内など、新しいものを常に優先する）
 */
import { decideDistanceAnnouncement, composeAnnouncementText } from '../core/voiceDecision.js';
import { speak, cancelSpeech } from '../platform/voice.js';

export function createVoiceScheduler() {
  let announcedKeys = new Set();
  let currentManeuverSignature = null;
  let active = true;

  function resetForNewManeuver(signature) {
    if (signature !== currentManeuverSignature) {
      announcedKeys = new Set();
      currentManeuverSignature = signature;
    }
  }

  return {
    /** ナビ終了時に呼ぶ。以後、update()を呼んでも発話しなくなる。 */
    stop() {
      active = false;
    },

    /** ナビ開始時・再ルート時に呼ぶ。発話済み状態を全てリセットする。 */
    reset() {
      announcedKeys = new Set();
      currentManeuverSignature = null;
      active = true;
    },

    /**
     * @param {{maneuverSignature:string, distanceToManeuverM:number, roadClass:string,
     *          speedMPS:number|null, roadName:string|null, maneuver:object|null,
     *          smartLanePhrase:string|null, smartLaneConfidence:string|null}} state
     * @returns {string|null} 発話したテキスト（発話しなかった場合はnull）
     */
    update(state) {
      if (!active) return null;

      resetForNewManeuver(state.maneuverSignature);

      const decision = decideDistanceAnnouncement({
        distanceToManeuverM: state.distanceToManeuverM,
        roadClass: state.roadClass,
        speedMPS: state.speedMPS,
        announcedKeys
      });
      if (!decision) return null;

      announcedKeys.add(decision.key);

      const text = composeAnnouncementText({
        thresholdKey: decision.key,
        distanceM: decision.distanceM,
        roadName: state.roadName,
        maneuver: state.maneuver,
        smartLanePhrase: state.smartLanePhrase,
        smartLaneConfidence: state.smartLaneConfidence
      });

      cancelSpeech();
      speak(text);
      return text;
    }
  };
}
