import { useCallback, useEffect, useState } from 'react';
import { SPEECH_LANG } from '../lib/format.js';

export const speechSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

/** Read text aloud with the browser's built-in voices. Stops on unmount. */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (speechSupported()) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, language: string) => {
      if (!speechSupported()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = SPEECH_LANG[language] ?? 'en-IN';
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  useEffect(() => stop, [stop]);
  return { speaking, speak, stop, supported: speechSupported() };
}
