import { useCallback, useEffect, useState } from 'react';
import { homeService, NearbyStore } from '@services/home.service';

export type NearbyStoresStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseNearbyStoresResult {
  stores: NearbyStore[];
  status: NearbyStoresStatus;
  error: string | null;
  refetch: () => void;
}

/**
 * Loads local/grocery stores for the active pincode.
 * - 'idle' when there's no pincode yet (caller should render the
 *   "choose location" state, not a spinner).
 * - A failure in this hook never throws into the caller; Home composes
 *   one hook per section so one failing section can't blank the screen.
 */
export function useNearbyStores(pincode: string): UseNearbyStoresResult {
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [status, setStatus] = useState<NearbyStoresStatus>(pincode ? 'loading' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const fetchStores = useCallback(async () => {
    if (!pincode || pincode.length !== 6) {
      setStatus('idle');
      setStores([]);
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const data = await homeService.getNearbyStores(pincode);
      setStores(data.stores ?? []);
      setStatus('success');
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Could not load nearby stores');
      setStatus('error');
    }
  }, [pincode, retryToken]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const refetch = useCallback(() => setRetryToken((t) => t + 1), []);

  return { stores, status, error, refetch };
}

export default useNearbyStores;
