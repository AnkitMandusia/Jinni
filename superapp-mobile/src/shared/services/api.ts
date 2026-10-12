import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use environment variable or default to local development server
// For mobile testing, use your computer's local IP (e.g., 'http://192.168.1.100:8000')
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// ── Token cache ───────────────────────────────────────────────────────────────
// authStore calls setApiToken() after every login/refresh/rehydration,
// so the interceptor never needs an async AsyncStorage round-trip mid-request.
let _tokenCache: string | null = null;
let _onAuthFailure: (() => void) | null = null;

/** Called by authStore after every token update so api.ts always has the latest value. */
const sanitizeToken = (token: string | null): string | null => {
  if (!token) return null;
  // JWTs have 3 segments separated by '.'
  if (!token.includes('.')) {
    return null;
  }
  return token;
};

export function setApiToken(token: string | null): void {
  _tokenCache = sanitizeToken(token);
}

/** Current cached access token, for non-HTTP use (e.g. WebSocket auth query param). */
export function getApiToken(): string | null {
  return _tokenCache;
}

export { API_BASE_URL };

/** Register a callback to be called when authentication fails (e.g., token refresh fails). */
export function onAuthFailure(callback: () => void): void {
  _onAuthFailure = callback;
}

// Request interceptor
apiClient.interceptors.request.use(
  async (config) => {
    // 1. Use in-memory cache (set by authStore on every login/refresh)
    let token = _tokenCache;
    // 2. Fallback: read from AsyncStorage (covers cold-start before store rehydrates)
    if (!token) {
      const stored = await AsyncStorage.getItem('accessToken');
      token = sanitizeToken(stored);
      if (token) _tokenCache = token;   // warm the cache
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = response.data;
        await AsyncStorage.setItem('accessToken', access_token);
        if (refresh_token) {
          await AsyncStorage.setItem('refreshToken', refresh_token);
        }

        // Update in-memory cache so the request interceptor on the retry
        // doesn't overwrite the Authorization header with the old expired token
        setApiToken(access_token);

        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Clear tokens and notify auth store to logout
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user']);
        _tokenCache = null;
        if (_onAuthFailure) {
          _onAuthFailure();
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// API methods
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) => 
    apiClient.get<T>(url, config).then(res => res.data),
  
  post: <T>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.post<T>(url, data, config).then(res => res.data),
  
  put: <T>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.put<T>(url, data, config).then(res => res.data),
  
  delete: <T>(url: string, config?: AxiosRequestConfig) => 
    apiClient.delete<T>(url, config).then(res => res.data),
  
  patch: <T>(url: string, data?: any, config?: AxiosRequestConfig) => 
    apiClient.patch<T>(url, data, config).then(res => res.data),

  postForm: <T>(url: string, formData: FormData, config?: AxiosRequestConfig) =>
    apiClient.post<T>(url, formData, {
      ...config,
      headers: { ...(config?.headers ?? {}), 'Content-Type': 'multipart/form-data' },
    }).then(res => res.data),
};

export default apiClient;
