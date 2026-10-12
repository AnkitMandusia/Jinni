import { useCallback, useEffect, useState } from 'react';
import { homeService, NearbyRestaurant } from '@services/home.service';

export type NearbyRestaurantsStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseNearbyRestaurantsResult {
  restaurants: NearbyRestaurant[];
  status: NearbyRestaurantsStatus;
  error: string | null;
  refetch: () => void;
}

/**
 * Loads restaurants for the active pincode via GET /food/restaurants.
 * Mirrors useNearbyStores so Food and Mart/Local-Store discovery screens
 * share one consumption pattern. Not currently rendered on Home (no section
 * was requested for it there) — this is the frontend half of the
 * food-discovery backend work, ready for the Food module's own listing
 * screen to consume.
 */
export function useNearbyRestaurants(pincode: string): UseNearbyRestaurantsResult {
  const [restaurants, setRestaurants] = useState<NearbyRestaurant[]>([]);
  const [status, setStatus] = useState<NearbyRestaurantsStatus>(pincode ? 'loading' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const fetchRestaurants = useCallback(async () => {
    if (!pincode || pincode.length !== 6) {
      setStatus('idle');
      setRestaurants([]);
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const data = await homeService.getNearbyRestaurants(pincode);
      setRestaurants(data.restaurants ?? []);
      setStatus('success');
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Could not load nearby restaurants');
      setStatus('error');
    }
  }, [pincode, retryToken]);

  useEffect(() => {
    fetchRestaurants();
  }, [fetchRestaurants]);

  const refetch = useCallback(() => setRetryToken((t) => t + 1), []);

  return { restaurants, status, error, refetch };
}

export default useNearbyRestaurants;
