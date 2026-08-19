/**
 * platform/voice.js — 音声案内
 * iOS Safariはユーザー操作起点でないと発話しない。
 * 「ナビ開始」ボタンのクリックハンドラの中で、await の前に同期的に unlockSpeech() を
 * 呼ぶことで、以降 speak() で発話できるようになる。
 */
let unlocked = false;

export function unlockSpeech() {
  if (unlocked || !('speechSynthesis' in window)) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  unlocked = true;
}

export function speak(text, { rate = 1.0 } = {}) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = rate;
  speechSynthesis.speak(utterance);
}

// 発話中・発話待ちのものを全て破棄する。新しい案内（直前の右左折・到着など）を
// 優先させたいときに、古い発話がキューに残り続けないよう先に呼ぶ。
export function cancelSpeech() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
