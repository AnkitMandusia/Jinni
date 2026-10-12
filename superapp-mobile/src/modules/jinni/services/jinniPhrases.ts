/**
 * Fixed Jinni / Chirag lines — no live TTS cost.
 * Play via expo-speech or pre-recorded assets/jinni/audio/{key}.mp3 later.
 */

export type PhraseKey =
  | 'greeting_1'
  | 'greeting_2'
  | 'greeting_3'
  | 'listening'
  | 'thinking'
  | 'found_items'
  | 'partial_items'
  | 'empty_items'
  | 'success_1'
  | 'success_2'
  | 'success_3'
  | 'exhausted'
  | 'cancel'
  | 'error';

const PHRASES: Record<PhraseKey, string> = {
  greeting_1: 'Bolo… kya chahiye? Aaj pehli wish bachi hai.',
  greeting_2: 'Dusri wish — bolo kya chahiye?',
  greeting_3: 'Aakhri wish aaj ki — soch ke bolo.',
  listening: 'Bolo… kya chahiye?',
  thinking: 'Main dhoondh kar laata hoon…',
  found_items: 'Yeh items mil gaye. Qty badlo ya hatao, phir Add to Cart dabao.',
  partial_items: 'Kuch mil gaya, kuch nahi. Jo mila woh neeche hai.',
  empty_items: 'Exact match nahi mila. Kuch aur try karo ya type karke bolo.',
  success_1: 'Pehli wish puri! Ab 2 wishes bachi hain.',
  success_2: 'Dusri wish ho gayi. 1 wish bachi hai.',
  success_3: 'Teenon wishes puri. Kal phir 3 nayi milengi.',
  exhausted: 'Aaj ki 3 wishes khatam. Kal subah reset hogi.',
  cancel: 'Theek hai, wish cancel — count nahi kata.',
  error: 'Abhi nahi ho paya. Phir se try karo.',
};

export function getPhrase(key: PhraseKey): string {
  return PHRASES[key];
}

/** Wish number 1–3 based on used count before this wish completes */
export function greetingKey(used: number): PhraseKey {
  if (used <= 0) return 'greeting_1';
  if (used === 1) return 'greeting_2';
  return 'greeting_3';
}

export function successKey(usedAfter: number): PhraseKey {
  if (usedAfter === 1) return 'success_1';
  if (usedAfter === 2) return 'success_2';
  return 'success_3';
}

export function wishLabel(used: number, limit: number): string {
  const remaining = Math.max(limit - used, 0);
  if (remaining <= 0) return '0/3 · kal phir';
  if (used === 0) return `1/${limit} · pehli wish`;
  if (used === 1) return `2/${limit} · dusri wish`;
  if (used === 2) return `3/${limit} · aakhri wish`;
  return `${remaining}/${limit}`;
}

export const QUICK_CHIPS = [
  { id: 'ration', label: 'Ghar ka ration', query: 'doodh bread maggi atta' },
  { id: 'medicine', label: 'Medicine mangwa do', query: 'paracetamol' },
  { id: 'hungry', label: 'Aaj kya khaye', query: 'burger' },
  { id: 'tea', label: 'Chai nashta', query: 'bread butter chai' },
] as const;

export default PHRASES;
