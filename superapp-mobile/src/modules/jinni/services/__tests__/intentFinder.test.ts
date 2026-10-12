import { matchIntent, CONFIDENCE_THRESHOLD } from '../intentFinder';

describe('JinniIntentFinder', () => {
  it('recognizes exact grocery keywords with high confidence', () => {
    const m = matchIntent('doodh aur bread');
    expect(m.intent).toBe('grocery_search');
    expect(m.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(m.keywords).toEqual(expect.arrayContaining(['milk', 'bread']));
  });

  it('recognizes food keywords and extracts quantity', () => {
    const m = matchIntent('ek pizza bhej do');
    expect(m.intent).toBe('food_search');
    expect(m.keywords).toContain('pizza');
    expect(m.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(m.quantity).toBe(1);
  });

  it('recognizes a known brand name', () => {
    const m = matchIntent('amul doodh chahiye');
    expect(m.intent).toBe('grocery_search');
    expect(m.keywords).toEqual(expect.arrayContaining(['amul', 'milk']));
  });

  it('extracts size/variant words', () => {
    const m = matchIntent('bada pizza chahiye');
    expect(m.variant).toBe('large');
  });

  it('extracts digit quantities and clamps them', () => {
    const m = matchIntent('3 burger bhej do');
    expect(m.quantity).toBe(3);
    const clamped = matchIntent('999 burger bhej do');
    expect(clamped.quantity).toBeLessThanOrEqual(50);
  });

  it('keeps a single fuzzy spelling-mistake match below the confidence threshold', () => {
    // "berger" is one substitution away from "burger" and not itself a
    // listed transliteration — should be recognized but stay cautious.
    const m = matchIntent('berger');
    expect(m.keywords).toEqual(['burger']);
    expect(m.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('treats unrecognized gibberish as low-confidence unknown', () => {
    const m = matchIntent('asdkj qwlek');
    expect(m.intent).toBe('unknown');
    expect(m.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(m.keywords).toEqual([]);
  });

  it('detects an order-status request', () => {
    const m = matchIntent('mera order kahan hai');
    expect(m.intent).toBe('order_status');
    expect(m.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('detects a cart command', () => {
    const m = matchIntent('cart se hatao');
    expect(m.intent).toBe('cart_command');
  });

  it('recognizes "paneer" alone instead of leaving it unknown', () => {
    // Regression: used to fall through to "thoda clearly bolo" because
    // paneer wasn't in the dictionary at all.
    const m = matchIntent('paneer');
    expect(m.keywords).toContain('paneer');
    expect(m.intent).not.toBe('unknown');
  });

  it('keeps every recognized word from a dish name, even a grocery-sounding one', () => {
    const m = matchIntent('paneer butter masala');
    expect(m.keywords).toEqual(expect.arrayContaining(['paneer', 'butter', 'masala']));
  });

  it('returns a zero-confidence unknown match for empty input', () => {
    const m = matchIntent('   ');
    expect(m.intent).toBe('unknown');
    expect(m.confidence).toBe(0);
  });
});
