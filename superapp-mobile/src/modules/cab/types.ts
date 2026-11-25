export type RideStatus = 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
export type PayMethod = 'cash' | 'upi';

export interface RidePoint {
  text: string;
  lat: number;
  lng: number;
  maps_url?: string;
}

export interface RidePerson {
  id?: string;
  name?: string | null;
  phone?: string | null;
  vehicle_type?: string | null;
  rating?: number | null;
}

export interface Ride {
  id: string;
  ride_number: string;
  status: RideStatus;
  pickup: RidePoint;
  drop: RidePoint;
  distance_km: number;
  fare: number;
  fare_adjusted_reason?: string | null;
  note?: string | null;
  payment_method: PayMethod;
  payment_status: 'pending' | 'paid';
  payment_ref?: string | null;
  paid_at?: string | null;
  requested_at?: string | null;
  completed_at?: string | null;
  cancel_reason?: string | null;
  rider: RidePerson | null;
  customer: RidePerson | null;
  upi?: { vpa: string; link: string };
}

export interface RidePlace {
  id: string;
  name: string;
  area?: string | null;
  icon?: string | null;
  lat: number;
  lng: number;
}

export interface RideConfig {
  enabled: boolean;
  riders_online: number;
  min_fare: number;
  max_distance_km: number;
  places: RidePlace[];
}

export const CLOSED: RideStatus[] = ['completed', 'cancelled', 'expired'];
export const isClosed = (s: RideStatus) => CLOSED.includes(s);
