import { create } from 'zustand';
import { sendOTP as apiSendOTP, verifyOTP as apiVerifyOTP } from '../api/admin';

interface AuthUser { id: string; name: string; phone: string; role: string; }
interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  sendOTP: (phone: string) => Promise<void>;
  verifyOTP: (phone: string, otp: string) => Promise<boolean>;
  loginWithDevMock: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  init: () => void;
}

const allowedRole = (role?: string) => {
  const value = (role || '').toLowerCase();
  return value === 'admin' || value === 'super_admin' || value.includes('restaurant') || value.includes('store') || value.includes('grocery');
};

const DEV_MOCK_EMAIL = 'resturant@test.com';
// SHA-256 digest for the local-only demo password. Never store a plaintext password.
const DEV_MOCK_PASSWORD_SHA256 = 'd9b5f58f0b38198293971865a14074f59eba3e82595becbe86ae51f1d9f1f65e';
const DEV_MOCK_TOKEN = 'jinni-local-restaurant-preview';

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,
  init: () => {
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('admin_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        if (allowedRole(user.role)) set({ token, user });
        else { localStorage.removeItem('access_token'); localStorage.removeItem('admin_user'); }
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('admin_user');
      }
    }
  },
  sendOTP: async (phone) => {
    set({ loading: true, error: null });
    try {
      await apiSendOTP(phone);
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Failed to send OTP';
      set({ error: msg });
      throw new Error(msg);
    } finally {
      set({ loading: false });
    }
  },
  verifyOTP: async (phone, otp) => {
    set({ loading: true, error: null });
    try {
      const res: any = await apiVerifyOTP(phone, otp);
      const { access_token, user } = res;
      if (!access_token || !user || !allowedRole(user.role)) {
        set({ error: 'This account is not authorised for the Jinni web portal.', loading: false });
        return false;
      }
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('admin_user', JSON.stringify(user));
      set({ token: access_token, user, loading: false });
      return true;
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Invalid OTP';
      set({ error: msg, loading: false });
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
        name: 'Jinni Demo Restaurant',
        phone: '9999999999',
        role: 'restaurant',
      };
      localStorage.setItem('access_token', DEV_MOCK_TOKEN);
      localStorage.setItem('admin_user', JSON.stringify(user));
      localStorage.removeItem('refresh_token');
      set({ token: DEV_MOCK_TOKEN, user, error: null });
      return true;
    } finally {
      set({ loading: false });
    }
  },
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('admin_user');
    set({ user: null, token: null, error: null });
  },
}));
