const mockPlayers: Array<{ play: jest.Mock; pause: jest.Mock; remove: jest.Mock }> = [];

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => {
    const player = { play: jest.fn(), pause: jest.fn(), remove: jest.fn() };
    mockPlayers.push(player);
    return player;
  }),
}));

import { playBundledAudio, stopBundledAudio } from '../audioPlayer';

describe('audioPlayer', () => {
  beforeEach(() => {
    mockPlayers.length = 0;
    jest.clearAllMocks();
    jest.useFakeTimers();
    stopBundledAudio();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('plays a bundled asset', () => {
    const played = playBundledAudio(1, 'greeting_1');
    expect(played).toBe(true);
    expect(mockPlayers).toHaveLength(1);
    expect(mockPlayers[0].play).toHaveBeenCalledTimes(1);
  });

  it('de-dupes the same phrase id replayed immediately (rerender guard)', () => {
    playBundledAudio(1, 'greeting_1');
    const secondCallPlayed = playBundledAudio(1, 'greeting_1');
    expect(secondCallPlayed).toBe(false);
    // Only the first call should have actually created/played a sound.
    expect(mockPlayers).toHaveLength(1);
  });

  it('allows a forced replay of the same phrase id', () => {
    playBundledAudio(1, 'greeting_1');
    const forced = playBundledAudio(1, 'greeting_1', { force: true });
    expect(forced).toBe(true);
    expect(mockPlayers).toHaveLength(2);
  });

  it('allows the same phrase id again after the dedupe window passes', () => {
    playBundledAudio(1, 'greeting_1');
    jest.advanceTimersByTime(500);
    const playedAgain = playBundledAudio(1, 'greeting_1');
    expect(playedAgain).toBe(true);
    expect(mockPlayers).toHaveLength(2);
  });

  it('stops the previous clip before starting a new, different one (no overlap)', () => {
    playBundledAudio(1, 'thinking');
    playBundledAudio(2, 'found_items');
    expect(mockPlayers[0].pause).toHaveBeenCalledTimes(1);
    expect(mockPlayers[0].remove).toHaveBeenCalledTimes(1);
    expect(mockPlayers[1].play).toHaveBeenCalledTimes(1);
  });

  it('does not throw if the underlying player fails to create, and reports failure', () => {
    const { createAudioPlayer } = require('expo-audio');
    (createAudioPlayer as jest.Mock).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    let played: boolean | undefined;
    expect(() => {
      played = playBundledAudio(1, 'error', { force: true });
    }).not.toThrow();
    expect(played).toBe(false);
  });
});
