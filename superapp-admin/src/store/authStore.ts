import { create } from 'zustand';
import apiClient from '../api/client';

export interface AuthUser {
  id: string;
  phone: string;
  email?: string | null;
  name?: string | null;
  role: string;
  status: string;
  profile_complete?: boolean;
  profile_id?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  loginWithPassword: (identifier: string, password: string) => Promise<boolean>;
  loginWithDevMock: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  init: () => Promise<void>;
  clearError: () => void;
}

const allowedRole = (role?: string) => {
  const value = (role || '').toLowerCase();
  return value === 'admin' || value === 'super_admin' || value.includes('restaurant') || value === 'store' || value.includes('grocery');
};

const DEV_MOCK_EMAIL = 'resturant@test.com';
const DEV_MOCK_PASSWORD_SHA256 = 'd9b5f58f0b38198293971865a14074f59eba3e82595becbe86ae51f1d9f1f65e';
const DEV_MOCK_TOKEN = 'jinni-local-restaurant-preview';

const clearPersistedSession = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('admin_user');
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  initialized: false,
  error: null,

  init: async () => {
    if (get().initialized) return;
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('admin_user');
    if (!token) {
      clearPersistedSession();
      set({ initialized: true });
      return;
    }

    let cachedUser: AuthUser | null = null;
    try {
      cachedUser = userStr ? JSON.parse(userStr) as AuthUser : null;
    } catch {
      clearPersistedSession();
      set({ initialized: true });
      return;
    }

    if (!cachedUser || !allowedRole(cachedUser.role) || (token === DEV_MOCK_TOKEN && !import.meta.env.DEV)) {
      clearPersistedSession();
      set({ initialized: true });
      return;
    }

    set({ token, user: cachedUser });
    if (import.meta.env.DEV && token === DEV_MOCK_TOKEN) {
      set({ initialized: true });
      return;
    }

    try {
      const response = await apiClient.get('/auth/status');
      const freshUser = {
        ...cachedUser,
        status: response.data.status,
        role: response.data.role || cachedUser.role,
        profile_complete: response.data.profile_complete,
      };
      if (!allowedRole(freshUser.role)) {
        clearPersistedSession();
        set({ token: null, user: null });
      } else {
        localStorage.setItem('admin_user', JSON.stringify(freshUser));
        set({ user: freshUser, token: localStorage.getItem('access_token') || token });
      }
    } catch (err: any) {
      if (err?.response?.status === 401) {
        clearPersistedSession();
        set({ token: null, user: null });
      }
    } finally {
      set({ initialized: true });
    }
  },

  loginWithPassword: async (identifier, password) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/auth/login', { identifier, password });
      const { access_token, refresh_token, user } = response.data || {};
      if (!access_token || !refresh_token || !user || !allowedRole(user.role)) {
        set({ error: 'This Jinni account is not authorised for the web portal.', loading: false });
        return false;
      }

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('admin_user', JSON.stringify(user));
      set({ token: access_token, user, loading: false, initialized: true, error: null });
      return true;
    } catch (err: any) {
      set({
        error: err?.response?.data?.detail || (err?.response ? 'Invalid email/phone or password.' : 'Could not reach the Jinni API. Check the backend URL and connection.'),
        loading: false,
      });
      return false;
    }
  },

  loginWithDevMock: async (email, password) => {
    set({ loading: true, error: null });
    try {
      if (!import.meta.env.DEV) {
        set({ error: 'Development preview login is disabled in this build.' });
        return false;
      }
      const passwordHash = await sha256(password);
      if (email.trim().toLowerCase() !== DEV_MOCK_EMAIL || passwordHash !== DEV_MOCK_PASSWORD_SHA256) {
        set({ error: 'Incorrect development preview email or password.' });
        return false;
      }

      const user: AuthUser = {
        id: 'dev-restaurant-preview',
        phone: '9999999999',
        email: DEV_MOCK_EMAIL,
        name: 'Jinni Demo Restaurant',
        role: 'restaurant',
        status: 'active',
        profile_complete: true,
      };
      localStorage.setItem('access_token', DEV_MOCK_TOKEN);
      localStorage.setItem('admin_user', JSON.stringify(user));
      localStorage.removeItem('refresh_token');
      set({ token: DEV_MOCK_TOKEN, user, initialized: true, error: null });
      return true;
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    const token = get().token;
    if (token && token !== DEV_MOCK_TOKEN) {
      try {
        await apiClient.post('/auth/logout', {});
      } catch {
        // Continue with local sign-out even when the API is unreachable.
      }
    }
    clearPersistedSession();
    set({ token: null, user: null, error: null, loading: false, initialized: true });
  },

  clearError: () => set({ error: null }),
}));
