jest.mock('../phraseRegistry.generated', () => ({
  PHRASE_AUDIO_REGISTRY: {
    greeting_1: [12345], // fake Metro asset id — enough to prove "registered" lookup works
    thinking: [111, 222, 333], // multiple clips — proves random-pick stays within the set
  },
}));

import { getPhraseAudioAsset, hasPhraseAudio } from '../phraseRegistry';

describe('phraseRegistry', () => {
  it('resolves a registered phrase with one clip to its bundled asset id', () => {
    expect(getPhraseAudioAsset('greeting_1' as any)).toBe(12345);
    expect(hasPhraseAudio('greeting_1' as any)).toBe(true);
  });

  it('picks one of several registered clips, never outside the set', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      seen.add(getPhraseAudioAsset('thinking' as any) as number);
    }
    for (const v of seen) {
      expect([111, 222, 333]).toContain(v);
    }
  });

  it('returns null (not throw) for a phrase with no WAV registered yet', () => {
    expect(() => getPhraseAudioAsset('empty_items' as any)).not.toThrow();
    expect(getPhraseAudioAsset('empty_items' as any)).toBeNull();
    expect(hasPhraseAudio('empty_items' as any)).toBe(false);
  });

  it('returns null for a completely unknown phrase id rather than throwing', () => {
    expect(getPhraseAudioAsset('does_not_exist' as any)).toBeNull();
  });
});
