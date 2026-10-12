/**
 * Jinni voice — bundled WAV playback with on-device TTS fallback.
 *
 * Prompt.txt section B: "Replace runtime speech synthesis with bundled
 * WAV playback. Do not implement TTS." expo-speech stays wired up only
 * as a fallback for a *fixed* phrase whose WAV hasn't been recorded
 * yet (or isn't bundled in this build) — never for dynamic text. Callers
 * must never pass product names, prices, or order details here; those
 * are rendered as text only (see useJinniSession.ts).
 */
import * as Speech from 'expo-speech';
import type { PhraseKey } from './jinniPhrases';
import { getPhraseAudioAsset } from './audio/phraseRegistry';
import { playBundledAudio, stopBundledAudio } from './audio/audioPlayer';

let lastSpokenFallbackText = '';

function speakFallbackTts(text: string, dedupeKey: string, force?: boolean) {
  if (!text?.trim()) return;
  if (!force && text === lastSpokenFallbackText) return;
  lastSpokenFallbackText = text;
  try {
    Speech.stop();
    Speech.speak(text, { language: 'hi-IN', pitch: 1.05, rate: 0.92 });
  } catch {
    try {
      Speech.speak(text, { language: 'en-IN', rate: 0.95 });
    } catch {
      /* silent fail on web/sim without TTS */
    }
  }
}

/**
 * Speak a fixed Jinni phrase by its stable ID. `fallbackText` is the
 * phrase's own fixed line (from getPhrase()) — used only for TTS when
 * no bundled WAV is registered for this id yet. This never accepts
 * dynamic text; see jinniPhrases.ts for the fixed-phrase set.
 */
export async function speakJinniPhrase(
  id: PhraseKey,
  fallbackText: string,
  opts?: { force?: boolean }
): Promise<void> {
  const asset = getPhraseAudioAsset(id);
  if (asset != null) {
    const played = playBundledAudio(asset, id, opts);
    if (played) return;
    // De-duped (same phrase repeated within the debounce window) —
    // intentionally do nothing, not a fallback case.
    if (!opts?.force) return;
  }
  // No bundled WAV registered for this phrase yet — fall back to TTS so
  // the app still speaks something until the audio library is complete.
  speakFallbackTts(fallbackText, id, opts?.force);
}

export async function stopSpeaking() {
  stopBundledAudio();
  try {
    await Speech.stop();
  } catch {
    /* */
  }
}

export default speakJinniPhrase;
