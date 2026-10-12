import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Free, on-device speech-to-text for the Jinni mic button.
 *
 * Uses `expo-speech-recognition`, which wraps the native OS speech
 * recognizer (Android SpeechRecognizer / iOS SFSpeechRecognizer) — no
 * cloud API, no per-call cost, works fully offline on most Android
 * devices. Requires a custom dev build (does NOT work inside Expo Go,
 * since it's a native module) — see JINNI_IMPLEMENTED.md "voice input"
 * section for the one-line build command.
 *
 * If the native module isn't available (e.g. still running in Expo Go,
 * or web), `supported` is false and the UI should fall back to
 * typed-only input instead of silently doing nothing.
 */

type VoiceState = 'idle' | 'listening' | 'processing' | 'error';

interface UseVoiceInputResult {
  supported: boolean;
  state: VoiceState;
  partialText: string;
  start: () => Promise<void>;
  stop: () => void;
  error: string | null;
}

export function useVoiceInput(
  onFinalResult: (text: string) => void
): UseVoiceInputResult {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');
  const [partialText, setPartialText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const moduleRef = useRef<any>(null);
  const listenersRef = useRef<any[]>([]);
  // Duplicate-transcript guard: some Android OEM recognizers emit the
  // same final `result` event twice in quick succession. Without this,
  // submitWish() (and therefore a Jinni wish + a Gemini/DB round trip)
  // could fire twice for one spoken sentence.
  const lastFinalRef = useRef<{ text: string; at: number } | null>(null);
  const DUPLICATE_WINDOW_MS = 1200;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Lazy require so the app doesn't crash on platforms / Expo Go
        // builds where the native module isn't compiled in.
        const mod = await import('expo-speech-recognition');
        if (!mounted) return;
        moduleRef.current = mod;
        setSupported(true);
      } catch {
        if (mounted) setSupported(false);
      }
    })();
    return () => {
      mounted = false;
      listenersRef.current.forEach((l) => l?.remove?.());
      listenersRef.current = [];
      try {
        moduleRef.current?.ExpoSpeechRecognitionModule?.stop();
      } catch {
        /* */
      }
    };
  }, []);

  const start = useCallback(async () => {
    const mod = moduleRef.current;
    if (!mod) {
      setError('voice_unavailable');
      setState('error');
      return;
    }
    const { ExpoSpeechRecognitionModule } = mod;
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('permission_denied');
        setState('error');
        return;
      }
    } catch {
      setError('permission_denied');
      setState('error');
      return;
    }

    setPartialText('');
    setError(null);
    setState('listening');
    lastFinalRef.current = null;

    listenersRef.current.forEach((l) => l?.remove?.());
    listenersRef.current = [];

    listenersRef.current.push(
      ExpoSpeechRecognitionModule.addListener('result', (ev: any) => {
        const text = ev?.results?.[0]?.transcript ?? '';
        setPartialText(text);
        if (ev?.isFinal && text.trim()) {
          const finalText = text.trim();
          const now = Date.now();
          const last = lastFinalRef.current;
          if (last && last.text === finalText && now - last.at < DUPLICATE_WINDOW_MS) {
            return; // duplicate final event for the same utterance — ignore
          }
          lastFinalRef.current = { text: finalText, at: now };
          setState('processing');
          onFinalResult(finalText);
        }
      })
    );
    listenersRef.current.push(
      ExpoSpeechRecognitionModule.addListener('error', (ev: any) => {
        setError(ev?.error || 'recognition_error');
        setState('error');
      })
    );
    listenersRef.current.push(
      ExpoSpeechRecognitionModule.addListener('end', () => {
        setState((prev) => (prev === 'listening' ? 'idle' : prev));
      })
    );

    const tryStart = (lang: string) => {
      try {
        ExpoSpeechRecognitionModule.start({
          lang,
          interimResults: true,
          continuous: false,
          androidIntentOptions:
            Platform.OS === 'android'
              ? { EXTRA_LANGUAGE_MODEL: 'free_form' }
              : undefined,
        });
      } catch {
        if (lang !== 'en-IN') {
          tryStart('en-IN'); // device may not ship a hi-IN recognition model
        } else {
          setError('start_failed');
          setState('error');
        }
      }
    };
    tryStart('hi-IN');
  }, [onFinalResult]);

  const stop = useCallback(() => {
    const mod = moduleRef.current;
    try {
      mod?.ExpoSpeechRecognitionModule?.stop();
    } catch {
      /* */
    }
    setState('idle');
  }, []);

  return { supported, state, partialText, start, stop, error };
}

export default useVoiceInput;
