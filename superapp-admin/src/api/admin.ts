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


// ── Grocery catalogue (admin / store permissions enforced by the API) ────────
export interface ProductListParams {
  category_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
}
export const getProducts = (params: ProductListParams = {}) =>
  apiClient.get('/grocery/products', { params });
export const getCategories = () => apiClient.get('/grocery/categories');
export const createProduct = (payload: Record<string, unknown>) =>
  apiClient.post('/grocery/admin/products', payload);
export const updateProduct = (productId: string, payload: Record<string, unknown>) =>
  apiClient.put(`/grocery/products/${productId}`, payload);
export const deleteProduct = (productId: string) =>
  apiClient.delete(`/grocery/products/${productId}`);
export const lookupBarcode = (barcode: string) =>
  apiClient.get(`/grocery/barcode/${encodeURIComponent(barcode)}`);
export const uploadProductImage = (formData: FormData) =>
  apiClient.post('/grocery/products/upload-image', formData);

// ── Rides (bike taxi) ────────────────────────────────────────────────────────

export const getRideSummary = () => apiClient.get('/admin/rides/summary');
export const getRides = (params: Record<string, unknown> = {}) => apiClient.get('/admin/rides', { params });
export const assignRide = (id: string, rider_id: string) => apiClient.post(`/admin/rides/${id}/assign`, { rider_id });
export const cancelRide = (id: string, reason: string) => apiClient.post(`/admin/rides/${id}/cancel`, { reason });
export const adjustRideFare = (id: string, fare: number, reason: string) =>
  apiClient.patch(`/admin/rides/${id}/fare`, { fare, reason });
export const waiveRideFee = (id: string, reason: string) => apiClient.post(`/admin/rides/${id}/waive-fee`, { reason });
export const markRidePaid = (id: string, reference?: string) =>
  apiClient.post(`/admin/rides/${id}/mark-paid`, { reference });
export const getRideSettings = () => apiClient.get('/admin/rides/settings');
export const saveRideSettings = (payload: Record<string, unknown>) => apiClient.put('/admin/rides/settings', payload);
export const saveRideFare = (vehicleClass: string, payload: Record<string, unknown>) =>
  apiClient.put(`/admin/rides/fares/${vehicleClass}`, payload);
export const getPricingPreview = () => apiClient.get('/admin/rides/pricing/preview');
export const getRidePlaces = () => apiClient.get('/admin/rides/places');
export const saveRidePlace = (payload: Record<string, unknown>, id?: string) =>
  id ? apiClient.put(`/admin/rides/places/${id}`, payload) : apiClient.post('/admin/rides/places', payload);
export const deleteRidePlace = (id: string) => apiClient.delete(`/admin/rides/places/${id}`);
export const importOsmPlaces = (payload: Record<string, unknown>) => apiClient.post('/admin/rides/places/import-osm', payload, { timeout: 90000 });
export const bulkActivatePlaces = (ids: string[], is_active: boolean) =>
  apiClient.post('/admin/rides/places/bulk-active', { ids, is_active });
export const getRidePartners = () => apiClient.get('/admin/rides/partners');
export const patchRidePartner = (id: string, payload: Record<string, unknown>) =>
  apiClient.patch(`/admin/rides/partners/${id}`, payload);
export const getSosList = (status = 'open') => apiClient.get('/admin/rides/sos', { params: { status } });
export const resolveSos = (id: string, resolution: string) => apiClient.post(`/admin/rides/sos/${id}/resolve`, { resolution });
export const getSosCount = () => apiClient.get('/admin/rides/sos-count');
