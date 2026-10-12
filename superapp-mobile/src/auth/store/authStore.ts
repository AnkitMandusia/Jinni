import { createPersistedStore } from '@store/useStore';
import { api, setApiToken, onAuthFailure } from '@services/api';
import { storage } from '@services/storage';

export type UserRole =
  | 'customer'
  | 'store'
  | 'restaurant'
  | 'delivery'
  | 'cab_driver'
  | 'salon'
  | 'admin';

export type AccountStatus =
  | 'pending_approval'
  | 'active'
  | 'suspended'
  | 'rejected';

export interface User {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  role: UserRole | null;
  status: AccountStatus;
  profile_complete: boolean;
  profile_id?: string;
  fcmToken?: string;
}

interface VerifyOTPResult {
  success: boolean;
  isNewUser: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isNewUser: boolean;
}

interface AuthActions {
  sendOTP: (phone: string) => Promise<boolean>;
  verifyOTP: (phone: string, otp: string) => Promise<VerifyOTPResult>;
  verifyFirebaseToken: (idToken: string) => Promise<VerifyOTPResult>;
  loginWithPassword: (identifier: string, password: string) => Promise<boolean>;
  completeProfile: (
    role: UserRole,
    data: Record<string, string>
  ) => Promise<boolean>;
  checkStatus: () => Promise<void>;
  logout: () => Promise<void>;
  forceLogout: () => Promise<void>; // Called by API interceptor when refresh fails
  updateUser: (updates: Partial<User>) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isNewUser: false,
};

export const useAuthStore = createPersistedStore<AuthState & AuthActions>(
  'auth-store',
  initialState as AuthState & AuthActions,
  (set, get) => ({
    sendOTP: async (phone: string) => {
      try {
        set({ isLoading: true, error: null });
        await api.post('/auth/send-otp', { phone });
        set({ isLoading: false });
        return true;
      } catch (error: any) {
        set({
          isLoading: false,
          error:
            error.response?.data?.detail ||
            error.response?.data?.message ||
            'Failed to send OTP. Please try again.',
        });
        return false;
      }
    },

    verifyFirebaseToken: async (idToken: string) => {
      try {
        set({ isLoading: true, error: null });
        const response = await api.post<{
          access_token: string;
          refresh_token: string;
          user: User;
          is_new_user: boolean;
        }>('/auth/firebase-login', { id_token: idToken });

        const { access_token, refresh_token, user, is_new_user } = response;

        await storage.setString('accessToken', access_token);
        await storage.setString('refreshToken', refresh_token);
        setApiToken(access_token);

        set({
          user,
          accessToken: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
          isNewUser: is_new_user,
          isLoading: false,
          error: null,
        });

        return { success: true, isNewUser: is_new_user };
      } catch (error: any) {
        set({
          isLoading: false,
          error:
            error.response?.data?.detail ||
            error.response?.data?.message ||
            'Firebase token verification failed.',
        });
        return { success: false, isNewUser: false };
      }
    },

    verifyOTP: async (phone: string, otp: string) => {
      try {
        set({ isLoading: true, error: null });
        const response = await api.post<{
          access_token: string;
          refresh_token: string;
          user: User;
          is_new_user: boolean;
        }>('/auth/verify-otp', { phone, otp });

        const { access_token, refresh_token, user, is_new_user } = response;

        await storage.setString('accessToken', access_token);
        await storage.setString('refreshToken', refresh_token);
        setApiToken(access_token);

        set({
          user,
          accessToken: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
          isNewUser: is_new_user,
          isLoading: false,
          error: null,
        });

        return { success: true, isNewUser: is_new_user };
      } catch (error: any) {
        set({
          isLoading: false,
          error:
            error.response?.data?.detail ||
            error.response?.data?.message ||
            'Invalid OTP. Please try again.',
        });
        return { success: false, isNewUser: false };
      }
    },

    loginWithPassword: async (identifier: string, password: string) => {
      try {
        set({ isLoading: true, error: null });
        const response = await api.post<{
          access_token: string;
          refresh_token: string;
          user: User;
          is_new_user: boolean;
        }>('/auth/login', { identifier, password });

        const { access_token, refresh_token, user } = response;

        await storage.setString('accessToken', access_token);
        await storage.setString('refreshToken', refresh_token);
        setApiToken(access_token);

        set({
          user,
          accessToken: access_token,
          refreshToken: refresh_token,
          isAuthenticated: true,
          isNewUser: false,
          isLoading: false,
          error: null,
        });
        return true;
      } catch (error: any) {
        set({
          isLoading: false,
          error:
            error.response?.data?.detail ||
            'Invalid phone/email or password.',
        });
        return false;
      }
    },

    completeProfile: async (
      role: UserRole,
      data: Record<string, string>
    ) => {
      try {
        set({ isLoading: true, error: null });

        // Read token directly from Zustand state — bypasses module-level cache
        // which resets on hot-reload. This is the only reliable source of truth.
        const token = get().accessToken;
        if (!token) {
          set({ isLoading: false, error: 'Session expired. Please verify your phone again.' });
          return false;
        }

        const response = await api.post<{
          access_token: string;
          refresh_token: string;
          user: User;
        }>(
          '/auth/complete-profile',
          { role, ...data },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const { access_token, refresh_token, user } = response;

        await storage.setString('accessToken', access_token);
        await storage.setString('refreshToken', refresh_token);
        setApiToken(access_token);

        set({
          user,
          accessToken: access_token,
          refreshToken: refresh_token,
          isNewUser: false,
          isLoading: false,
          error: null,
        });

        return true;
      } catch (error: any) {
        set({
          isLoading: false,
          error:
            error.response?.data?.detail ||
            error.response?.data?.message ||
            'Failed to complete profile. Please try again.',
        });
        return false;
      }
    },

    checkStatus: async () => {
      try {
        const token = get().accessToken;
        if (!token) return;
        const response = await api.get<{
          status: AccountStatus;
          role: UserRole | null;
          profile_complete: boolean;
        }>('/auth/status', { headers: { Authorization: `Bearer ${token}` } });
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              status: response.status,
              role: response.role,
              profile_complete: response.profile_complete,
            },
          });
        }
      } catch {
        // Silently fail — user may be offline
      }
    },

    logout: async () => {
      try {
        const token = get().accessToken;
        if (token) {
          await api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } });
        }
      } catch {
        // Continue with local logout even if server call fails
      }
      await storage.removeMany(['accessToken', 'refreshToken']);
      setApiToken(null);
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isNewUser: false,
        isLoading: false,
        error: null,
      });
    },

    forceLogout: async () => {
      // Called by API interceptor when token refresh fails — no server call, just clear local state
      await storage.removeMany(['accessToken', 'refreshToken']);
      setApiToken(null);
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isNewUser: false,
        isLoading: false,
        error: 'Session expired. Please login again.',
      });
    },

    updateUser: (updates: Partial<User>) => {
      const { user } = get();
      if (user) {
        set({ user: { ...user, ...updates } });
      }
    },

    clearError: () => set({ error: null }),
    setLoading: (loading: boolean) => set({ isLoading: loading }),
  })
);

// Register auth failure handler so API interceptor can trigger logout on token refresh failure
onAuthFailure(() => {
  useAuthStore.getState().forceLogout();
});

export default useAuthStore;
