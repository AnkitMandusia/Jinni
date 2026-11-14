import axios, { AxiosAdapter, AxiosError, InternalAxiosRequestConfig } from 'axios';

const configuredOrigin = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const API_CONFIGURED = Boolean(configuredOrigin) || !import.meta.env.PROD;
export const API_BASE_URL = configuredOrigin ? `${configuredOrigin}/api/v1` : '/api/v1';

const DEV_MOCK_TOKEN = 'jinni-local-restaurant-preview';

const demoProfile = {
  id: 'demo-restaurant-preview',
  name: 'Jinni Demo Restaurant',
  description: 'Sample restaurant profile for local dashboard preview.',
  cuisines: ['North Indian', 'Chinese'],
  address_line1: 'Demo Address, C-Scheme',
  city: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302001',
  latitude: 26.9124,
  longitude: 75.7873,
  cost_for_two: 500,
  min_order_amount: 99,
  delivery_fee: 25,
  avg_prep_minutes: 25,
  delivery_radius_km: 5,
  pure_veg: false,
  fssai_license: '',
  gstin: '',
  bank_account: '',
  bank_ifsc: '',
  upi_id: '',
  is_open: true,
};

const demoCategories = [
  {
    id: 'demo-category-1',
    name: 'Popular Dishes',
    description: 'Sample items for preview only',
    items: [
      { id: 'demo-item-1', name: 'Paneer Tikka', description: 'Marinated paneer with spices', price: 249, is_veg: true, is_egg: false, is_available: true, is_bestseller: true },
      { id: 'demo-item-2', name: 'Veg Biryani', description: 'Aromatic basmati rice and vegetables', price: 199, is_veg: true, is_egg: false, is_available: true, is_bestseller: false },
      { id: 'demo-item-3', name: 'Chicken Tikka', description: 'Grilled chicken with Indian spices', price: 299, is_veg: false, is_egg: false, is_available: true, is_bestseller: false },
    ],
  },
  {
    id: 'demo-category-2',
    name: 'Beverages',
    description: 'Sample beverage menu',
    items: [
      { id: 'demo-item-4', name: 'Fresh Lime Soda', description: 'Sweet or salted', price: 79, is_veg: true, is_egg: false, is_available: true, is_bestseller: false },
    ],
  },
];

const demoOrders = [
  {
    id: 'demo-order-1001',
    order_number: 'JN-DEMO-1001',
    created_at: new Date().toISOString(),
    items: [{ name: 'Paneer Tikka', quantity: 1 }, { name: 'Fresh Lime Soda', quantity: 2 }],
    total_amount: 407,
    status: 'pending_dispatch',
    delivery_address: { line1: 'C-Scheme (Demo Address)', city: 'Jaipur', pincode: '302001' },
  },
  {
    id: 'demo-order-1002',
    order_number: 'JN-DEMO-1002',
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    items: [{ name: 'Veg Biryani', quantity: 2 }],
    total_amount: 398,
    status: 'store_accepted',
    delivery_address: { line1: 'Vaishali Nagar (Demo Address)', city: 'Jaipur', pincode: '302021' },
  },
  {
    id: 'demo-order-1003',
    order_number: 'JN-DEMO-1003',
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    items: [{ name: 'Chicken Tikka', quantity: 1 }],
    total_amount: 299,
    status: 'delivered',
    delivery_address: { line1: 'Malviya Nagar (Demo Address)', city: 'Jaipur', pincode: '302017' },
  },
];

const devMockAdapter: AxiosAdapter = async (config) => {
  const url = (config.url || '').split('?')[0];
  const method = (config.method || 'get').toUpperCase();
  let data: any = { success: true };

  if (url.endsWith('/food/partner/restaurant') && method === 'GET') {
    data = demoProfile;
  } else if (url.endsWith('/food/partner/dashboard') && method === 'GET') {
    data = { today_orders: 12, today_revenue: 4280, pending_orders: 1, active_menu_items: 4, is_open: true, is_accepting_orders: true };
  } else if (url.endsWith('/food/partner/orders') && method === 'GET') {
    data = { orders: demoOrders };
  } else if (url.endsWith('/food/partner/categories') && method === 'GET') {
    data = { categories: demoCategories };
  } else if (url.endsWith('/food/partner/menu-items') && method === 'GET') {
    data = { items: demoCategories.flatMap(category => category.items) };
  } else if (url.endsWith('/admin/stats') && method === 'GET') {
    data = { total_users: 128, pending_approvals: 4, active_partners: 18, suspended_users: 1, customers: 96, stores: 8, restaurants: 10, delivery_agents: 12 };
  } else if (url.includes('/orders') && method === 'GET') {
    data = { orders: demoOrders };
  } else if (url.includes('/categories') && method === 'GET') {
    data = { categories: demoCategories };
  }

  // All mock writes are local no-ops. They never reach the real Jinni backend.
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // The development demo account uses an in-memory mock adapter instead of
  // sending requests to the real API with a fake bearer token.
  if (import.meta.env.DEV && token === DEV_MOCK_TOKEN) {
    config.adapter = devMockAdapter;
  }

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
