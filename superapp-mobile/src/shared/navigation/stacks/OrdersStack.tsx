import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OrderHistoryScreen } from '@modules/orders/screens/OrderHistoryScreen';
import { OrderTrackingScreen } from '@modules/orders/screens/OrderTrackingScreen';

// Wraps the "Orders" tab so tapping an order in the list can push a real
// detail page (Zomato/Blinkit style) instead of only expanding inline.
// Reuses the shared OrderTrackingScreen — moduleType just picks the accent
// colour and the pickup-point label ("Store" vs "Restaurant"); the screen
// itself is order-type agnostic.
export type OrdersStackParamList = {
  OrderHistory: undefined;
  OrderTracking: { orderId: string; moduleType?: 'food' | 'grocery' };
};

const Stack = createNativeStackNavigator<OrdersStackParamList>();

export const OrdersStack: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} />
      <Stack.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{ headerShown: true, title: 'Order Status', headerLeft: () => null }}
      />
    </Stack.Navigator>
  );
};

export default OrdersStack;
