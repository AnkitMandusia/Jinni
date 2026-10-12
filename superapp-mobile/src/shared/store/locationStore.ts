import { createPersistedStore } from '@store/useStore';

interface LocationState {
  pincode: string;
  city: string;
  confirmedAt: string | null;
}

interface LocationActions {
  setPincode: (pincode: string, city?: string) => void;
  clearPincode: () => void;
}

const initialState: LocationState = {
  pincode: '',
  city: '',
  confirmedAt: null,
};

export const useLocationStore = createPersistedStore<LocationState & LocationActions>(
  'location-store',
  initialState as LocationState & LocationActions,
  (set) => ({
    setPincode: (pincode, city = '') =>
      set({ pincode, city, confirmedAt: new Date().toISOString() }),
    clearPincode: () => set({ pincode: '', city: '', confirmedAt: null }),
  })
);

export default useLocationStore;
