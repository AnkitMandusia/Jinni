import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily, typography } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { useAuthStore } from '@auth/store/authStore';
import { api } from '@services/api';

interface DashboardData {
  is_online: boolean;
  agent_name: string;
  vehicle_type: string;
  active_orders: ActiveOrder[];
  today_stats: {
    orders_count: number;
    earnings: number;
    cod_collected: number;
  };
}

interface ActiveOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  payment_method: string;
  delivery_fee: number;
  delivery_address: any;
  pickup_address: any;
  delivery_otp: string;
  items: Array<{ name: string; qty: number }>;
}

const STATUS_LABELS: Record<string, string> = {
  delivery_assigned: 'Head to Pickup',
  picked_up: 'En Route to Customer',
  in_transit: 'In Transit',
};

const STATUS_COLORS: Record<string, string> = {
  delivery_assigned: colors.warning.DEFAULT,
  picked_up: colors.info.DEFAULT,
  in_transit: '#8B5CF6',
};

export const DeliveryDashboardScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get<DashboardData>('/delivery/dashboard');
      setData(res);
    } catch (e: any) {
      console.error('Dashboard error:', e?.response?.data || e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard])
  );

  const handleToggleOnline = async (value: boolean) => {
    setToggling(true);
    try {
      await api.patch('/delivery/online', { is_online: value });
      setData(prev => prev ? { ...prev, is_online: value } : prev);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Failed to update status');
    } finally {
      setToggling(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const isOnline = data?.is_online ?? false;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.agentName}>{data?.agent_name ?? user?.name ?? 'Agent'}</Text>
            {data?.vehicle_type ? (
              <Text style={styles.vehicleType}>🏍️ {data.vehicle_type}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Logout', style: 'destructive', onPress: logout },
          ])}>
            <Ionicons name="log-out-outline" size={24} color={colors.gray[500]} />
          </TouchableOpacity>
        </View>

        {/* Online/Offline Toggle */}
        <View style={[styles.toggleCard, isOnline ? styles.toggleOnline : styles.toggleOffline]}>
          <View style={styles.toggleLeft}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.success.DEFAULT : colors.gray[500] }]} />
            <View>
              <Text style={styles.toggleTitle}>{isOnline ? 'You are Online' : 'You are Offline'}</Text>
              <Text style={styles.toggleSub}>
                {isOnline ? 'Ready to receive orders' : 'Go online to get assignments'}
              </Text>
            </View>
          </View>
          {toggling ? (
            <ActivityIndicator color={isOnline ? colors.success.DEFAULT : colors.gray[500]} />
          ) : (
            <Switch
              value={isOnline}
              onValueChange={handleToggleOnline}
              trackColor={{ false: colors.gray[300], true: colors.success.light }}
              thumbColor={isOnline ? colors.success.DEFAULT : colors.gray[400]}
            />
          )}
        </View>

        {/* Active Orders — show all, no limit */}
        {data?.active_orders && data.active_orders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Active Deliveries ({data.active_orders.length})
            </Text>
            {data.active_orders.map((order) => (
              <TouchableOpacity
                key={order.id}
                style={[styles.activeOrderCard, { borderLeftColor: STATUS_COLORS[order.status] ?? colors.primary[500], marginBottom: spacing.sm }]}
                onPress={() => navigation.navigate('ActiveOrder', { order })}
              >
                <View style={styles.activeOrderHeader}>
                  <Text style={styles.orderNumber}>#{order.order_number}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status] ?? colors.primary[500] }]}>
                    <Text style={styles.statusBadgeText}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.addressText} numberOfLines={1}>
                  📍 {order.delivery_address?.line1 ?? 'Delivery address'}
                </Text>
                <View style={styles.activeOrderFooter}>
                  <Text style={styles.orderAmount}>₹{order.total_amount.toFixed(0)}</Text>
                  <Text style={styles.paymentBadge}>{order.payment_method?.toUpperCase()}</Text>
                  <Text style={styles.tapHint}>Tap to open →</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Find Available Orders — always visible when online */}
        {isOnline && (
          <TouchableOpacity
            style={styles.findOrdersCard}
            onPress={() => navigation.navigate('Orders')}
          >
            <Ionicons name="search" size={32} color={colors.primary[500]} />
            <Text style={styles.findOrdersTitle}>Find Available Orders</Text>
            <Text style={styles.findOrdersSub}>Tap to browse orders ready for pickup</Text>
          </TouchableOpacity>
        )}

        {/* Today's Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Summary</Text>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderLeftColor: colors.primary[500] }]}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.primary[500]} />
              <Text style={styles.statValue}>{data?.today_stats?.orders_count ?? 0}</Text>
              <Text style={styles.statLabel}>Delivered</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: colors.success.DEFAULT }]}>
              <Ionicons name="cash-outline" size={22} color={colors.success.DEFAULT} />
              <Text style={styles.statValue}>₹{(data?.today_stats?.earnings ?? 0).toFixed(0)}</Text>
              <Text style={styles.statLabel}>Earnings</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: colors.warning.DEFAULT }]}>
              <Ionicons name="wallet-outline" size={22} color={colors.warning.DEFAULT} />
              <Text style={styles.statValue}>₹{(data?.today_stats?.cod_collected ?? 0).toFixed(0)}</Text>
              <Text style={styles.statLabel}>COD</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Orders')}>
              <Ionicons name="list-outline" size={28} color={colors.primary[500]} />
              <Text style={styles.actionLabel}>Available Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Earnings')}>
              <Ionicons name="bar-chart-outline" size={28} color={colors.success.DEFAULT} />
              <Text style={styles.actionLabel}>Earnings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  greeting: { ...typography.overline, color: colors.primary[600] },
  agentName: { ...typography.h4, color: colors.gray[900], marginTop: 2 },
  vehicleType: { ...typography.caption, color: colors.text.secondary, marginTop: 2 },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: spacing.xl,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  toggleOnline: { backgroundColor: colors.success.light, borderWidth: 1.5, borderColor: colors.success.DEFAULT },
  toggleOffline: { backgroundColor: colors.gray[100], borderWidth: 1.5, borderColor: colors.gray[200] },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  toggleTitle: { ...typography.h6, color: colors.gray[900] },
  toggleSub: { ...typography.caption, color: colors.text.secondary, marginTop: 2 },
  section: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  sectionTitle: { ...typography.overline, color: colors.text.muted, marginBottom: spacing.md },
  activeOrderCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderLeftWidth: 4,
  },
  activeOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  orderNumber: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.gray[900] },
  statusBadge: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusBadgeText: { color: colors.white, fontSize: 11, fontFamily: fontFamily.bold },
  addressText: { fontSize: 13, color: colors.gray[500], marginBottom: spacing.sm },
  activeOrderFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  orderAmount: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.gray[900] },
  paymentBadge: { fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.gray[400] },
  tapHint: { marginLeft: 'auto', fontSize: 12, color: colors.primary[500], fontFamily: fontFamily.semiBold },
  findOrdersCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    backgroundColor: colors.info.light,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.info.light,
    borderStyle: 'dashed',
  },
  findOrdersTitle: { ...typography.h6, color: colors.info.dark },
  findOrdersSub: { ...typography.body2, color: colors.info.DEFAULT, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderLeftWidth: 3,
  },
  statValue: { ...typography.h5, color: colors.gray[900] },
  statLabel: { ...typography.caption, color: colors.text.secondary, textAlign: 'center', fontFamily: fontFamily.medium },
  actionsGrid: { flexDirection: 'row', gap: spacing.md },
  actionCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  actionLabel: { ...typography.label, color: colors.gray[700], textAlign: 'center' },
});

export default DeliveryDashboardScreen;