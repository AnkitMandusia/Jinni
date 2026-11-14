import { create } from 'zustand';
import { sendOTP as apiSendOTP, verifyOTP as apiVerifyOTP } from '../api/admin';

interface AuthUser { id: string; name: string; phone: string; role: string; }
interface AuthState {
  user: AuthUser | null; token: string | null; loading: boolean; error: string | null;
  sendOTP: (phone: string) => Promise<void>;
  verifyOTP: (phone: string, otp: string) => Promise<boolean>;
  logout: () => void; init: () => void;
}
const allowedRole = (role?: string) => {
  const value = (role || '').toLowerCase();
  return value === 'admin' || value.includes('restaurant') || value.includes('store') || value.includes('grocery');
};
export const useAuthStore = create<AuthState>((set) => ({
  user: null, token: null, loading: false, error: null,
  init: () => {
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('admin_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        if (allowedRole(user.role)) set({ token, user });
        else { localStorage.removeItem('access_token'); localStorage.removeItem('admin_user'); }
      } catch { localStorage.removeItem('access_token'); localStorage.removeItem('admin_user'); }
    }
  },
  sendOTP: async (phone) => {
    set({ loading: true, error: null });
    try { await apiSendOTP(phone); }
    catch (err: any) { const msg = err?.response?.data?.detail ?? 'Failed to send OTP'; set({ error: msg }); throw new Error(msg); }
    finally { set({ loading: false }); }
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
      set({ error: msg, loading: false }); return false;
    }
  },
  logout: () => {
    localStorage.removeItem('access_token'); localStorage.removeItem('admin_user');
    set({ user: null, token: null, error: null });
  },
}));
