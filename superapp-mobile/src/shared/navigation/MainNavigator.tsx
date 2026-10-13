import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';

// Screens
import { CustomerHomeScreen } from '@modules/home/screens/CustomerHomeScreen';
import { UnifiedCartScreen } from '@modules/cart/screens/UnifiedCartScreen';
import { ProfileStack } from '@navigation/stacks/ProfileStack';
import { OrdersStack } from '@navigation/stacks/OrdersStack';

// Module Stacks
import { FoodStack } from '@navigation/stacks/FoodStack';
import { GroceryStack } from '@navigation/stacks/GroceryStack';
import { CabStack } from '@navigation/stacks/CabStack';
import { SalonStack } from '@navigation/stacks/SalonStack';

// Jinni — the elevated center "lamp" tab + its full-screen Chirag overlay.
// Per Jinni_UI_Rebrand_Spec section 4.2: Home | Orders | Jinni | Cart | Profile,
// with the lamp visually larger and floating above the bar line.
import { JinniLampButton } from '@modules/jinni/components/JinniLampButton';
import { ChiragOverlay } from '@modules/jinni/components/ChiragOverlay';
import { useJinniSession } from '@modules/jinni/hooks/useJinniSession';

// Types
export type MainTabParamList = {
  Home: undefined;
  Orders: undefined;
  Jinni: undefined;
  Cart: undefined;
  Profile: undefined;
};

/** Placeholder screen component for the Jinni tab — the tab itself never
 *  navigates anywhere (it's not a routed screen, per the spec's "do not
 *  create a second navigation system" rule); the custom tabBarButton below
 *  intercepts the press and opens the Chirag overlay instead. */
const JinniTabPlaceholder: React.FC = () => <View style={{ flex: 1 }} />;

const JinniTabBarButton: React.FC = () => {
  const { open, wishes } = useJinniSession();
  return (
    <JinniLampButton
      onPress={() => open('tabBar')}
      used={wishes.used}
      limit={wishes.limit}
      isExhausted={wishes.isExhausted}
    />
  );
};

export type MainStackParamList = {
  MainTabs: undefined;
  Food: undefined;
  Grocery: undefined;
  Cab: undefined;
  Salon: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

const TabBarIcon = ({ name, color }: { name: string; color: string }) => {
  return <Ionicons name={name as any} size={24} color={color} />;
};

const MainTabs: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary[500],
        tabBarInactiveTintColor: colors.gray[400],
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.gray[200],
          paddingTop: 8,
          paddingBottom: 8,
          height: 64,
        },
        tabBarLabelStyle: {
          fontFamily: typography.button.fontFamily,
          fontSize: 12,
          marginTop: 4,
        },
        tabBarIcon: ({ color }) => {
          let iconName: string;
          switch (route.name) {
            case 'Home':
              iconName = 'home';
              break;
            case 'Orders':
              iconName = 'receipt';
              break;
            case 'Cart':
              iconName = 'cart';
              break;
            case 'Profile':
              iconName = 'person';
              break;
            default:
              iconName = 'home';
          }
          return <TabBarIcon name={iconName} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={CustomerHomeScreen} />
      <Tab.Screen name="Orders" component={OrdersStack} />
      <Tab.Screen
        name="Jinni"
        component={JinniTabPlaceholder}
        options={{
          tabBarButton: () => <JinniTabBarButton />,
          tabBarLabel: () => null,
        }}
        listeners={{
          // Swallow default tab navigation — the lamp button itself opens
          // the Chirag overlay via useJinniSession, it never routes here.
          tabPress: (e) => e.preventDefault(),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={UnifiedCartScreen}
        options={{
          tabBarBadge: undefined, // Will be set dynamically via cart store
        }}
      />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
};

export const MainNavigator: React.FC = () => {
  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Food" component={FoodStack} />
        <Stack.Screen name="Grocery" component={GroceryStack} />
        <Stack.Screen name="Cab" component={CabStack} />
        <Stack.Screen name="Salon" component={SalonStack} />
      </Stack.Navigator>
      {/* Mounted once above the stack so Chirag can be summoned from any
          screen's "Order with Jinni" affordance, not just the tab bar. */}
      <ChiragOverlay />
    </>
  );
};

export default MainNavigator;
