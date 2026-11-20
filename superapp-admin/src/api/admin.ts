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

// ── Grocery products (pages/grocery/ProductList.tsx) ─────────────────────────
// Backend: superapp-backend/app/modules/grocery/router.py (prefix /grocery)

export const getCategories = (params: object = {}) =>
  apiClient.get('/grocery/categories', { params });

export const getProducts = (params: object = {}) =>
  apiClient.get('/grocery/products', { params });

export const createProduct = (data: object) =>
  apiClient.post('/grocery/admin/products', data);

export const updateProduct = (productId: string, data: object) =>
  apiClient.put(`/grocery/products/${productId}`, data);

export const deleteProduct = (productId: string) =>
  apiClient.delete(`/grocery/products/${productId}`);

export const lookupBarcode = (barcode: string) =>
  apiClient.get(`/grocery/barcode/${encodeURIComponent(barcode)}`);

// Backend expects the multipart field to be named "file" (UploadFile)
export const uploadProductImage = (formData: FormData) =>
  apiClient.post('/grocery/products/upload-image', formData);
