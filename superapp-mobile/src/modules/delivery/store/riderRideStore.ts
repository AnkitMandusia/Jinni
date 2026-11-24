import { useEffect } from 'react';
import { AppState } from 'react-native';
import { createStore } from '@store/useStore';
import { rideService } from '@modules/cab/services/rideService';
import { Ride } from '@modules/cab/types';

interface RiderRideState {
  available: Ride[];
  active: Ride | null;
  busy: boolean;
  /** Rides switched off for this partner by admin — stop polling. */
  disabled: boolean;
  refresh: () => Promise<void>;
  drop: (id: string) => void;
}

export const useRiderRides = createStore<RiderRideState>('rider-rides', (set: any, get: any) => ({
  available: [],
  active: null,
  busy: false,
  disabled: false,
  refresh: async () => {
    if (get().disabled) return;
    try {
      const [a, act] = await Promise.all([rideService.riderAvailable(), rideService.riderActive()]);
      set({ available: a.rides, busy: a.busy, active: act.ride });
    } catch (e: any) {
      if (e?.response?.status === 403) set({ disabled: true, available: [], active: null });
      // other errors: keep last known state; the next poll retries
    }
  },
  drop: (id: string) => set((s: RiderRideState) => ({ available: s.available.filter((r) => r.id !== id) })),
}));

const POLL_MS = 10_000;

/** One shared poller for the whole partner app (alert overlay + Rides tab read the same store). */
export function useRiderRidePolling() {
  const refresh = useRiderRides((s) => s.refresh);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void refresh(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [refresh]);
}
