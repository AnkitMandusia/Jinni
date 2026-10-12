import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AdminDashboardScreen } from '@modules/admin/screens/AdminDashboardScreen';
import { UserManagementScreen } from '@modules/admin/screens/UserManagementScreen';
import { AdminOrdersScreen } from '@modules/admin/screens/AdminOrdersScreen';
import { AdminProductsScreen } from '@modules/admin/screens/AdminProductsScreen';
import { AdminRestaurantsScreen } from '@modules/admin/screens/AdminRestaurantsScreen';
import { AddProductScreen } from '@modules/grocery/screens/AddProductScreen';
import { DeliveryVerificationScreen } from '@modules/admin/screens/DeliveryVerificationScreen';
import { colors } from '@theme/colors';

export type AdminTabParamList = {
  Dashboard: undefined;
  Users: undefined;
  AdminOrders: undefined;
  AdminProducts: undefined;
  AdminRestaurants: undefined;
};

export type AdminStackParamList = {
  AdminTabs: undefined;
  AddProduct: { adminMode?: boolean };
  DeliveryVerification: { orderId: string; orderNumber?: string };
};

const Tab = createBottomTabNavigator<AdminTabParamList>();
const Stack = createNativeStackNavigator<AdminStackParamList>();

const AdminTabs: React.FC = () => (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: colors.gray[400],
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.gray[200],
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
          const icons: Record<string, { active: IoniconName; inactive: IoniconName }> = {
            Dashboard: { active: 'grid', inactive: 'grid-outline' },
            Users: { active: 'people', inactive: 'people-outline' },
            AdminOrders: { active: 'receipt', inactive: 'receipt-outline' },
            AdminProducts: { active: 'cube', inactive: 'cube-outline' },
            AdminRestaurants: { active: 'restaurant', inactive: 'restaurant-outline' },
          };
          const iconSet = icons[route.name] ?? icons.Dashboard;
          const iconName: IoniconName = focused ? iconSet.active : iconSet.inactive;
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} options={{ tabBarLabel: 'Dashboard' }} />
      <Tab.Screen name="Users" component={UserManagementScreen} options={{ tabBarLabel: 'Users' }} />
      <Tab.Screen name="AdminOrders" component={AdminOrdersScreen} options={{ tabBarLabel: 'Orders' }} />
      <Tab.Screen name="AdminProducts" component={AdminProductsScreen} options={{ tabBarLabel: 'Products' }} />
      <Tab.Screen name="AdminRestaurants" component={AdminRestaurantsScreen} options={{ tabBarLabel: 'Restaurants' }} />
    </Tab.Navigator>
);

export const AdminNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="AdminTabs" component={AdminTabs} />
    <Stack.Screen name="AddProduct" component={AddProductScreen} />
    <Stack.Screen name="DeliveryVerification" component={DeliveryVerificationScreen} />
  </Stack.Navigator>
);

export default AdminNavigator;
