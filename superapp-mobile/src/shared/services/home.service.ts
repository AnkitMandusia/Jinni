import { api } from './api';

export interface NearbyStore {
  id: string;
  store_name: string;
  owner_name: string;
  address: string;
  pincode: string;
  city: string;
  is_open: boolean;
  delivery_radius_km: number;
  latitude: number | null;
  longitude: number | null;
}

interface NearbyStoresResponse {
  stores: NearbyStore[];
  pincode: string;
  total: number;
}

export interface NearbyRestaurant {
  id: string;
  restaurant_name: string;
  owner_name: string;
  cuisine_type: string | null;
  address: string;
  pincode: string;
  city: string;
  is_open: boolean;
  latitude: number | null;
  longitude: number | null;
}

interface NearbyRestaurantsResponse {
  restaurants: NearbyRestaurant[];
  pincode: string;
  total: number;
}

/**
 * Home-tab data access. Kept separate from screen components so the UI never
 * talks to axios/endpoints directly (API -> service -> hook -> UI).
 */
export const homeService = {
  /** Local/grocery stores serving a pincode. GET /grocery/stores?pincode= */
  async getNearbyStores(pincode: string): Promise<NearbyStoresResponse> {
    return api.get<NearbyStoresResponse>('/grocery/stores', { params: { pincode } });
  },

  /**
   * Restaurants serving a pincode. GET /food/restaurants?pincode=
   * Backed by RestaurantProfile (role='restaurant', is_open=true) — same
   * query shape as grocery/stores. Returns real DB rows only, never mock data.
   */
  async getNearbyRestaurants(pincode: string): Promise<NearbyRestaurantsResponse> {
    return api.get<NearbyRestaurantsResponse>('/food/restaurants', { params: { pincode } });
  },
};

export default homeService;
