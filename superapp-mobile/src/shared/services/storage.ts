import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
  // String operations
  setString: async (key: string, value: string): Promise<void> => {
    await AsyncStorage.setItem(key, value);
  },

  getString: async (key: string): Promise<string | null> => {
    return await AsyncStorage.getItem(key);
  },

  // Object operations
  setObject: async <T>(key: string, value: T): Promise<void> => {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  getObject: async <T>(key: string): Promise<T | null> => {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  },

  // Boolean operations
  setBoolean: async (key: string, value: boolean): Promise<void> => {
    await AsyncStorage.setItem(key, value ? '1' : '0');
  },

  getBoolean: async (key: string): Promise<boolean> => {
    const value = await AsyncStorage.getItem(key);
    return value === '1';
  },

  // Number operations
  setNumber: async (key: string, value: number): Promise<void> => {
    await AsyncStorage.setItem(key, String(value));
  },

  getNumber: async (key: string): Promise<number | null> => {
    const value = await AsyncStorage.getItem(key);
    return value ? Number(value) : null;
  },

  // Array operations
  setArray: async <T>(key: string, value: T[]): Promise<void> => {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  getArray: async <T>(key: string): Promise<T[]> => {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : [];
  },

  // Remove
  remove: async (key: string): Promise<void> => {
    await AsyncStorage.removeItem(key);
  },

  // Multi remove
  removeMany: async (keys: string[]): Promise<void> => {
    await AsyncStorage.multiRemove(keys);
  },

  // Clear all
  clear: async (): Promise<void> => {
    await AsyncStorage.clear();
  },

  // Get all keys
  getAllKeys: async (): Promise<string[]> => {
    return await AsyncStorage.getAllKeys();
  },
};

export default storage;
