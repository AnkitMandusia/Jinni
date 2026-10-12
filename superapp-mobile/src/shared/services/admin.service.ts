import { api } from './api';

export type PartnerStatus = 'pending_approval' | 'active' | 'suspended' | 'rejected';

export interface AdminUser {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  role: string;
  status: PartnerStatus;
  profile_complete: boolean;
  created_at: string;
  profile?: Record<string, string>;
}

export interface AdminStats {
  total_users: number;
  pending_approvals: number;
  active_partners: number;
  suspended_users: number;
  customers: number;
  stores: number;
  restaurants: number;
  delivery_agents: number;
}

export interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export const adminService = {
  getStats: (): Promise<AdminStats> =>
    api.get<AdminStats>('/admin/stats'),

  getUsers: (params?: {
    status?: PartnerStatus | 'all';
    role?: string;
    page?: number;
    page_size?: number;
  }): Promise<UsersResponse> =>
    api.get<UsersResponse>('/admin/users', { params }),

  approveUser: (userId: string): Promise<{ message: string }> =>
    api.post<{ message: string }>(`/admin/users/${userId}/approve`, {}),

  rejectUser: (
    userId: string,
    reason: string
  ): Promise<{ message: string }> =>
    api.post<{ message: string }>(`/admin/users/${userId}/reject`, { reason }),

  suspendUser: (userId: string): Promise<{ message: string }> =>
    api.post<{ message: string }>(`/admin/users/${userId}/suspend`, {}),

  getOrders: (params?: {
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ orders: any[]; total: number }> =>
    api.get<{ orders: any[]; total: number }>('/admin/orders', { params }),

  getDeliveryVerification: (orderId: string): Promise<DeliveryVerification> =>
    api.get<DeliveryVerification>(`/admin/orders/${orderId}/delivery-verification`),

  manualCompleteDelivery: (
    orderId: string,
    reason: string
  ): Promise<{ message: string; status: string }> =>
    api.post<{ message: string; status: string }>(
      `/admin/orders/${orderId}/manual-complete`,
      { reason }
    ),

  getDeliveryAuditLog: (params?: {
    page?: number;
    page_size?: number;
  }): Promise<{ entries: DeliveryAuditEntry[]; total: number }> =>
    api.get<{ entries: DeliveryAuditEntry[]; total: number }>(
      '/admin/orders/delivery-audit-log',
      { params }
    ),
};

export interface DeliveryVerification {
  order_id: string;
  order_number: string;
  status: string;
  customer_phone_hint: string | null;
  delivery_agent_id: string | null;
  delivery_agent_name: string | null;
  otp_active: boolean;
  channel_status: string | null; // sending | whatsapp_sent | whatsapp_delivered | sms_sent | failed
  whatsapp_status: string | null;
  sms_status: string | null;
  failure_reason: string | null;
  expires_in: number | null;
  manual_complete_available: boolean;
  delivered_at: string | null;
  manual_complete_history: {
    admin_id: string;
    reason: string;
    previous_status: string;
    new_status: string;
    created_at: string;
  }[];
}

export interface DeliveryAuditEntry {
  id: string;
  order_id: string;
  order_number: string;
  admin_id: string;
  admin_phone: string | null;
  previous_status: string;
  new_status: string;
  reason: string;
  completion_method: string;
  created_at: string;
}
