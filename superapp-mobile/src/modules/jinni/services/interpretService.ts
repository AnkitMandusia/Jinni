/**
 * Wish interpretation — Prompt.txt section C.
 *
 * Hard-coded demo catalogs (FOOD_BY_RESTAURANT / GROCERY_CATALOG) have
 * been removed from the production path per Prompt.txt section C
 * ("Remove hard-coded demo products and restaurants from the
 * production search path in both mobile and backend code"). All
 * results now come from the real backend (`/jinni/interpret`), which
 * itself only ever returns rows read from the live `products` /
 * `menu_items` tables — see superapp-backend/app/modules/jinni/search_service.py.
 *
 * JinniIntentFinder runs locally first purely to decide whether the
 * request looks unambiguous enough to skip asking the backend to pay
 * for a Gemini fallback. The server always re-checks confidence itself
 * before spending budget (defense in depth), so this local pass is a
 * latency/UX optimization, never a source of truth for what exists.
 */
import { InterpretResult, ProposedItem } from '../types';
import { getPhrase } from './jinniPhrases';
import { JinniIntentFinder, CONFIDENCE_THRESHOLD } from './intentFinder';
import { jinniService, BackendInterpretResponse } from './jinniService';

function toProposedItems(resp: BackendInterpretResponse): ProposedItem[] {
  // "do bread aur butter" -> quantity 2 applies to every resolved item,
  // not just the first. Clamped defensively even though the backend
  // already clamps it (1-50) — never trust a number as the sole gate
  // for a cart quantity field.
  const quantity = Math.max(1, Math.min(resp.quantity || 1, 50));
  return resp.items.map((i) => ({
    id: i.id,
    productId: i.product_id,
    name: i.name,
    price: i.price,
    quantity,
    unit: i.unit,
    imageUrl: i.image_url ?? undefined,
    available: i.available,
    unavailableReason: i.unavailable_reason ?? undefined,
    moduleType: i.module_type,
    restaurantId: i.restaurant_id,
    restaurantName: i.restaurant_name ?? undefined,
  }));
}

export async function interpretWish(
  rawText: string,
  opts?: { restaurantName?: string; sessionId?: string | null }
): Promise<InterpretResult> {
  const query = rawText.trim();
  if (!query) {
    return {
      intent: 'unknown',
      query,
      items: [],
      message: getPhrase('empty_items'),
      partial: false,
      empty: true,
    };
  }

  // Local-first pass: just for the confidence hint we send along, and so
  // the UI can react instantly for the common unambiguous case instead
  // of waiting on the network before showing a "thinking" state change.
  const local = JinniIntentFinder.matchIntent(query);

  try {
    const resp = await jinniService.interpret(query, {
      restaurantName: opts?.restaurantName,
      sessionId: opts?.sessionId,
      clientConfidence: local.confidence,
    });

    if (resp.intent === 'order_status') {
      return {
        intent: 'order_status',
        query,
        items: [],
        message: resp.message,
        partial: false,
        empty: true,
      };
    }

    return {
      intent: resp.intent === 'unknown' ? 'unknown' : (resp.intent as InterpretResult['intent']),
      query,
      items: toProposedItems(resp),
      message: resp.message,
      partial: resp.partial,
      empty: resp.empty,
    };
  } catch {
    // Network / backend unavailable. Local confidence alone is not proof
    // a product exists (Prompt.txt C), so when we can't reach the real
    // database we surface a clarification rather than guessing — never
    // fabricate items from the local keyword match.
    const message =
      local.confidence >= CONFIDENCE_THRESHOLD
        ? getPhrase('error')
        : getPhrase('empty_items');
    return {
      intent: 'unknown',
      query,
      items: [],
      message,
      partial: false,
      empty: true,
    };
  }
}

export default interpretWish;
