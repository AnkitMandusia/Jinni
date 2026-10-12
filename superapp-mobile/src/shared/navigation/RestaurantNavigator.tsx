/**
 * Restaurant partner navigator.
 *
 * Gate: a 'restaurant'-role account has no Restaurant row until they finish
 * onboarding (POST /food/partner/restaurant). We probe GET /food/partner/restaurant
 * once on mount — 404 means "needs setup", anything else means "go to tabs".
 */
import React, { useCallback, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { api } from '@services/api';

import { RestaurantSetupScreen } from '@modules/food/screens/partner/RestaurantSetupScreen';
import { RestaurantDashboardScreen } from '@modules/food/screens/partner/RestaurantDashboardScreen';
import { RestaurantOrdersScreen } from '@modules/food/screens/partner/RestaurantOrdersScreen';
import { RestaurantMenuScreen } from '@modules/food/screens/partner/RestaurantMenuScreen';
import { RestaurantProfileScreen } from '@modules/food/screens/partner/RestaurantProfileScreen';
import { AddEditMenuItemScreen } from '@modules/food/screens/partner/AddEditMenuItemScreen';

const FOOD = colors.food?.primary || '#FF6B6B';

export type RestaurantTabParamList = {
  Dashboard: undefined;
  Orders: undefined;
  Menu: undefined;
  Profile: undefined;
};

export type RestaurantStackParamList = {
  RestaurantTabs: undefined;
  AddEditMenuItem: { itemId?: string; categoryId?: string };
};

const Tab = createBottomTabNavigator<RestaurantTabParamList>();
const Stack = createNativeStackNavigator<RestaurantStackParamList>();

const RestaurantTabs: React.FC = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: FOOD,
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
          Orders: { active: 'receipt', inactive: 'receipt-outline' },
          Menu: { active: 'restaurant', inactive: 'restaurant-outline' },
          Profile: { active: 'storefront', inactive: 'storefront-outline' },
        };
        const set = icons[route.name] ?? icons.Dashboard;
        return <Ionicons name={focused ? set.active : set.inactive} size={size} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Dashboard" component={RestaurantDashboardScreen} />
    <Tab.Screen name="Orders" component={RestaurantOrdersScreen} />
    <Tab.Screen name="Menu" component={RestaurantMenuScreen} />
    <Tab.Screen name="Profile" component={RestaurantProfileScreen} />
  </Tab.Navigator>
);

export const RestaurantNavigator: React.FC = () => {
  const [checking, setChecking] = useState(true);
  const [hasRestaurant, setHasRestaurant] = useState(false);

  const check = useCallback(() => {
    api
      .get('/food/partner/restaurant')
      .then(() => setHasRestaurant(true))
      .catch(() => setHasRestaurant(false))
      .finally(() => setChecking(false));
  }, []);

  // Re-check whenever this navigator regains focus — covers the case where
  // the user just finished onboarding and we need to swap to the tabs.
  useFocusEffect(
    useCallback(() => {
      check();
    }, [check])
  );

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator size="large" color={FOOD} />
      </View>
    );
  }

  if (!hasRestaurant) {
    return <RestaurantSetupScreen onCreated={() => setHasRestaurant(true)} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="RestaurantTabs" component={RestaurantTabs} />
      <Stack.Screen name="AddEditMenuItem" component={AddEditMenuItemScreen} />
    </Stack.Navigator>
  );
};

export default RestaurantNavigator;
