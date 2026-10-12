import { createStore } from '@store/useStore';
import { api } from '@services/api';

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string[];
  cuisines: string[];
  rating: number;
  rating_avg: number;
  rating_count: number;
  deliveryTime: string;
  delivery_time_estimate?: string;
  deliveryFee: number;
  delivery_fee: number;
  minOrder: number;
  min_order_amount: number;
  imageUrl?: string;
  logo_url?: string;
  cover_image_url?: string;
  isOpen: boolean;
  is_open: boolean;
  is_accepting_orders?: boolean;
  pure_veg?: boolean;
  discount?: string;
  distance_km?: number;
  pincode?: string;
  city?: string;
  free_delivery_above?: number;
  packaging_fee?: number;
  /** Set when this restaurant matched the search by a dish/menu-item name
   * rather than its own name (e.g. searching "burger" surfaces Spice Hub). */
  matchedDish?: string;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  restaurant_id?: string;
  name: string;
  description: string;
  price: number;
  effective_price?: number;
  discounted_price?: number;
  isVeg: boolean;
  is_veg?: boolean;
  isAvailable: boolean;
  is_available?: boolean;
  category: string;
  category_id?: string;
  imageUrl?: string;
  image_url?: string;
  is_bestseller?: boolean;
  option_groups?: any[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  items: MenuItem[];
}

interface FoodState {
  restaurants: Restaurant[];
  selectedRestaurant: Restaurant | null;
  categories: MenuCategory[];
  menuItems: MenuItem[];
  activeOrder: any | null;
  isLoading: boolean;
  error: string | null;
  totalRestaurants: number;
}

interface FoodActions {
  fetchRestaurants: (params?: {
    lat?: number;
    lng?: number;
    pincode?: string;
    cuisine?: string;
    pure_veg?: boolean;
    search?: string;
    sort_by?: string;
  }) => Promise<void>;
  fetchRestaurant: (restaurantId: string) => Promise<void>;
  fetchMenu: (restaurantId: string, opts?: { veg_only?: boolean }) => Promise<void>;
  selectRestaurant: (restaurant: Restaurant | null) => void;
  fetchActiveOrder: (orderId: string) => Promise<void>;
  clearError: () => void;
}

const initialState: FoodState = {
  restaurants: [],
  selectedRestaurant: null,
  categories: [],
  menuItems: [],
  activeOrder: null,
  isLoading: false,
  error: null,
  totalRestaurants: 0,
};

function mapRestaurant(r: any): Restaurant {
  const cuisines = r.cuisines || r.cuisine || [];
  const rating = Number(r.rating_avg ?? r.rating ?? 0);
  const deliveryFee = Number(r.delivery_fee ?? r.deliveryFee ?? 0);
  const minOrder = Number(r.min_order_amount ?? r.minOrder ?? 0);
  const isOpen = Boolean(r.is_open ?? r.isOpen);
  return {
    id: r.id,
    name: r.name,
    cuisine: cuisines,
    cuisines,
    rating,
    rating_avg: rating,
    rating_count: r.rating_count ?? 0,
    deliveryTime: r.delivery_time_estimate || r.deliveryTime || `${r.avg_prep_minutes || 25} min`,
    delivery_time_estimate: r.delivery_time_estimate,
    deliveryFee,
    delivery_fee: deliveryFee,
    minOrder,
    min_order_amount: minOrder,
    imageUrl: r.cover_image_url || r.logo_url || r.imageUrl,
    logo_url: r.logo_url,
    cover_image_url: r.cover_image_url,
    isOpen,
    is_open: isOpen,
    is_accepting_orders: r.is_accepting_orders,
    pure_veg: r.pure_veg,
    distance_km: r.distance_km,
    pincode: r.pincode,
    city: r.city,
    free_delivery_above:
      r.free_delivery_above != null ? Number(r.free_delivery_above) : undefined,
    packaging_fee: r.packaging_fee != null ? Number(r.packaging_fee) : undefined,
    matchedDish: r.matched_dish || undefined,
  };
}

function mapMenuItem(i: any, categoryName = ''): MenuItem {
  return {
    id: i.id,
    restaurantId: i.restaurant_id || i.restaurantId,
    restaurant_id: i.restaurant_id,
    name: i.name,
    description: i.description || '',
    price: Number(i.effective_price ?? i.discounted_price ?? i.price ?? 0),
    effective_price: Number(i.effective_price ?? i.price ?? 0),
    discounted_price: i.discounted_price != null ? Number(i.discounted_price) : undefined,
    isVeg: Boolean(i.is_veg ?? i.isVeg),
    is_veg: Boolean(i.is_veg ?? i.isVeg),
    isAvailable: Boolean(i.is_available ?? i.isAvailable ?? true),
    is_available: Boolean(i.is_available ?? i.isAvailable ?? true),
    category: categoryName,
    category_id: i.category_id,
    imageUrl: i.image_url || i.imageUrl,
    image_url: i.image_url,
    is_bestseller: i.is_bestseller,
    option_groups: i.option_groups || [],
  };
}

export const useFoodStore = createStore<FoodState & FoodActions>('food-store', (set) => ({
  ...initialState,

  fetchRestaurants: async (params) => {
    try {
      set({ isLoading: true, error: null });
      // api.get() already returns response body (not AxiosResponse)
      const payload: any = await api.get('/food/restaurants', {
        params: {
          is_open: true,
          ...params,
        },
      });
      const rawList = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.restaurants)
          ? payload.restaurants
          : [];
      const list = rawList.map(mapRestaurant);
      set({
        restaurants: list,
        totalRestaurants: payload?.total ?? list.length,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      set({
        error:
          (typeof detail === 'string' ? detail : null) ||
          error.response?.data?.message ||
          'Failed to fetch restaurants',
        restaurants: [],
        isLoading: false,
      });
    }
  },

  fetchRestaurant: async (restaurantId: string) => {
    try {
      const data: any = await api.get(`/food/restaurants/${restaurantId}`);
      if (data) {
        set({ selectedRestaurant: mapRestaurant(data) });
      }
    } catch {
      /* non-fatal */
    }
  },

  fetchMenu: async (restaurantId: string, opts) => {
    try {
      set({ isLoading: true, error: null });
      const data: any = await api.get(`/food/restaurants/${restaurantId}/menu`, {
        params: { veg_only: opts?.veg_only || false },
      });
      if (data?.restaurant) {
        set({ selectedRestaurant: mapRestaurant(data.restaurant) });
      }
      const categories: MenuCategory[] = (data?.categories || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        items: (c.items || []).map((i: any) => mapMenuItem(i, c.name)),
      }));
      const flat = categories.flatMap((c) => c.items);
      const menuItems = flat.length
        ? flat
        : Array.isArray(data)
          ? data.map((i: any) => mapMenuItem(i))
          : Array.isArray(data?.items)
            ? data.items.map((i: any) => mapMenuItem(i))
            : [];
      set({ categories, menuItems, isLoading: false });
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      set({
        error:
          (typeof detail === 'string' ? detail : null) ||
          error.response?.data?.message ||
          'Failed to fetch menu',
        isLoading: false,
      });
    }
  },

  selectRestaurant: (restaurant) => {
    set({ selectedRestaurant: restaurant });
  },

  fetchActiveOrder: async (orderId: string) => {
    try {
      set({ isLoading: true, error: null });
      const data: any = await api.get(`/orders/${orderId}`);
      set({ activeOrder: data, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch order',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));

export default useFoodStore;
