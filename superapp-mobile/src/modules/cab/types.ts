export type RideStatus = 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
export type PayMethod = 'cash' | 'upi';
export type VehicleClass = 'bike' | 'auto' | 'cab';

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
  vehicle_class?: VehicleClass | null;
  vehicle_number?: string | null;
  vehicle_make_model?: string | null;
  vehicle_color?: string | null;
  rating?: number | null;
  rating_count?: number;
}

export interface RiderLocation {
  to: 'pickup' | 'drop';
  distance_km: number;
  eta_min: number;
  age_seconds: number;
  progress?: number;
}

export interface Ride {
  id: string;
  ride_number: string;
  status: RideStatus;
  pickup: RidePoint;
  drop: RidePoint;
  vehicle_class: VehicleClass;
  distance_km: number;
  fare: number;
  surge_multiplier: number;
  boost_amount: number;
  dues_amount: number;
  total_payable: number;
  start_code?: string;
  cancel_info?: { fee: number; note: string; free: boolean };
  cancellation_fee: number;
  fee_waived?: boolean;
  rating?: number | null;
  rating_comment?: string | null;
  rider_location?: RiderLocation;
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

export interface VehicleInfo {
  vehicle_class: VehicleClass;
  label: string;
  enabled: boolean;
  riders_online: number;
  min_fare: number;
  surge_multiplier: number;
  surge_reason?: string | null;
}

export interface RideConfig {
  enabled: boolean;
  vehicles: VehicleInfo[];
  riders_online: number;
  max_distance_km: number;
  boost_options: number[];
  cancel_reasons: { code: string; label: string; rider_fault: boolean }[];
  sos_helpline: string;
  dues_total: number;
  service_area: { lat: number; lng: number; radius_km: number; inside: boolean | null } | null;
  places: (RidePlace & { distance_km?: number | null; category?: string | null })[];
}

export interface Quote {
  vehicle_class: VehicleClass;
  distance_km: number;
  fare: number;
  surge_multiplier: number;
  surge_reason?: string | null;
  base_fare_no_surge: number;
  dues_amount: number;
  total_payable: number;
}

export const CLOSED: RideStatus[] = ['completed', 'cancelled', 'expired'];
export const isClosed = (s: RideStatus) => CLOSED.includes(s);
