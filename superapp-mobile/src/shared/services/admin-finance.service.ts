import { api } from './api';

export interface FinanceOverview {
  days: number; gmv: number; revenue: number; tax_collected: number;
  revenue_breakdown: Record<string, number>;
  by_method: Record<string, number>;
  owed: { to_sellers: number; to_riders: number; cash_with_riders: number };
  online_paid: number; wallet_used: number;
  refunds_pending: { count: number; amount: number };
  movements: { paid_out: number; deposits_received: number };
  counts: { orders: number; rides: number };
  rates: { food: number; grocery: number; rider_share: number; ride: number };
}
export interface FinanceParty {
  user_id: string; role: 'restaurant' | 'store' | 'delivery'; name: string; phone?: string; upi?: string | null;
  bank_account?: string | null; bank_ifsc?: string | null; payout_ready: boolean;
  earned: number; holds: number; paid_out: number; received_in: number; payable: number; jobs: number;
}
export interface AdminStore {
  user_id: string; store_name: string; owner_name: string; phone: string; account_status: string; is_open: boolean;
  city?: string; pincode?: string; address?: string; gstin?: string; fssai?: string; upi_id?: string; bank_account?: string;
  checks: { key: string; label: string; ok: boolean; required: boolean }[]; ready: boolean;
  orders: number; delivered: number; cancelled: number; sales: number; products: number; low_stock: number; out_of_stock: number;
  payable: number; rating?: number | null;
}

export const adminFinanceService = {
  overview: (days: number) => api.get<FinanceOverview>('/admin/finance/overview', { params: { days } }),
  parties: (role?: string) => api.get<{ parties: FinanceParty[]; min_payout: number }>('/admin/finance/parties', { params: role ? { role } : {} }),
  record: (payload: Record<string, unknown>) => api.post('/admin/finance/entries', payload),
  stores: (state: string) => api.get<{ stores: AdminStore[]; counts: Record<string, number> }>('/admin/stores', { params: { state } }),
  storeAction: (id: string, action: 'verify' | 'reject' | 'suspend' | 'reactivate') => api.post(`/admin/stores/${id}/${action}`),
};
