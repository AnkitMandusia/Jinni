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
  logout: () => Promise<void>;
  init: () => Promise<void>;
  clearError: () => void;
}

const allowedRole = (role?: string) => {
  const value = (role || '').toLowerCase();
  return value === 'admin' || value === 'super_admin' || value.includes('restaurant') || value === 'store' || value.includes('grocery');
};

const clearPersistedSession = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('admin_user');
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

    if (!cachedUser || !allowedRole(cachedUser.role)) {
      clearPersistedSession();
      set({ initialized: true });
      return;
    }

    set({ token, user: cachedUser });
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
      // Keep the cached identity on temporary network/API failures. The real
      // API call will surface its error in the page; expired sessions are
      // cleared by the shared 401/refresh interceptor.
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
      // Same endpoint and request contract as mobile authStore.loginWithPassword().
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
      const detail = err?.response?.data?.detail;
      set({
        error: detail || (err?.response ? 'Invalid email/phone or password.' : 'Could not reach the Jinni API. Check the backend URL and connection.'),
        loading: false,
      });
      return false;
    }
  },

  logout: async () => {
    try {
      if (get().token) await apiClient.post('/auth/logout', {});
    } catch {
      // Continue with local sign-out even when the API is unreachable.
    }
    clearPersistedSession();
    set({ token: null, user: null, error: null, loading: false, initialized: true });
  },

  clearError: () => set({ error: null }),
}));
