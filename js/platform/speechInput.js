/**
 * platform/speechInput.js — 音声検索（Web Speech API の SpeechRecognition）
 *
 * 【重要な既知の制約】iOS Safariでは、ホーム画面に追加した状態（PWA/standalone）だと
 * このAPIが正しく動作しないことが複数報告されている（Safari単体タブでは動くのに、
 * ホーム画面追加後は認識できない・マイクが止まらない等）。このアプリはホーム画面追加が
 * 前提の運用のため、実機で必ず動作確認すること。動かない場合はテキスト検索を使う
 * （main.js側は音声検索が失敗してもテキスト検索は独立して動くようにしてある）。
 */

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isSpeechInputSupported() {
  return getSpeechRecognitionCtor() !== null;
}

/**
 * @param {{onResult:(text:string)=>void, onError:(reasonCode:string, debugMessage:string)=>void, onStart?:()=>void, onEnd?:()=>void}} handlers
 *   onErrorの第1引数(reasonCode)は 'unsupported' または SpeechRecognitionErrorEvent.error 相当の
 *   コード（例：'not-allowed' 'no-speech' 'network'）。利用者向け文言への変換は
 *   core/connectivityMessages.js の describeVoiceSearchError() が行う（ここでは技術的な
 *   コードのまま渡すだけにする）。第2引数はDEBUG表示用の技術的な文字列。
 * @returns {boolean} 開始できたか
 */
export function startVoiceSearch({ onResult, onError, onStart, onEnd }) {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    onError('unsupported', 'この端末・ブラウザは音声検索に対応していません');
    return false;
  }

  const recognition = new Ctor();
  recognition.lang = 'ja-JP';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => onStart?.();
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };
  recognition.onerror = (event) => {
    onError(event.error, `音声認識エラー: ${event.error}`);
  };
  recognition.onend = () => onEnd?.();

  try {
    recognition.start();
    return true;
  } catch (err) {
    onError('start-failed', `音声認識を開始できません: ${err.message}`);
    return false;
  }
}
