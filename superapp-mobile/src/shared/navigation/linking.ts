import { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<any> = {
  prefixes: ['superapp://', 'https://superapp.com'],
  config: {
    screens: {
      Auth: {
        screens: {
          Splash: 'splash',
          Login: 'login',
          OTPVerify: 'verify',
        },
      },
      Main: {
        screens: {
          MainTabs: {
            screens: {
              Home: 'home',
              Orders: 'orders',
              Cart: 'cart',
              Profile: 'profile',
            },
          },
          Food: {
            screens: {
              RestaurantList: 'food/restaurants',
              RestaurantDetail: 'food/restaurant/:restaurantId',
              MenuItemDetail: 'food/item/:itemId',
              OrderTracking: 'food/track/:orderId',
            },
          },
          Grocery: {
            screens: {
              Categories: 'grocery',
              ProductList: 'grocery/category/:categoryId',
              ProductDetail: 'grocery/product/:productId',
            },
          },
          Cab: {
            screens: {
              RideHome: 'cab',
              ActiveRide: 'cab/ride/:rideId',
            },
          },
          Salon: {
            screens: {
              SalonList: 'salon',
              ServiceSelect: 'salon/:salonId/services',
              SlotBooking: 'salon/book',
              BookingConfirm: 'salon/confirm/:bookingId',
            },
          },
        },
      },
    },
  },
};

export default linking;
