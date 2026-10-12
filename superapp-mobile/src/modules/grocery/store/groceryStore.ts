import { createStore } from '@store/useStore';
import { api } from '@services/api';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  image_url?: string;
  product_count: number;
  parent_id?: string;
  is_active: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  mrp?: number;
  unit: string;
  primary_image_url?: string;
  image_urls?: string[];
  is_in_stock: boolean;
  discount_percentage?: number;
  category_id: string;
  category_name?: string;
  tags?: string[];
}

interface GroceryState {
  categories: Category[];
  selectedCategory: Category | null;
  products: Product[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
}

interface GroceryActions {
  fetchCategories: (storeId?: string) => Promise<void>;
  fetchProducts: (params?: { categoryId?: string; search?: string; storeId?: string }) => Promise<void>;
  selectCategory: (category: Category | null) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

const initialState: GroceryState = {
  categories: [],
  selectedCategory: null,
  products: [],
  searchQuery: '',
  isLoading: false,
  error: null,
};

export const useGroceryStore = createStore<GroceryState & GroceryActions>('grocery-store', (set) => ({
  ...initialState,

  fetchCategories: async (storeId?: string) => {
    try {
      set({ isLoading: true, error: null });
      const params: any = {};
      if (storeId) params.store_id = storeId;
      const data = await api.get('/grocery/categories', { params });
      const items = data?.items || data || [];
      set({ categories: items, isLoading: false });
    } catch (error: any) {
      console.error('[GroceryStore] fetchCategories error:', error);
      set({ 
        error: error?.message || 'Failed to fetch categories', 
        isLoading: false 
      });
    }
  },

  fetchProducts: async (params) => {
    try {
      set({ isLoading: true, error: null });
      const apiParams: any = {};
      if (params?.categoryId) apiParams.category_id = params.categoryId;
      if (params?.search) apiParams.search = params.search;
      if (params?.storeId) apiParams.store_id = params.storeId;
      
      const data = await api.get('/grocery/products', { params: apiParams });
      const items = data?.items || data || [];
      set({ products: items, isLoading: false });
    } catch (error: any) {
      console.error('[GroceryStore] fetchProducts error:', error);
      set({ 
        error: error?.message || 'Failed to fetch products', 
        isLoading: false 
      });
    }
  },

  selectCategory: (category) => {
    set({ selectedCategory: category });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  clearError: () => set({ error: null }),
}));

export default useGroceryStore;
