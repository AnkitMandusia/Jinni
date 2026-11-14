import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const configuredOrigin = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const API_CONFIGURED = Boolean(configuredOrigin) || !import.meta.env.PROD;
export const API_BASE_URL = configuredOrigin ? `${configuredOrigin}/api/v1` : '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RetriableRequest = InternalAxiosRequestConfig & { _jinniRetried?: boolean };
let refreshInFlight: Promise<string> | null = null;

const clearSession = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('admin_user');
};

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequest | undefined;
    const requestUrl = request?.url || '';
    const isAuthEntry = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/refresh');
    if (error.response?.status !== 401 || !request || request._jinniRetried || isAuthEntry) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      clearSession();
      if (window.location.pathname !== '/login') window.location.assign('/login');
      return Promise.reject(error);
    }

    request._jinniRetried = true;
    if (!refreshInFlight) {
      refreshInFlight = axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: 20000 })
        .then(response => {
          const nextAccessToken = response.data?.access_token as string | undefined;
          const nextRefreshToken = response.data?.refresh_token as string | undefined;
          if (!nextAccessToken) throw new Error('Refresh response did not include an access token');
          localStorage.setItem('access_token', nextAccessToken);
          if (nextRefreshToken) localStorage.setItem('refresh_token', nextRefreshToken);
          return nextAccessToken;
        })
        .finally(() => { refreshInFlight = null; });
    }

    try {
      const nextToken = await refreshInFlight;
      request.headers.Authorization = `Bearer ${nextToken}`;
      return apiClient(request);
    } catch (refreshError) {
      clearSession();
      if (window.location.pathname !== '/login') window.location.assign('/login');
      return Promise.reject(refreshError);
    }
  }
);

export default apiClient;
