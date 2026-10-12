/**
 * Partner navigator: delivery role gets full dashboard, others get placeholder.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { IncomingOrderAlert } from '@modules/delivery/components/IncomingOrderAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { useAuthStore } from '@auth/store/authStore';

import { DeliveryDashboardScreen } from '@modules/delivery/screens/DeliveryDashboardScreen';
import { DeliveryOrdersScreen } from '@modules/delivery/screens/DeliveryOrdersScreen';
import { DeliveryEarningsScreen } from '@modules/delivery/screens/DeliveryEarningsScreen';
import { DeliveryActiveOrderScreen } from '@modules/delivery/screens/DeliveryActiveOrderScreen';
import { DeliveryProfileScreen } from '@modules/delivery/screens/DeliveryProfileScreen';
import { RestaurantNavigator } from '@navigation/RestaurantNavigator';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const DELIVERY_COLOR = '#10B981';

const ROLE_CONFIG: Record<string, { title: string; icon: string; color: string }> = {
  restaurant: { title: 'Restaurant', icon: 'restaurant', color: '#FF6B35' },
  delivery:   { title: 'Delivery Agent', icon: 'bicycle', color: DELIVERY_COLOR },
  cab_driver: { title: 'Cab Driver', icon: 'car', color: '#2196F3' },
  salon:      { title: 'Salon', icon: 'cut', color: '#9C27B0' },
};

// ── Delivery-specific tab navigator ─────────────────────────────────────────

const DeliveryTabs: React.FC = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: DELIVERY_COLOR,
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
    }}
  >
    <Tab.Screen
      name="Dashboard"
      component={DeliveryDashboardScreen}
      options={{
        tabBarLabel: 'Dashboard',
        tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
      }}
    />
    <Tab.Screen
      name="Orders"
      component={DeliveryOrdersScreen}
      options={{
        tabBarLabel: 'Orders',
        tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" size={size} color={color} />,
      }}
    />
    <Tab.Screen
      name="Earnings"
      component={DeliveryEarningsScreen}
      options={{
        tabBarLabel: 'Earnings',
        tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size} color={color} />,
      }}
    />
    <Tab.Screen
      name="Profile"
      component={DeliveryProfileScreen}
      options={{
        tabBarLabel: 'Profile',
        tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
      }}
    />
  </Tab.Navigator>
);

// Stack wraps tabs + ActiveOrder (no bottom bar).
// IncomingOrderAlert renders a Modal so it overlays any screen.
const DeliveryNavigator: React.FC = () => (
  <View style={{ flex: 1 }}>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DeliveryTabs" component={DeliveryTabs} />
      <Stack.Screen name="ActiveOrder" component={DeliveryActiveOrderScreen} />
    </Stack.Navigator>
    <IncomingOrderAlert />
  </View>
);

// ── Generic placeholder for other roles ──────────────────────────────────────

const PartnerHomeScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const role = user?.role ?? 'store';
  const config = ROLE_CONFIG[role] ?? { title: 'Partner', icon: 'briefcase', color: colors.primary[500] };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.iconBg, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon as any} size={40} color={config.color} />
        </View>
        <Text style={styles.title}>{config.title} Dashboard</Text>
        <Text style={styles.subtitle}>Welcome, {user?.name ?? 'Partner'}</Text>
        <View style={styles.activeBadge}>
          <Text style={styles.activeText}>Account Active</Text>
        </View>
      </View>
      <View style={styles.placeholder}>
        <Ionicons name="construct-outline" size={48} color={colors.gray[300]} />
        <Text style={styles.comingSoon}>Dashboard Coming Soon</Text>
        <Text style={styles.comingSoonSub}>
          Full {config.title} features are being built.{'\n'}
          Your account is approved and ready.
        </Text>
      </View>
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Ionicons name="log-out-outline" size={18} color={colors.error.DEFAULT} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const GenericPartnerNavigator: React.FC = () => {
  const { user } = useAuthStore();
  const role = user?.role ?? 'store';
  const config = ROLE_CONFIG[role] ?? { title: 'Partner', icon: 'briefcase', color: colors.primary[500] };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: config.color,
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
      }}
    >
      <Tab.Screen
        name="Home"
        component={PartnerHomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name={config.icon as any} size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Orders"
        children={() => (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.gray[400] }}>Orders — Coming Soon</Text>
          </View>
        )}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

// ── Root export ───────────────────────────────────────────────────────────────

export const PartnerNavigator: React.FC = () => {
  const { user } = useAuthStore();
  if (user?.role === 'delivery') {
    return <DeliveryNavigator />;
  }
  if (user?.role === 'restaurant') {
    return <RestaurantNavigator />;
  }
  return <GenericPartnerNavigator />;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { alignItems: 'center', padding: spacing.xxxxl, paddingBottom: spacing.xxl },
  iconBg: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.xs },
  subtitle: { fontSize: 15, color: colors.gray[500], marginBottom: spacing.md },
  activeBadge: {
    backgroundColor: colors.success.light,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
  },
  activeText: { fontSize: 12, fontWeight: '700', color: colors.success.dark },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  comingSoon: { fontSize: 18, fontWeight: '600', color: colors.gray[500], marginTop: spacing.lg, marginBottom: spacing.sm },
  comingSoonSub: { fontSize: 14, color: colors.gray[400], textAlign: 'center', lineHeight: 20 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, padding: spacing.xl, marginBottom: spacing.xl,
  },
  logoutText: { fontSize: 15, color: colors.error.DEFAULT, fontWeight: '600' },
});

export default PartnerNavigator;
