import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GroceryStoreListScreen } from '@modules/grocery/screens/GroceryStoreListScreen';
import { CategoryScreen } from '@modules/grocery/screens/CategoryScreen';
import { ProductListScreen } from '@modules/grocery/screens/ProductListScreen';
import { ProductDetailScreen } from '@modules/grocery/screens/ProductDetailScreen';
import { GroceryCartScreen } from '@modules/grocery/screens/GroceryCartScreen';
import { GroceryCheckoutScreen } from '@modules/grocery/screens/GroceryCheckoutScreen';
import { OrderTrackingScreen } from '@modules/orders/screens/OrderTrackingScreen';

export type GroceryStackParamList = {
  GroceryStores: undefined;
  StoreCategories: { storeId: string; storeName: string };
  ProductList: { categoryId: string; categoryName: string; storeId: string; storeName: string };
  ProductDetail: { productId: string; storeId: string };
  GroceryCart: undefined;
  GroceryCheckout: { items: any[] };
  OrderTracking: { orderId: string; moduleType?: 'grocery' };
};

const Stack = createNativeStackNavigator<GroceryStackParamList>();

export const GroceryStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="GroceryStores" component={GroceryStoreListScreen} />
      <Stack.Screen name="StoreCategories" component={CategoryScreen} />
      <Stack.Screen name="ProductList" component={ProductListScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="GroceryCart" component={GroceryCartScreen} />
      <Stack.Screen name="GroceryCheckout" component={GroceryCheckoutScreen} />
      <Stack.Screen
        name="OrderTracking"
        component={OrderTrackingScreen}
        options={{ headerShown: true, title: 'Order Status', headerLeft: () => null }}
      />
    </Stack.Navigator>
  );
};

export default GroceryStack;
