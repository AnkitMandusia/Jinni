import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setApiToken } from '@services/api';

// Store persistence helper
export const createPersistedStore = <T extends object>(
  name: string,
  initialState: T,
  storeCreator: (set: any, get: any) => Omit<T, keyof typeof initialState>
) => {
  console.log(`[createPersistedStore:${name}] Creating persisted store...`);
  return create<T>()(
    devtools(
      persist(
        (set, get) => ({
          ...initialState,
          ...storeCreator(set, get),
        }),
        {
          name,
          storage: {
            getItem: async (key: string) => {
              console.log(`[createPersistedStore:${name}] Reading from storage:`, key);
              const value = await AsyncStorage.getItem(key);
              console.log(`[createPersistedStore:${name}] Storage value:`, value ? 'found' : 'null');
              return value ? JSON.parse(value) : null;
            },
            setItem: async (key: string, value: any) => {
              await AsyncStorage.setItem(key, JSON.stringify(value));
            },
            removeItem: async (key: string) => {
              await AsyncStorage.removeItem(key);
            },
          },
          onRehydrateStorage: (state) => {
            console.log(`[createPersistedStore:${name}] Rehydration complete`, state ? 'state restored' : 'no state');
            return (rehydratedState: any, error) => {
              if (error) {
                console.error(`[createPersistedStore:${name}] Rehydration error:`, error);
              } else {
                console.log(`[createPersistedStore:${name}] Rehydration successful`);
                // Warm api.ts token cache so the first request after cold-start
                // has the token without an AsyncStorage round-trip
                if (name === 'auth-store' && rehydratedState?.accessToken) {
                  setApiToken(rehydratedState.accessToken);
                }
              }
            };
          },
          partialize: (state: any) => {
            // Exclude transient state from persistence
            const { isLoading, error, ...persistedState } = state;
            return persistedState;
          },
        }
      ),
      { name }
    )
  );
};

// Simple store without persistence
export const createStore = <T extends object>(
  name: string,
  storeCreator: (set: any, get: any) => T
) => {
  return create<T>()(devtools(storeCreator, { name }));
};
