import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RestaurantListScreen } from '@modules/food/screens/RestaurantListScreen';
import { RestaurantDetailScreen } from '@modules/food/screens/RestaurantDetailScreen';
import { MenuItemDetailScreen } from '@modules/food/screens/MenuItemDetailScreen';
import { FoodCartScreen } from '@modules/food/screens/FoodCartScreen';
import { OrderTrackingScreen } from '@modules/orders/screens/OrderTrackingScreen';
import { CheckoutScreen } from '@modules/food/screens/CheckoutScreen';

export type FoodStackParamList = {
  RestaurantList: undefined;
  RestaurantDetail: { restaurantId: string };
  MenuItemDetail: { restaurantId: string; itemId: string };
  FoodCart: undefined;
  Checkout: { restaurantId: string; items: any[] };
  OrderTracking: { orderId: string };
};

const Stack = createNativeStackNavigator<FoodStackParamList>();

export const FoodStack: React.FC = () => {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: true,
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="RestaurantList" 
        component={RestaurantListScreen}
        options={{ title: 'Restaurants' }}
      />
      <Stack.Screen 
        name="RestaurantDetail" 
        component={RestaurantDetailScreen}
        options={{ title: 'Menu' }}
      />
      <Stack.Screen 
        name="MenuItemDetail" 
        component={MenuItemDetailScreen}
        options={{ title: 'Item Details', presentation: 'modal' }}
      />
      <Stack.Screen 
        name="FoodCart" 
        component={FoodCartScreen}
        options={{ title: 'Your Cart' }}
      />
      <Stack.Screen 
        name="Checkout" 
        component={CheckoutScreen}
        options={{ title: 'Checkout' }}
      />
      <Stack.Screen 
        name="OrderTracking" 
        component={OrderTrackingScreen}
        options={{ title: 'Order Status', headerLeft: () => null }}
      />
    </Stack.Navigator>
  );
};

export default FoodStack;
