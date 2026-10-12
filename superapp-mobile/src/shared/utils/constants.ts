// API Constants
export const API_TIMEOUT = 30000;
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 1000;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Cache
export const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Location
export const DEFAULT_LOCATION = {
  lat: 12.9716,
  lng: 77.5946,
  city: 'Bangalore',
};

export const LOCATION_ACCURACY_THRESHOLD = 100; // meters

// Order Status
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

// Payment Methods
export const PAYMENT_METHODS = {
  RAZORPAY: 'razorpay',
  COD: 'cod',
  WALLET: 'wallet',
} as const;

// Module Types
export const MODULE_TYPES = {
  FOOD: 'food',
  GROCERY: 'grocery',
  CAB: 'cab',
  SALON: 'salon',
} as const;

// Time Slots
export const DELIVERY_SLOTS = [
  { label: 'Morning', time: '7:00 AM - 10:00 AM' },
  { label: 'Mid-day', time: '10:00 AM - 1:00 PM' },
  { label: 'Afternoon', time: '1:00 PM - 4:00 PM' },
  { label: 'Evening', time: '4:00 PM - 7:00 PM' },
  { label: 'Night', time: '7:00 PM - 10:00 PM' },
];

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Please check your internet connection',
  SERVER_ERROR: 'Something went wrong. Please try again.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please login again.',
  NOT_FOUND: 'The requested resource was not found.',
  VALIDATION_ERROR: 'Please check your input and try again.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  ORDER_PLACED: 'Your order has been placed successfully!',
  PAYMENT_SUCCESS: 'Payment completed successfully!',
  PROFILE_UPDATED: 'Profile updated successfully!',
  ADDRESS_ADDED: 'Address added successfully!',
  ITEM_ADDED_TO_CART: 'Item added to cart!',
};
