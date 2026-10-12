/**
 * JinniIntentFinder — local-first intent + keyword extraction.
 * Prompt.txt section C.
 *
 * This is a *routing* decision only: it decides whether the app can
 * skip the network round trip's Gemini step, not whether a product
 * exists. The backend (app/modules/jinni/intent_matcher.py) recomputes
 * confidence itself before spending any Gemini budget — this client
 * copy is a UX optimization (snappier "thinking" vs "let me think
 * harder" state) and a hint sent as `client_confidence`, never trusted
 * on its own for budget decisions.
 *
 * Mirrors the backend matcher's vocabulary so the two rarely disagree,
 * but they're independent implementations on purpose (defense in depth
 * — see search_service.py / router.py on the backend).
 */
import { JinniIntent } from '../types';

export const CONFIDENCE_THRESHOLD = 0.7;

export interface IntentMatch {
  intent: JinniIntent | 'cart_command';
  confidence: number;
  keywords: string[];
  quantity: number | null;
  variant: string | null;
}

const TRANSLITERATIONS: Record<string, string> = {
  doodh: 'milk', dood: 'milk', milk: 'milk',
  pizaa: 'pizza', piza: 'pizza', pizza: 'pizza',
  burgar: 'burger', burger: 'burger',
  biriyani: 'biryani', briyani: 'biryani', biryani: 'biryani',
  chai: 'tea', chay: 'tea', tea: 'tea',
  aata: 'atta', flour: 'atta', atta: 'atta',
  makhan: 'butter', butter: 'butter',
  maggie: 'maggi', maggi: 'maggi', noodles: 'maggi',
  dawai: 'medicine', medicine: 'medicine', crocin: 'paracetamol', paracetamol: 'paracetamol',
  pav: 'bread', roti: 'bread', bread: 'bread',
  // Common Indian grocery brand names (Prompt.txt C: "product brands").
  // Extensible — add an entry here to recognize a new brand; it's picked
  // up by both the exact and 1-edit-distance fuzzy paths automatically.
  // Kept in sync with intent_matcher.py's _TRANSLITERATIONS.
  amul: 'amul', britannia: 'britannia', britania: 'britannia',
  parle: 'parle', parleg: 'parle', lays: 'lays', leys: 'lays',
  pepsi: 'pepsi', cocacola: 'coca-cola', coke: 'coca-cola',
  nescafe: 'nescafe', dettol: 'dettol', colgate: 'colgate',
  surfexcel: 'surf excel', tide: 'tide', haldiram: 'haldiram',
  haldirams: 'haldiram', kissan: 'kissan', mdh: 'mdh',
  // Common kitchen staples / dish-name building blocks (kept in sync
  // with intent_matcher.py — see its comment for why this is small on
  // purpose; search_both() on the backend always also tries the full
  // raw phrase so a missing word here isn't fatal).
  paneer: 'paneer', panner: 'paneer', masala: 'masala',
  dahi: 'curd', curd: 'curd', anda: 'egg', egg: 'egg',
  chicken: 'chicken', mutton: 'mutton', sabzi: 'sabzi',
  aloo: 'aloo', pyaz: 'onion', onion: 'onion',
  tamatar: 'tomato', tomato: 'tomato',
};

const GROCERY_HINTS = new Set([
  'milk', 'bread', 'atta', 'butter', 'maggi', 'medicine', 'paracetamol',
  'sugar', 'chini', 'namak', 'salt', 'chawal', 'rice', 'dal', 'oil', 'tel',
  'amul', 'britannia', 'parle', 'lays', 'pepsi', 'coca-cola', 'nescafe',
  'dettol', 'colgate', 'surf excel', 'tide', 'haldiram', 'kissan', 'mdh',
  'paneer', 'curd', 'egg', 'aloo', 'onion', 'tomato',
]);
const FOOD_HINTS = new Set([
  'pizza', 'burger', 'biryani', 'tea', 'fries', 'momos', 'noodles',
  'roll', 'sandwich', 'dosa', 'thali', 'paratha', 'masala', 'chicken',
  'mutton', 'sabzi',
]);
const CART_WORDS = new Set(['cart', 'add', 'hatao', 'remove', 'badlo', 'quantity', 'qty']);
const ORDER_WORDS = new Set(['order', 'track', 'kahan', 'status', 'kaha']);

