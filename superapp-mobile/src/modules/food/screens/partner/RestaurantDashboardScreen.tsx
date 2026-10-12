import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { RestaurantTabParamList } from '@navigation/RestaurantNavigator';
import { colors } from '@theme/colors';
import { fontFamily, typography } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';

const FOOD = colors.food?.primary || '#FF6B6B';

interface Stats {
  today_orders: number;
  today_revenue: number;
  pending_orders: number;
  preparing_orders: number;
  ready_orders: number;
  is_open: boolean;
  is_accepting_orders: boolean;
  active_menu_items: number;
  unavailable_items: number;
}

interface PartnerOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: string | number;
  items: Array<{ name: string; quantity: number }>;
  created_at: string;
}

const StatCard: React.FC<{ icon: string; label: string; value: string | number; color: string }> = ({
  icon,
  label,
  value,
  color,
}) => (
  <View style={[styles.statCard, { borderLeftColor: color }]}>
    <Ionicons name={icon as any} size={22} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export const RestaurantDashboardScreen: React.FC = () => {
  const navigation = useNavigation<BottomTabNavigationProp<RestaurantTabParamList>>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [pendingOrders, setPendingOrders] = useState<PartnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [togglingAccepting, setTogglingAccepting] = useState(false);
  const [actingOrderId, setActingOrderId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [dash, me] = await Promise.all([
        api.get<Stats>('/food/partner/dashboard'),
        api.get<{ name: string }>('/food/partner/restaurant'),
      ]);
      setStats(dash);
      setRestaurantName(me.name);
      const orders = await api.get<{ orders: PartnerOrder[] }>('/food/partner/orders', {
        params: { status: 'pending_dispatch', page_size: 10 },
      });
      setPendingOrders(orders.orders || []);
    } catch (e) {
      console.error('dashboard load failed', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
      const t = setInterval(fetchAll, 30000);
      return () => clearInterval(t);
    }, [fetchAll])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const toggleOpen = async (val: boolean) => {
    setTogglingOpen(true);
    try {
      await api.post('/food/partner/toggle-open', null, { params: { is_open: val } });
      setStats((s) => (s ? { ...s, is_open: val } : s));
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || 'Could not update status');
    } finally {
      setTogglingOpen(false);
    }
  };

  const toggleAccepting = async (val: boolean) => {
    setTogglingAccepting(true);
    try {
      await api.post('/food/partner/toggle-accepting', null, { params: { is_accepting_orders: val } });
      setStats((s) => (s ? { ...s, is_accepting_orders: val } : s));
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || 'Could not update status');
    } finally {
      setTogglingAccepting(false);
    }
  };

  const respondToOrder = async (orderId: string, newStatus: 'store_accepted' | 'rejected') => {
    setActingOrderId(orderId);
    try {
      await api.post(`/food/partner/orders/${orderId}/status`, null, { params: { new_status: newStatus } });
      fetchAll();
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || 'Could not update order');
    } finally {
      setActingOrderId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FOOD} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name} numberOfLines={1}>{restaurantName || 'Your Restaurant'}</Text>
          </View>
          <View style={[styles.statusBadge, stats?.is_open ? styles.openBadge : styles.closedBadge]}>
            <Text style={[styles.statusText, stats?.is_open ? styles.openText : styles.closedText]}>
              {stats?.is_open ? 'OPEN' : 'CLOSED'}
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={FOOD} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Open / Accepting toggles */}
            <View style={styles.toggleCard}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Restaurant open</Text>
                  <Text style={styles.toggleSub}>Customers can see you in search when open</Text>
                </View>
                {togglingOpen ? <ActivityIndicator color={FOOD} /> : (
                  <Switch
                    value={!!stats?.is_open}
                    onValueChange={toggleOpen}
                    trackColor={{ true: FOOD, false: colors.gray[300] }}
                  />
                )}
              </View>
              <View style={styles.toggleDivider} />
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Accepting orders</Text>
                  <Text style={styles.toggleSub}>Pause temporarily without going fully offline</Text>
                </View>
                {togglingAccepting ? <ActivityIndicator color={FOOD} /> : (
                  <Switch
                    value={!!stats?.is_accepting_orders}
                    onValueChange={toggleAccepting}
                    trackColor={{ true: FOOD, false: colors.gray[300] }}
                  />
                )}
              </View>
            </View>

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <StatCard icon="receipt-outline" label="Today's orders" value={stats?.today_orders ?? 0} color={FOOD} />
              <StatCard icon="cash-outline" label="Today's revenue" value={formatPrice(stats?.today_revenue ?? 0)} color={colors.success.DEFAULT} />
              <StatCard icon="time-outline" label="Pending" value={stats?.pending_orders ?? 0} color={colors.warning.DEFAULT} />
            </View>
            <View style={styles.statsGrid}>
              <StatCard icon="flame-outline" label="Preparing" value={stats?.preparing_orders ?? 0} color={colors.secondary[500]} />
              <StatCard icon="basket-outline" label="Ready" value={stats?.ready_orders ?? 0} color={colors.info.DEFAULT} />
              <StatCard icon="fast-food-outline" label="Live items" value={stats?.active_menu_items ?? 0} color={colors.gray[600]} />
            </View>

            {stats && stats.unavailable_items > 0 && (
              <TouchableOpacity style={styles.warnCard} onPress={() => navigation.navigate('Menu')}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning.dark} />
                <Text style={styles.warnText}>
                  {stats.unavailable_items} menu item{stats.unavailable_items > 1 ? 's are' : ' is'} marked unavailable
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.warning.dark} />
              </TouchableOpacity>
            )}

            {/* New orders needing a response */}
            {pendingOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>New orders · needs your response</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
                    <Text style={styles.viewAll}>View all</Text>
                  </TouchableOpacity>
                </View>
                {pendingOrders.map((o) => (
                  <View key={o.id} style={styles.orderCard}>
                    <View style={styles.orderTop}>
                      <Text style={styles.orderNumber}>#{o.order_number}</Text>
                      <Text style={styles.orderAmount}>{formatPrice(o.total_amount)}</Text>
                    </View>
                    <Text style={styles.orderItems} numberOfLines={2}>
                      {(o.items || []).map((i) => `${i.name} x${i.quantity}`).join(', ')}
                    </Text>
                    {actingOrderId === o.id ? (
                      <ActivityIndicator color={FOOD} style={{ marginTop: spacing.sm }} />
                    ) : (
                      <View style={styles.orderActions}>
                        <TouchableOpacity style={styles.declineBtn} onPress={() => respondToOrder(o.id, 'rejected')}>
                          <Text style={styles.declineText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.acceptBtn} onPress={() => respondToOrder(o.id, 'store_accepted')}>
                          <Text style={styles.acceptText}>Accept</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <View style={styles.actionsGrid}>
                <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Menu')}>
                  <Ionicons name="restaurant-outline" size={26} color={FOOD} />
                  <Text style={styles.actionLabel}>Menu</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Orders')}>
                  <Ionicons name="list-outline" size={26} color={colors.secondary[500]} />
                  <Text style={styles.actionLabel}>Orders</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Profile')}>
                  <Ionicons name="storefront-outline" size={26} color={colors.success.DEFAULT} />
                  <Text style={styles.actionLabel}>Restaurant profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Profile')}>
                  <Ionicons name="settings-outline" size={26} color={colors.gray[500]} />
                  <Text style={styles.actionLabel}>Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.xl, backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  greeting: { ...typography.overline, color: colors.primary[600]},
  name: { ...typography.h4, color: colors.gray[900], marginTop: 2},
  statusBadge: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.xl },
  openBadge: { backgroundColor: colors.success.light },
  closedBadge: { backgroundColor: colors.error.light },
  statusText: { fontSize: 11, letterSpacing: 0.5, fontFamily: fontFamily.bold},
  openText: { color: colors.success.dark },
  closedText: { color: colors.error.dark },
  toggleCard: {
    backgroundColor: colors.white, borderRadius: borderRadius.lg, margin: spacing.xl, marginBottom: 0,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.gray[100],
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  toggleDivider: { height: 1, backgroundColor: colors.gray[100], marginVertical: spacing.md },
  toggleTitle: { fontSize: 14, color: colors.gray[900], fontFamily: fontFamily.bold},
  toggleSub: { fontSize: 11, color: colors.gray[500], marginTop: 2, fontFamily: fontFamily.regular},
  statsGrid: { flexDirection: 'row', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.sm },
  statCard: {
    flex: 1, backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md,
    alignItems: 'center', gap: spacing.xs, borderLeftWidth: 3, borderWidth: 1, borderColor: colors.gray[100],
  },
  statValue: { ...typography.h5, color: colors.gray[900]},
  statLabel: { ...typography.caption, color: colors.text.secondary, textAlign: 'center', fontFamily: fontFamily.medium},
  warnCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.warning.light,
    marginHorizontal: spacing.xl, marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.md,
  },
  warnText: { flex: 1, fontSize: 12, color: colors.warning.dark, fontFamily: fontFamily.semiBold},
  section: { paddingHorizontal: spacing.xl, marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.overline, color: colors.text.muted},
  viewAll: { ...typography.label, color: FOOD},
  orderCard: {
    backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.gray[100], borderLeftWidth: 3, borderLeftColor: colors.warning.DEFAULT,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  orderNumber: { fontSize: 14, color: colors.gray[900], fontFamily: fontFamily.bold},
  orderAmount: { fontSize: 14, color: colors.gray[900], fontFamily: fontFamily.bold},
  orderItems: { fontSize: 12, color: colors.gray[500], fontFamily: fontFamily.regular},
  orderActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  declineBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.error.DEFAULT, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, alignItems: 'center',
  },
  declineText: { color: colors.error.DEFAULT, fontSize: 13, fontFamily: fontFamily.bold},
  acceptBtn: { flex: 1, backgroundColor: colors.success.DEFAULT, borderRadius: borderRadius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  acceptText: { color: colors.white, fontSize: 13, fontFamily: fontFamily.bold},
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingBottom: spacing.xxl },
  actionCard: {
    width: '47%', backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.lg,
    alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.gray[100],
  },
  actionLabel: { ...typography.label, color: colors.gray[700], textAlign: 'center'},
});

export default RestaurantDashboardScreen;
