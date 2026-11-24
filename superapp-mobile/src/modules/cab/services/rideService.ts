import { api } from '@services/api';
import { Availability, PayMethod, Quote, Ride, RideConfig, RidePoint, VehicleClass } from '../types';

type Pt = Pick<RidePoint, 'text' | 'lat' | 'lng'>;

/** Best human-readable message from an axios error (FastAPI detail may be a string or {message}). */
export function rideError(e: any, fallback = 'Something went wrong. Please try again.'): string {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  if (d?.message) return d.message;
  if (!e?.response) return 'Cannot reach the server. Check your connection.';
  return fallback;
}

export const rideService = {
  config: (lat?: number, lng?: number) =>
    api.get<RideConfig>('/rides/config', { params: lat != null && lng != null ? { lat, lng } : undefined }),
  estimate: (pickup: Pt, drop: Pt, vehicle_class: VehicleClass) =>
    api.post<Quote>('/rides/estimate', { pickup, drop, vehicle_class }),
  book: (p: { pickup: Pt; drop: Pt; vehicle_class: VehicleClass; payment_method: PayMethod; expected_fare: number; note?: string }) =>
    api.post<Ride>('/rides', p),
  availability: (lat: number, lng: number) => api.get<Availability>('/rides/availability', { params: { lat, lng } }),
  boost: (id: string, amount: number) => api.post<Ride>(`/rides/${id}/boost`, { amount }),
  rate: (id: string, rating: number, comment?: string) => api.post<Ride>(`/rides/${id}/rate`, { rating, comment }),
  sos: (id: string, body: { lat?: number; lng?: number; note?: string }) =>
    api.post<{ ok: boolean; helpline: string; message: string }>(`/rides/${id}/sos`, body),
  dues: () => api.get<{ total: number; info: string; items: { ride_id: string; ride_number: string; fee: number; date: string | null; reason: string; route: string }[] }>('/rides/dues'),
  searchPlaces: (q: string, lat?: number, lng?: number) =>
    api.get<{ results: { text: string; subtitle?: string; lat: number; lng: number }[] }>('/rides/places/search', { params: { q, lat, lng } }),
  active: () => api.get<{ ride: Ride | null }>('/rides/active'),
  my: (page = 1) => api.get<{ rides: Ride[] }>('/rides/my', { params: { page } }),
  get: (id: string) => api.get<Ride>(`/rides/${id}`),
  cancel: (id: string, reason_code?: string, reason?: string) => api.post<Ride>(`/rides/${id}/cancel`, { reason_code, reason }),

  // rider (existing delivery partner)
  riderAvailable: () => api.get<{ rides: Ride[]; busy: boolean; blocked_reason?: string | null; online?: boolean }>('/rides/rider/available'),
  riderActive: () => api.get<{ ride: Ride | null }>('/rides/rider/active'),
  riderHistory: (page = 1) =>
    api.get<{ rides: Ride[]; page_totals: { completed: number; fare: number; cash: number; upi: number; unpaid: number } }>(
      '/rides/rider/history', { params: { page } }),
  accept: (id: string) => api.post<Ride>(`/rides/rider/${id}/accept`),
  reject: (id: string) => api.post(`/rides/rider/${id}/reject`),
  release: (id: string, reason?: string) => api.post(`/rides/rider/${id}/release`, { reason }),
  riderLocation: (lat: number, lng: number) => api.post('/rides/rider/location', { lat, lng }),
  arrived: (id: string) => api.post<Ride>(`/rides/rider/${id}/arrived`),
  start: (id: string, code: string) => api.post<Ride>(`/rides/rider/${id}/start`, { code }),
  complete: (id: string, payment_received: boolean) =>
    api.post<Ride>(`/rides/rider/${id}/complete`, { payment_received }),
  confirmPayment: (id: string, payment_ref?: string) =>
    api.post<Ride>(`/rides/rider/${id}/confirm-payment`, { payment_ref }),
};
