import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { StoreDashboardScreen } from '@modules/store/screens/StoreDashboardScreen';
import { StoreOrdersScreen } from '@modules/store/screens/StoreOrdersScreen';
import { StoreProductsScreen } from '@modules/store/screens/StoreProductsScreen';
import { StoreProfileScreen } from '@modules/store/screens/StoreProfileScreen';
import { StoreIncomingOrderAlert } from '@modules/store/components/StoreIncomingOrderAlert';
import { AddProductScreen } from '@modules/grocery/screens/AddProductScreen';

export type StoreTabParamList = {
  Dashboard: undefined;
  Orders: undefined;
  Products: undefined;
  Profile: undefined;
};

export type StoreStackParamList = {
  StoreTabs: undefined;
  AddProduct: { adminMode?: boolean };
};

const Tab = createBottomTabNavigator<StoreTabParamList>();
const Stack = createNativeStackNavigator<StoreStackParamList>();


const StoreTabs: React.FC = () => (
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
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      tabBarIcon: ({ focused, color, size }) => {
        type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
        const icons: Record<string, { active: IoniconName; inactive: IoniconName }> = {
          Dashboard: { active: 'grid', inactive: 'grid-outline' },
          Orders:    { active: 'receipt', inactive: 'receipt-outline' },
          Products:  { active: 'cube', inactive: 'cube-outline' },
          Profile:   { active: 'person', inactive: 'person-outline' },
        };
        const set = icons[route.name] ?? icons.Dashboard;
        return <Ionicons name={focused ? set.active : set.inactive} size={size} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Dashboard" component={StoreDashboardScreen} />
    <Tab.Screen name="Orders" component={StoreOrdersScreen} />
    <Tab.Screen name="Products" component={StoreProductsScreen} />
    <Tab.Screen name="Profile" component={StoreProfileScreen} />
  </Tab.Navigator>
);

// StoreIncomingOrderAlert renders a Modal so it overlays any tab screen.
const StoreTabsWithAlert: React.FC = () => (
  <View style={{ flex: 1 }}>
    <StoreTabs />
    <StoreIncomingOrderAlert />
  </View>
);

export const StoreNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="StoreTabs" component={StoreTabsWithAlert} />
    <Stack.Screen name="AddProduct" component={AddProductScreen} />
  </Stack.Navigator>
);

export default StoreNavigator;
