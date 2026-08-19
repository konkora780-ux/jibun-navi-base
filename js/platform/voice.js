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
