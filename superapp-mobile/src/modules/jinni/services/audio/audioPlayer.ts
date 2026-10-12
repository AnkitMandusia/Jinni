/**
 * Plays bundled Jinni WAV phrases via expo-audio.
 *
 * Requirements covered (Prompt.txt A/B):
 * - 7: preserves the WAV format, plays through the installed Expo audio
 *   player (expo-audio's createAudioPlayer — the maintained successor
 *   to expo-av's Audio.Sound on SDK 54).
 * - "ensure a single event does not play its WAV multiple times because
 *   of rerenders": playPhraseAudio() de-dupes same-id calls that land
 *   within DEDUPE_WINDOW_MS of each other unless `force` is passed, and
 *   always stops/releases the previous clip before starting a new one
 *   so two phrases never overlap.
 */
import { createAudioPlayer, AudioPlayer } from 'expo-audio';

const DEDUPE_WINDOW_MS = 400;

let activePlayer: AudioPlayer | null = null;
let lastPlayedId: string | null = null;
let lastPlayedAt = 0;

function releaseActivePlayer() {
  if (!activePlayer) return;
  try {
    activePlayer.pause();
    activePlayer.remove();
  } catch {
    /* already released */
  }
  activePlayer = null;
}

/**
 * Play a bundled WAV asset (the number returned by require(...) /
 * getPhraseAudioAsset). Returns true if playback was started, false if
 * it was skipped (missing asset, de-duped, or a player error) — callers
 * use the return value to decide whether to fall back to TTS.
 */
export function playBundledAudio(
  asset: number,
  dedupeKey: string,
  opts?: { force?: boolean }
): boolean {
  const now = Date.now();
  if (!opts?.force && dedupeKey === lastPlayedId && now - lastPlayedAt < DEDUPE_WINDOW_MS) {
    return false;
  }
  lastPlayedId = dedupeKey;
  lastPlayedAt = now;

  releaseActivePlayer();

  try {
    const player = createAudioPlayer(asset);
    activePlayer = player;
    player.play();
    return true;
  } catch {
    activePlayer = null;
    return false;
  }
}

export function stopBundledAudio(): void {
  releaseActivePlayer();
  lastPlayedId = null;
}

export default playBundledAudio;
