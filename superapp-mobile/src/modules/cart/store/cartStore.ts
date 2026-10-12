import { createPersistedStore } from '@store/useStore';
import { ModuleType } from '../../moduleRegistry';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  unit?: string;
  isVeg?: boolean;
  optionIds?: string[];
  optionLabels?: string[];
  /** food | grocery — for unified cart sections */
  moduleType?: ModuleType;
  /** Restaurant or store id */
  sourceId?: string;
  /** Restaurant or store display name */
  sourceName?: string;
}

interface CartState {
  items: CartItem[];
  /** @deprecated prefer per-item moduleType; kept for checkout routing */
  moduleType: ModuleType | null;
  restaurantId?: string;
  restaurantName?: string;
  categoryId?: string;
}

export type AddItemResult =
  | { ok: true }
  | {
      ok: false;
      needsConfirm: true;
      currentRestaurantName: string;
      newRestaurantName: string;
    };

interface CartActions {
  addItem: (
    item: CartItem,
    moduleType: ModuleType,
    meta?: { restaurantId?: string; restaurantName?: string; categoryId?: string }
  ) => AddItemResult;
  forceAddItem: (
    item: CartItem,
    moduleType: ModuleType,
    meta?: { restaurantId?: string; restaurantName?: string; categoryId?: string }
  ) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  clearSource: (sourceId: string) => void;
  clearModule: (moduleType: ModuleType) => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
  getFoodTotal: () => number;
  getGroceryTotal: () => number;
  canAddItem: (newModuleType: ModuleType) => boolean;
}

const initialState: CartState = {
  items: [],
  moduleType: null,
};

function withSource(
  item: CartItem,
  moduleType: ModuleType,
  meta?: { restaurantId?: string; restaurantName?: string }
): CartItem {
  return {
    ...item,
    moduleType,
    sourceId: meta?.restaurantId || item.sourceId,
    sourceName: meta?.restaurantName || item.sourceName,
  };
}

export const useCartStore = createPersistedStore<CartState & CartActions>(
  'cart-store',
  initialState,
  (set, get) => ({
    addItem: (item, moduleType, meta) => {
      const state = get();
      const enriched = withSource(item, moduleType, meta);
      const sourceId = enriched.sourceId;

      // Same vertical, different restaurant/store → require confirm (caller may force)
      if (
        sourceId &&
        state.items.some(
          (i) =>
            i.moduleType === moduleType &&
            i.sourceId &&
            i.sourceId !== sourceId
        )
      ) {
        const current =
          state.items.find((i) => i.moduleType === moduleType)?.sourceName ||
          'previous';
        return {
          ok: false,
          needsConfirm: true,
          currentRestaurantName: current,
          newRestaurantName: enriched.sourceName || 'new',
        };
      }

      const incomingOptions = [...(item.optionIds || [])].sort().join('|');
      const existing = state.items.find(
        (i) =>
          i.id === item.id &&
          [...(i.optionIds || [])].sort().join('|') === incomingOptions
      );

      if (existing) {
        set({
          items: state.items.map((i) =>
            i.id === existing.id
              ? { ...i, quantity: i.quantity + item.quantity }
              : i
          ),
          moduleType: state.moduleType || moduleType,
          restaurantId: meta?.restaurantId ?? state.restaurantId,
          restaurantName: meta?.restaurantName ?? state.restaurantName,
        });
      } else {
        set({
          items: [...state.items, enriched],
          moduleType: state.moduleType || moduleType,
          restaurantId: meta?.restaurantId ?? state.restaurantId,
          restaurantName: meta?.restaurantName ?? state.restaurantName,
          categoryId: meta?.categoryId ?? state.categoryId,
        });
      }
      return { ok: true };
    },

    forceAddItem: (item, moduleType, meta) => {
      const enriched = withSource(item, moduleType, meta);
      // Replace all items of this module with the new source item; keep other modules
      const withoutModule = get().items.filter((i) => i.moduleType !== moduleType);
      set({
        items: [...withoutModule, enriched],
        moduleType: get().items.some((i) => i.moduleType && i.moduleType !== moduleType)
          ? get().moduleType
          : moduleType,
        restaurantId: moduleType === 'food' ? meta?.restaurantId : get().restaurantId,
        restaurantName: moduleType === 'food' ? meta?.restaurantName : get().restaurantName,
        categoryId: meta?.categoryId,
      });
    },

    removeItem: (itemId) => {
      const items = get().items.filter((i) => i.id !== itemId);
      set({
        items,
        moduleType: items[0]?.moduleType ?? null,
        restaurantId: items[0]?.sourceId,
        restaurantName: items[0]?.sourceName,
      });
    },

    updateQuantity: (itemId, quantity) => {
      if (quantity <= 0) {
        get().removeItem(itemId);
        return;
      }
      set({
        items: get().items.map((i) =>
          i.id === itemId ? { ...i, quantity } : i
        ),
      });
    },

    clearCart: () =>
      set({
        items: [],
        moduleType: null,
        restaurantId: undefined,
        restaurantName: undefined,
        categoryId: undefined,
      }),

    clearSource: (sourceId) => {
      const items = get().items.filter((i) => i.sourceId !== sourceId);
      set({
        items,
        moduleType: items[0]?.moduleType ?? null,
        restaurantId: items[0]?.sourceId,
        restaurantName: items[0]?.sourceName,
      });
    },

    clearModule: (moduleType) => {
      const items = get().items.filter((i) => i.moduleType !== moduleType);
      set({
        items,
        moduleType: items[0]?.moduleType ?? null,
        restaurantId: items[0]?.sourceId,
        restaurantName: items[0]?.sourceName,
      });
    },

    getTotalItems: () => get().items.reduce((s, i) => s + i.quantity, 0),
    getTotalPrice: () =>
      get().items.reduce((s, i) => s + i.price * i.quantity, 0),
    getFoodTotal: () =>
      get()
        .items.filter((i) => i.moduleType === 'food')
        .reduce((s, i) => s + i.price * i.quantity, 0),
    getGroceryTotal: () =>
      get()
        .items.filter((i) => i.moduleType === 'grocery')
        .reduce((s, i) => s + i.price * i.quantity, 0),
    canAddItem: () => true,
  })
);
