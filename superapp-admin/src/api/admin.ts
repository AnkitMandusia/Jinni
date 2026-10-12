import apiClient from './client';

// ── Auth ─────────────────────────────────────────────────────────────────────

export const sendOTP = (phone: string) =>
  apiClient.post('/auth/send-otp', { phone });

export const verifyOTP = (phone: string, otp: string) =>
  apiClient.post('/auth/verify-otp', { phone, otp });

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = () => apiClient.get('/admin/stats');

// ── Users ────────────────────────────────────────────────────────────────────

export interface UserListParams {
  status?: string;
  role?: string;
  page?: number;
  page_size?: number;
}

export const getUsers = (params: UserListParams = {}) =>
  apiClient.get('/admin/users', { params });

export const approveUser = (userId: string) =>
  apiClient.post(`/admin/users/${userId}/approve`);

export const rejectUser = (userId: string, reason?: string) =>
  apiClient.post(`/admin/users/${userId}/reject`, { reason });

export const suspendUser = (userId: string) =>
  apiClient.post(`/admin/users/${userId}/suspend`);

export const reactivateUser = (userId: string) =>
  apiClient.post(`/admin/users/${userId}/reactivate`);

// ── Orders ───────────────────────────────────────────────────────────────────

export interface OrderListParams {
  status?: string;
  page?: number;
  page_size?: number;
}

export const getOrders = (params: OrderListParams = {}) =>
  apiClient.get('/admin/orders', { params });
