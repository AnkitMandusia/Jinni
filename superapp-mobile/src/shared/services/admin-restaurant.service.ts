import { api } from './api';

export type RestaurantAdminState = 'all' | 'pending' | 'verified' | 'rejected' | 'inactive';

export interface AdminRestaurant {
  id: string;
  owner_id: string;
  owner_name?: string | null;
  owner_phone: string;
  name: string;
  slug: string;
  description?: string | null;
  cuisines: string[];
  tags: string[];
  logo_url?: string | null;
  cover_image_url?: string | null;
  gallery: string[];
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  pure_veg: boolean;
  fssai_license?: string | null;
  gstin?: string | null;
  is_open: boolean;
  is_accepting_orders: boolean;
  is_active: boolean;
  is_verified: boolean;
  owner_status: string;
  created_at: string;
  updated_at: string;
}

export const adminRestaurantService = {
  list: (params?: { state?: RestaurantAdminState; search?: string; page?: number; page_size?: number }) =>
    api.get<{ restaurants: AdminRestaurant[]; total: number }>('/admin/restaurants', { params }),
  get: (id: string) => api.get<AdminRestaurant>(`/admin/restaurants/${id}`),
  update: (id: string, body: Record<string, any>) => api.patch<AdminRestaurant>(`/admin/restaurants/${id}`, body),
  verify: (id: string) => api.post<AdminRestaurant>(`/admin/restaurants/${id}/verify`, {}),
  reject: (id: string) => api.post<AdminRestaurant>(`/admin/restaurants/${id}/reject`, {}),
  activate: (id: string) => api.post<AdminRestaurant>(`/admin/restaurants/${id}/activate`, {}),
  deactivate: (id: string) => api.post<AdminRestaurant>(`/admin/restaurants/${id}/deactivate`, {}),
  uploadImage: (id: string, file: any, kind: 'logo' | 'cover' | 'gallery') => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ image_url: string }>(`/admin/restaurants/${id}/upload-image?kind=${kind}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
