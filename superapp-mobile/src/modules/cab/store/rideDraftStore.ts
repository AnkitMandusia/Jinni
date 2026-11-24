import { createStore } from '@store/useStore';
import { PayMethod, RidePoint } from '../types';

type Pt = Pick<RidePoint, 'text' | 'lat' | 'lng'>;

interface Draft {
  pickup: Pt | null;
  drop: Pt | null;
  payment: PayMethod;
  setPickup: (p: Pt | null) => void;
  setDrop: (p: Pt | null) => void;
  setPayment: (m: PayMethod) => void;
  swap: () => void;
  reset: () => void;
}

/** In-memory booking draft shared between the booking screen and the place picker. */
export const useRideDraft = createStore<Draft>('ride-draft', (set: any, get: any) => ({
  pickup: null,
  drop: null,
  payment: 'cash',
  setPickup: (pickup: Pt | null) => set({ pickup }),
  setDrop: (drop: Pt | null) => set({ drop }),
  setPayment: (payment: PayMethod) => set({ payment }),
  swap: () => set({ pickup: get().drop, drop: get().pickup }),
  reset: () => set({ pickup: null, drop: null }),
}));
