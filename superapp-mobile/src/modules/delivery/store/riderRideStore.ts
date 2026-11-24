import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import * as Location from 'expo-location';
import { createStore } from '@store/useStore';
import { rideService } from '@modules/cab/services/rideService';
import { Ride } from '@modules/cab/types';

interface RiderRideState {
  available: Ride[];
  active: Ride | null;
  busy: boolean;
  /** Why this partner can't get rides right now (documents pending, expired insurance, rides switched off…). */
  blockedReason: string | null;
  /** Partner switched Online — their phone then reports a location so nearby customers see this vehicle type as available. */
  online: boolean;
  /** Rides switched off for this partner by admin — stop polling. */
  disabled: boolean;
  refresh: () => Promise<void>;
  drop: (id: string) => void;
}

export const useRiderRides = createStore<RiderRideState>('rider-rides', (set: any, get: any) => ({
  available: [],
  active: null,
  busy: false,
  blockedReason: null,
  online: false,
  disabled: false,
  refresh: async () => {
    if (get().disabled) return;
    try {
      const [a, act] = await Promise.all([rideService.riderAvailable(), rideService.riderActive()]);
      set({ available: a.rides, busy: a.busy, active: act.ride, blockedReason: a.blocked_reason ?? null, online: !!a.online });
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

const LOCATION_MS = 15_000;
const PRESENCE_MS = 60_000;

/**
 * Free "live location" for the customer: while this partner has an active ride, send the phone's GPS every
 * 15 s (foreground only). The server keeps just the latest point, shows the customer a distance/ETA (no map
 * tiles), and ignores updates when there is no active ride.
 */
export function useRideLocationSharing() {
  const active = useRiderRides((s) => s.active);
  const online = useRiderRides((s) => s.online);
  const rideId = active?.id;
  // On a ride: every 15 s (customer ETA). Just online: every 60 s (so customers see this vehicle type is nearby).
  const sharing = !!rideId || online;
  const everyMs = rideId ? LOCATION_MS : PRESENCE_MS;
  useEffect(() => {
    if (!sharing) return;
    let stopped = false;
    let warned = false;
    const send = async () => {
      try {
        let perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted) perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          if (!warned) { warned = true; Alert.alert('Location off', 'Turn on location so nearby customers can find you and see how far you are.'); }
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!stopped) await rideService.riderLocation(pos.coords.latitude, pos.coords.longitude);
      } catch { /* try again next tick */ }
    };
    void send();
    const t = setInterval(() => { if (AppState.currentState === 'active') void send(); }, everyMs);
    return () => { stopped = true; clearInterval(t); };
  }, [sharing, everyMs]);
}
