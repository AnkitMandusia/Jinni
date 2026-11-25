import apiClient from './client';

/** Same calls as apiClient but resolve to the response body (most admin pages want just the JSON). */
const api = {
  get: <T = any>(url: string, cfg?: any) => apiClient.get<T>(url, cfg).then(r => r.data),
  post: <T = any>(url: string, body?: any, cfg?: any) => apiClient.post<T>(url, body, cfg).then(r => r.data),
  put: <T = any>(url: string, body?: any, cfg?: any) => apiClient.put<T>(url, body, cfg).then(r => r.data),
  patch: <T = any>(url: string, body?: any, cfg?: any) => apiClient.patch<T>(url, body, cfg).then(r => r.data),
  delete: <T = any>(url: string, cfg?: any) => apiClient.delete<T>(url, cfg).then(r => r.data),
};

// ── Auth ─────────────────────────────────────────────────────────────────────

export const sendOTP = (phone: string) =>
  apiClient.post('/auth/send-otp', { phone });

export const verifyOTP = (phone: string, otp: string) =>
  apiClient.post('/auth/verify-otp', { phone, otp });

// ── Stats ────────────────────────────────────────────────────────────────────

export const getStats = () => api.get('/admin/stats');

// ── Users ────────────────────────────────────────────────────────────────────

export interface UserListParams {
  status?: string;
  role?: string;
  page?: number;
  page_size?: number;
}

export const getUsers = (params: UserListParams = {}) =>
  api.get('/admin/users', { params });

export const approveUser = (userId: string) =>
  api.post(`/admin/users/${userId}/approve`);

export const rejectUser = (userId: string, reason?: string) =>
  api.post(`/admin/users/${userId}/reject`, { reason });

export const suspendUser = (userId: string) =>
  api.post(`/admin/users/${userId}/suspend`);

export const reactivateUser = (userId: string) =>
  api.post(`/admin/users/${userId}/reactivate`);

// ── Orders ───────────────────────────────────────────────────────────────────

export interface OrderListParams {
  status?: string;
  page?: number;
  page_size?: number;
}

export const getOrders = (params: OrderListParams = {}) =>
  api.get('/admin/orders', { params });


// ── Grocery catalogue (admin / store permissions enforced by the API) ────────
export interface ProductListParams {
  category_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
}
export const getProducts = (params: ProductListParams & Record<string, unknown> = {}) =>
  apiClient.get('/admin/catalog/products', { params });
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

export const getRideSummary = () => api.get('/admin/rides/summary');
export const getRides = (params: Record<string, unknown> = {}) => api.get('/admin/rides', { params });
export const assignRide = (id: string, rider_id: string) => api.post(`/admin/rides/${id}/assign`, { rider_id });
export const cancelRide = (id: string, reason: string) => api.post(`/admin/rides/${id}/cancel`, { reason });
export const adjustRideFare = (id: string, fare: number, reason: string) =>
  api.patch(`/admin/rides/${id}/fare`, { fare, reason });
export const waiveRideFee = (id: string, reason: string) => api.post(`/admin/rides/${id}/waive-fee`, { reason });
export const markRidePaid = (id: string, reference?: string) =>
  api.post(`/admin/rides/${id}/mark-paid`, { reference });
export const getRideSettings = () => api.get('/admin/rides/settings');
export const saveRideSettings = (payload: Record<string, unknown>) => api.put('/admin/rides/settings', payload);
export const saveRideFare = (vehicleClass: string, payload: Record<string, unknown>) =>
  api.put(`/admin/rides/fares/${vehicleClass}`, payload);
export const getPricingPreview = () => api.get('/admin/rides/pricing/preview');
export const getRidePlaces = () => api.get('/admin/rides/places');
export const saveRidePlace = (payload: Record<string, unknown>, id?: string) =>
  id ? api.put(`/admin/rides/places/${id}`, payload) : api.post('/admin/rides/places', payload);
export const deleteRidePlace = (id: string) => api.delete(`/admin/rides/places/${id}`);
export const importOsmPlaces = (payload: Record<string, unknown>) => api.post('/admin/rides/places/import-osm', payload, { timeout: 90000 });
export const bulkActivatePlaces = (ids: string[], is_active: boolean) =>
  api.post('/admin/rides/places/bulk-active', { ids, is_active });
export const getRidePartners = () => api.get('/admin/rides/partners');
export const patchRidePartner = (id: string, payload: Record<string, unknown>) =>
  api.patch(`/admin/rides/partners/${id}`, payload);
export const getSosList = (status = 'open') => api.get('/admin/rides/sos', { params: { status } });
export const resolveSos = (id: string, resolution: string) => api.post(`/admin/rides/sos/${id}/resolve`, { resolution });
export const getSosCount = () => api.get('/admin/rides/sos-count');

// ── Business insights (food + grocery + rides) ───────────────────────────────
export const getOverview = (days = 7) => api.get('/admin/insights/overview', { params: { days } });
export const searchOrders = (params: Record<string, unknown> = {}) => api.get('/admin/orders/search', { params });
export const getOrderDetail = (id: string) => api.get(`/admin/orders/${id}/detail`);
export const markOrderRefunded = (id: string, reference: string) => api.post(`/admin/orders/${id}/mark-refunded`, { reference });
export const manualCompleteOrder = (id: string, reason: string) => api.post(`/admin/orders/${id}/manual-complete`, { reason });
export const getPaymentsLedger = (params: Record<string, unknown> = {}) => api.get('/admin/insights/payments', { params });
export const getAdminRestaurants = (params: Record<string, unknown> = {}) => api.get('/admin/restaurants', { params });
export const restaurantAction = (id: string, action: 'verify' | 'reject' | 'activate' | 'deactivate') => api.post(`/admin/restaurants/${id}/${action}`);

// ── Finance & stores ─────────────────────────────────────────────────────────
export const getFinanceOverview = (days = 30) => api.get('/admin/finance/overview', { params: { days } });
export const getFinanceParties = (params: Record<string, unknown> = {}) => api.get('/admin/finance/parties', { params });
export const getPartyStatement = (id: string) => api.get(`/admin/finance/parties/${id}/statement`);
export const createFinanceEntry = (payload: Record<string, unknown>) => api.post('/admin/finance/entries', payload);
export const getFinanceEntries = (params: Record<string, unknown> = {}) => api.get('/admin/finance/entries', { params });
export const getFinanceSettings = () => api.get('/admin/finance/settings');
export const saveFinanceSettings = (payload: Record<string, unknown>) => api.put('/admin/finance/settings', payload);
export const getOnlinePayments = (days = 30) => api.get('/admin/finance/online', { params: { days } });
export const getAdminStores = (params: Record<string, unknown> = {}) => api.get('/admin/stores', { params });
export const getAdminStore = (id: string) => api.get(`/admin/stores/${id}`);
export const patchAdminStore = (id: string, payload: Record<string, unknown>) => api.patch(`/admin/stores/${id}`, payload);
export const storeAction = (id: string, action: 'verify' | 'reject' | 'suspend' | 'reactivate') => api.post(`/admin/stores/${id}/${action}`);
export const adjustStock = (id: string, delta: number, reason: string) => api.put(`/admin/catalog/products/${id}/stock`, { delta, reason });
export const getStockLog = (id: string) => api.get(`/admin/catalog/products/${id}/stock-log`);