const QTY_WORD_TO_NUM: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3,
  char: 4, four: 4, paanch: 5, panch: 5, five: 5,
};

// Size/variant words (Prompt.txt C: "variants"). Recognized and surfaced
// on the match (IntentMatch.variant) for future use once products carry
// structured variant data — not yet used to filter search results (a
// product named "Amul Butter" rarely contains "chota" in its title).
const VARIANT_WORDS: Record<string, string> = {
  chota: 'small', choti: 'small', small: 'small',
  bada: 'large', badi: 'large', large: 'large', big: 'large',
  medium: 'medium', family: 'family_pack', jumbo: 'large',
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0900-\u097F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Edit distance <= 1 check (cheap spelling-mistake tolerance for short tokens). */
function levenshteinLE1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...new Array(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n] <= 1;
}

function extractQuantity(tokens: string[]): number | null {
  for (const t of tokens) {
    if (/^\d+$/.test(t)) return Math.max(1, Math.min(parseInt(t, 10), 50));
    if (t in QTY_WORD_TO_NUM) return QTY_WORD_TO_NUM[t];
  }
  return null;
}

function extractVariant(tokens: string[]): string | null {
  for (const t of tokens) {
    if (t in VARIANT_WORDS) return VARIANT_WORDS[t];
  }
  return null;
}

export function matchIntent(rawText: string): IntentMatch {
  const text = normalize(rawText);
  if (!text) return { intent: 'unknown', confidence: 0, keywords: [], quantity: null, variant: null };

  const tokens = text.split(' ');
  const quantity = extractQuantity(tokens);
  const variant = extractVariant(tokens);

  if (ORDER_WORDS.has('order') && text.includes('order') && (text.includes('kahan') || text.includes('status') || text.includes('kaha') || text.includes('track'))) {
    return { intent: 'order_status', confidence: 0.9, keywords: [], quantity, variant };
  }
  if (tokens.some((t) => CART_WORDS.has(t))) {
    return { intent: 'cart_command', confidence: 0.85, keywords: tokens, quantity, variant };
  }

  const hits: string[] = [];
  let exact = 0;
  let fuzzy = 0;
  for (const tok of tokens) {
    if (tok in TRANSLITERATIONS) {
      hits.push(TRANSLITERATIONS[tok]);
      exact += 1;
      continue;
    }
    let matched: string | null = null;
    for (const [key, canonical] of Object.entries(TRANSLITERATIONS)) {
      if (Math.abs(key.length - tok.length) <= 1 && levenshteinLE1(key, tok)) {
        matched = canonical;
        break;
      }
    }
    if (matched) {
      hits.push(matched);
      fuzzy += 1;
    }
  }

  const uniqueHits = Array.from(new Set(hits));

  if (uniqueHits.length === 0) {
    const confidence = tokens.length >= 2 ? 0.35 : 0.15;
    return { intent: 'unknown', confidence, keywords: [], quantity, variant };
  }

  const groceryScore = uniqueHits.filter((k) => GROCERY_HINTS.has(k)).length;
  const foodScore = uniqueHits.filter((k) => FOOD_HINTS.has(k)).length;
  const intent: JinniIntent = groceryScore >= foodScore ? 'grocery_search' : 'food_search';

  const base = (exact * 1.0 + fuzzy * 0.75) / Math.max(1, exact + fuzzy);
  const coverageBonus = Math.min(0.15, 0.05 * (uniqueHits.length - 1));
  let confidence = Math.min(0.99, base + coverageBonus);
  if (exact === 0 && fuzzy === 1) confidence = Math.min(confidence, 0.6);

  return { intent, confidence: Math.round(confidence * 100) / 100, keywords: uniqueHits, quantity, variant };
}

export const JinniIntentFinder = { matchIntent, CONFIDENCE_THRESHOLD };

export default JinniIntentFinder;
