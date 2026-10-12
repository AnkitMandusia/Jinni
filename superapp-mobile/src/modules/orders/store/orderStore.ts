import { createPersistedStore } from '@store/useStore';
import { ModuleType } from '@modules/moduleRegistry';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'in_transit'
  | 'arrived'
  | 'completed'
  | 'cancelled';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  unit?: string;
  imageUrl?: string;
}

export interface Order {
  id: string;
  moduleType: ModuleType;
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  tax: number;
  grandTotal: number;
  address: {
    label: string;
    fullAddress: string;
    lat?: number;
    lng?: number;
  };
  paymentMethod: 'cash' | 'online' | 'wallet';
  createdAt: string;
  estimatedDelivery?: string;
  // Module-specific fields
  restaurantName?: string; // For food
  driverInfo?: {
    name: string;
    phone: string;
    vehicleNumber: string;
    rating: number;
  }; // For cab
  salonName?: string; // For salon
  bookingTime?: string; // For salon
}

interface OrderState {
  orders: Order[];
  activeOrder: Order | null;
}

interface OrderActions {
  createOrder: (order: Omit<Order, 'id' | 'createdAt' | 'status'>) => Order;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  setActiveOrder: (order: Order | null) => void;
  getOrdersByModule: (moduleType: ModuleType) => Order[];
  getActiveOrders: () => Order[];
  clearActiveOrder: () => void;
}

const initialState: OrderState = {
  orders: [],
  activeOrder: null,
};

export const useOrderStore = createPersistedStore<OrderState & OrderActions>(
  'order-store',
  initialState,
  (set, get) => ({
    createOrder: (orderData) => {
      const newOrder: Order = {
        ...orderData,
        id: `ORD${Date.now()}`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      set({
        orders: [newOrder, ...get().orders],
        activeOrder: newOrder,
      });
      return newOrder;
    },

    updateOrderStatus: (orderId, status) => {
      const { orders, activeOrder } = get();
      const updatedOrders = orders.map((o) =>
        o.id === orderId ? { ...o, status } : o
      );
      set({
        orders: updatedOrders,
        activeOrder:
          activeOrder?.id === orderId
            ? { ...activeOrder, status }
            : activeOrder,
      });
    },

    setActiveOrder: (order) => {
      set({ activeOrder: order });
    },

    getOrdersByModule: (moduleType) => {
      return get().orders.filter((o) => o.moduleType === moduleType);
    },

    getActiveOrders: () => {
      return get().orders.filter((o) =>
        ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'in_transit'].includes(o.status)
      );
    },

    clearActiveOrder: () => {
      set({ activeOrder: null });
    },
  })
);

export default useOrderStore;
