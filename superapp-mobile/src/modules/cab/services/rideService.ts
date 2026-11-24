import { api } from '@services/api';
import { PayMethod, Ride, RideConfig, RidePoint } from '../types';

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
  config: () => api.get<RideConfig>('/rides/config'),
  estimate: (pickup: Pt, drop: Pt) =>
    api.post<{ distance_km: number; fare: number }>('/rides/estimate', { pickup, drop }),
  book: (p: { pickup: Pt; drop: Pt; payment_method: PayMethod; expected_fare: number; note?: string }) =>
    api.post<Ride>('/rides', p),
  active: () => api.get<{ ride: Ride | null }>('/rides/active'),
  my: (page = 1) => api.get<{ rides: Ride[] }>('/rides/my', { params: { page } }),
  get: (id: string) => api.get<Ride>(`/rides/${id}`),
  cancel: (id: string, reason?: string) => api.post<Ride>(`/rides/${id}/cancel`, { reason }),

  // rider (existing delivery partner)
  riderAvailable: () => api.get<{ rides: Ride[]; busy: boolean }>('/rides/rider/available'),
  riderActive: () => api.get<{ ride: Ride | null }>('/rides/rider/active'),
  riderHistory: (page = 1) =>
    api.get<{ rides: Ride[]; page_totals: { completed: number; fare: number; cash: number; upi: number; unpaid: number } }>(
      '/rides/rider/history', { params: { page } }),
  accept: (id: string) => api.post<Ride>(`/rides/rider/${id}/accept`),
  reject: (id: string) => api.post(`/rides/rider/${id}/reject`),
  release: (id: string) => api.post(`/rides/rider/${id}/release`),
  arrived: (id: string) => api.post<Ride>(`/rides/rider/${id}/arrived`),
  start: (id: string) => api.post<Ride>(`/rides/rider/${id}/start`),
  complete: (id: string, payment_received: boolean) =>
    api.post<Ride>(`/rides/rider/${id}/complete`, { payment_received }),
  confirmPayment: (id: string, payment_ref?: string) =>
    api.post<Ride>(`/rides/rider/${id}/confirm-payment`, { payment_ref }),
};
