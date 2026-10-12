import { create } from 'zustand';
import { sendOTP as apiSendOTP, verifyOTP as apiVerifyOTP } from '../api/admin';

interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: string;
}

interface AuthState {
  user: AdminUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  sendOTP: (phone: string) => Promise<void>;
  verifyOTP: (phone: string, otp: string) => Promise<boolean>;
  logout: () => void;
  init: () => void;
}

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
        const user = JSON.parse(userStr);
        set({ token, user });
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('admin_user');
      }
    }
  },

  sendOTP: async (phone: string) => {
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

  verifyOTP: async (phone: string, otp: string) => {
    set({ loading: true, error: null });
    try {
      const res: any = await apiVerifyOTP(phone, otp);
      const { access_token, user } = res;

      if (user?.role !== 'admin') {
        set({ error: 'Access denied. Admin accounts only.', loading: false });
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

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('admin_user');
    set({ user: null, token: null, error: null });
  },
}));
