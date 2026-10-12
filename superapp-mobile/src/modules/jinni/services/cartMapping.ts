/**
 * Pure mapping from Jinni's proposed items to cart-store line items.
 *
 * Extracted out of useJinniSession.ts::confirmAddToCart so the grouping
 * logic (only available, qty > 0 items; single module/source per cart
 * add) can be unit tested without rendering a hook or touching
 * zustand/React — Prompt.txt F asks for "cart operations" test
 * coverage, and this is the part of that flow that's actual logic
 * rather than store plumbing. The existing cart store
 * (addItem/forceAddItem) is untouched — no duplicate cart
 * implementation, per Prompt.txt C.
 */
import type { ProposedItem } from '../types';

export interface CartLine {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  unit?: string;
}

export interface CartLineMeta {
  restaurantId?: string;
  restaurantName?: string;
}

export interface BuiltCartLines {
  moduleType: 'food' | 'grocery';
  lines: Array<{ line: CartLine; meta: CartLineMeta }>;
}

/**
 * Filters to available, qty>0 items and maps them to cart-store line
 * shape, tagged with the module type of the *first* available item
 * (mirrors the "one restaurant/store per wish" rule already enforced
 * server-side in search_service.py — by the time items reach here they
 * should already share one module + one source, this just reads that
 * off the first line rather than re-deriving it).
 *
 * Returns null when there's nothing available to add.
 */
export function buildCartLines(proposedItems: ProposedItem[]): BuiltCartLines | null {
  const available = proposedItems.filter((i) => i.available && i.quantity > 0);
  if (available.length === 0) return null;

  const moduleType = available[0].moduleType;
  const lines = available.map((item) => ({
    line: {
      id: item.productId || item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      imageUrl: item.imageUrl,
      unit: item.unit,
    },
    meta: {
      restaurantId: item.restaurantId,
      restaurantName: item.restaurantName,
    },
  }));

  return { moduleType, lines };
}

export default buildCartLines;
