/**
 * Chirag session + Jinni AI commerce types.
 */
export type ChiragScene =
  | 'idle'
  | 'tap'
  | 'summoning'
  | 'arriving'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'results'
  | 'success'
  | 'dismissing'
  | 'exhausted';

export interface JinniContext {
  source: 'tabBar' | 'foodOrderWithJinni' | 'homeNudge';
  restaurantId?: string;
  restaurantName?: string;
}

export interface WishStatus {
  used: number;
  limit: number;
  resetsAt: string | null;
}

export interface TranscriptTurn {
  id: string;
  role: 'user' | 'chirag';
  text: string;
}

export type JinniIntent = 'food_search' | 'grocery_search' | 'order_status' | 'unknown';

export interface ProposedItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
  imageUrl?: string;
  available: boolean;
  unavailableReason?: string;
  moduleType: 'food' | 'grocery';
  restaurantId?: string;
  restaurantName?: string;
  productId?: string;
}

export interface InterpretResult {
  intent: JinniIntent;
  query: string;
  items: ProposedItem[];
  message: string;
  partial: boolean;
  empty: boolean;
}
