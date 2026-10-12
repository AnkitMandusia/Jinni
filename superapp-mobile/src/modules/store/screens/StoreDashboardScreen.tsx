import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { StoreTabParamList } from '@navigation/StoreNavigator';
import { colors } from '@theme/colors';
import { fontFamily, typography } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { useAuthStore } from '@auth/store/authStore';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';

interface StoreStats {
  total_orders: number;
  pending_orders: number;
  total_revenue: number;
  is_open: boolean;
  store_name: string;
}

interface PendingOrder {
  id: string;
  order_number: string;
  total_amount: number;
  items: Array<{ product_name: string; quantity: number }>;
  created_at: string;
  delivery_address: any;
}

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string | number;
  color: string;
}> = ({ icon, label, value, color }) => (
  <View style={[styles.statCard, { borderLeftColor: color }]}>
    <Ionicons name={icon as any} size={24} color={color} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

interface DeclineTarget { orderId: string; orderNumber: string; }

export const StoreDashboardScreen: React.FC = () => {
  const navigation = useNavigation<BottomTabNavigationProp<StoreTabParamList>>();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [declineTarget, setDeclineTarget] = useState<DeclineTarget | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  const fetchStats = async () => {
    try {
      const profile = await api.get<StoreStats>('/store/dashboard');
      setStats(profile);
    } catch {
      setStats({
        total_orders: 0,
        pending_orders: 0,
        total_revenue: 0,
        is_open: true,
        store_name: user?.name ?? 'My Store',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPendingOrders = async () => {
    try {
      const orders = await api.get<PendingOrder[]>('/orders/pending');
      setPendingOrders(orders);
    } catch (error) {
      console.error('Failed to fetch pending orders:', error);
    }
  };

  const handleAcceptOrder = async (orderId: string) => {
    try {
      await api.post(`/orders/${orderId}/accept`, {});
      alert('Order accepted!');
      fetchPendingOrders();
      fetchStats();
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Failed to accept order');
    }
  };

  const handleDeclineOrder = async () => {
    if (!declineTarget || !declineReason.trim()) return;
    setDeclining(true);
    try {
      await api.post(`/orders/${declineTarget.orderId}/decline`, { reason: declineReason.trim() });
      setDeclineTarget(null);
      setDeclineReason('');
      fetchPendingOrders();
      fetchStats();
    } catch (error: any) {
      alert(error?.response?.data?.detail || 'Failed to decline order');
    } finally {
      setDeclining(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchStats();
      fetchPendingOrders();
      const interval = setInterval(fetchPendingOrders, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
    fetchPendingOrders();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Decline Modal */}
      <Modal
        visible={!!declineTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setDeclineTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.declineSheet}>
            <Text style={styles.declineTitle}>Decline Order #{declineTarget?.orderNumber}</Text>
            <Text style={styles.declineSubtitle}>
              Write a note for the customer — this will appear as the cancellation reason.
            </Text>
            <TextInput
              style={styles.declineInput}
              placeholder="e.g. The requested item is currently out of stock."
              placeholderTextColor={styles.declinePlaceholder.color}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{declineReason.length}/500</Text>
            <View style={styles.declineBtns}>
              <TouchableOpacity
                style={styles.cancelDeclineBtn}
                onPress={() => { setDeclineTarget(null); setDeclineReason(''); }}
                disabled={declining}
              >
                <Text style={styles.cancelDeclineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeclineBtn, (!declineReason.trim() || declining) && styles.btnDisabled]}
                onPress={handleDeclineOrder}
                disabled={!declineReason.trim() || declining}
              >
                <Text style={styles.confirmDeclineText}>
                  {declining ? 'Declining…' : 'Decline Order'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.storeName}>{stats?.store_name ?? user?.name ?? 'Store Owner'}</Text>
          </View>
          <View style={[styles.statusBadge, stats?.is_open ? styles.openBadge : styles.closedBadge]}>
            <Text style={[styles.statusText, stats?.is_open ? styles.openText : styles.closedText]}>
              {stats?.is_open ? 'OPEN' : 'CLOSED'}
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary[500]} style={styles.loader} />
        ) : (
          <>
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <StatCard
                icon="receipt-outline"
                label="Total Orders"
                value={stats?.total_orders ?? 0}
                color={colors.primary[500]}
              />
              <StatCard
                icon="time-outline"
                label="Pending"
                value={stats?.pending_orders ?? 0}
                color={colors.warning.DEFAULT}
              />
              <StatCard
                icon="cash-outline"
                label="Revenue"
                value={`₹${stats?.total_revenue ?? 0}`}
                color={colors.success.DEFAULT}
              />
            </View>

            {/* Pending Orders Section */}
            {pendingOrders.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>
                    New Orders ({pendingOrders.length})
                  </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
                    <Text style={styles.viewAllLink}>View All</Text>
                  </TouchableOpacity>
                </View>
                
                {pendingOrders.slice(0, 3).map((order) => (
                  <View key={order.id} style={styles.pendingOrderCard}>
                    <View style={styles.orderHeader}>
                      <View>
                        <Text style={styles.orderNumber}>#{order.order_number}</Text>
                        <Text style={styles.orderItems}>
                          {order.items?.map(i => `${i.product_name} x${i.quantity}`).join(', ')}
                        </Text>
                      </View>
                      <Text style={styles.orderAmount}>{formatPrice(order.total_amount)}</Text>
                    </View>
                    <View style={styles.orderActions}>
                      <Text style={styles.orderTime}>
                        {new Date(order.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <View style={styles.orderActionBtns}>
                        <TouchableOpacity
                          style={styles.declineBtnSmall}
                          onPress={() => {
                            setDeclineTarget({ orderId: order.id, orderNumber: order.order_number });
                            setDeclineReason('');
                          }}
                        >
                          <Text style={styles.declineBtnSmallText}>Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.acceptBtnSmall}
                          onPress={() => handleAcceptOrder(order.id)}
                        >
                          <Text style={styles.acceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Quick Actions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.actionsGrid}>
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => navigation.navigate('Products')}
                >
                  <Ionicons name="cube-outline" size={28} color={colors.primary[500]} />
                  <Text style={styles.actionLabel}>Products</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => navigation.navigate('Orders')}
                >
                  <Ionicons name="list-outline" size={28} color={colors.secondary[500]} />
                  <Text style={styles.actionLabel}>Orders</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCard}>
                  <Ionicons name="stats-chart-outline" size={28} color={colors.success.DEFAULT} />
                  <Text style={styles.actionLabel}>Analytics</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.actionCard}
                  onPress={() => navigation.navigate('Profile')}
                >
                  <Ionicons name="settings-outline" size={28} color={colors.gray[500]} />
                  <Text style={styles.actionLabel}>Settings</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Info */}
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={20} color={colors.info.DEFAULT} />
              <Text style={styles.infoText}>
                Your store is approved and active. Customers can now place orders.
              </Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.xl,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  greeting: { ...typography.overline, color: colors.primary[600] },
  storeName: { ...typography.h4, color: colors.gray[900], marginTop: 2 },
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.xl,
  },
  openBadge: { backgroundColor: colors.success.light },
  closedBadge: { backgroundColor: colors.error.light },
  statusText: { fontSize: 12, fontFamily: fontFamily.bold, letterSpacing: 0.5 },
  openText: { color: colors.success.dark },
  closedText: { color: colors.error.dark },
  loader: { marginTop: spacing.xxxxl },
  statsGrid: {
    flexDirection: 'row',
    padding: spacing.xl,
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  statValue: { ...typography.h5, color: colors.gray[900] },
  statLabel: { ...typography.caption, color: colors.text.secondary, textAlign: 'center', fontFamily: fontFamily.medium },
  section: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  sectionTitle: {
    ...typography.overline,
    color: colors.text.muted,
    marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  actionCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  actionLabel: { ...typography.label, color: colors.gray[700] },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    backgroundColor: colors.info.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.info.dark, lineHeight: 18 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  viewAllLink: { ...typography.label, color: colors.primary[500] },
  pendingOrderCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderLeftWidth: 3,
    borderLeftColor: colors.warning.DEFAULT,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  orderNumber: { fontSize: 15, fontFamily: fontFamily.bold, color: colors.gray[900] },
  orderItems: { fontSize: 12, color: colors.gray[500], marginTop: 2, flex: 1 },
  orderAmount: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.gray[900] },
  orderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderTime: { fontSize: 12, color: colors.gray[400] },
  acceptBtnSmall: {
    backgroundColor: colors.success.DEFAULT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  acceptBtnText: { color: colors.white, fontFamily: fontFamily.semiBold, fontSize: 13 },
  orderActionBtns: { flexDirection: 'row', gap: spacing.sm },
  declineBtnSmall: {
    borderWidth: 1.5,
    borderColor: colors.error.DEFAULT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  declineBtnSmallText: { color: colors.error.DEFAULT, fontFamily: fontFamily.semiBold, fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  declineSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 36,
  },
  declineTitle: { fontSize: 17, fontFamily: fontFamily.bold, color: colors.gray[900], marginBottom: spacing.sm },
  declineSubtitle: { fontSize: 13, color: colors.gray[500], marginBottom: spacing.lg, lineHeight: 20 },
  declinePlaceholder: { color: colors.gray[400] },
  declineInput: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.gray[800],
    minHeight: 100,
    backgroundColor: colors.gray[50],
  },
  charCount: { fontSize: 11, color: colors.gray[400], textAlign: 'right', marginTop: spacing.xs, marginBottom: spacing.lg },
  declineBtns: { flexDirection: 'row', gap: spacing.md },
  cancelDeclineBtn: {
    flex: 0.4,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gray[200],
  },
  cancelDeclineText: { color: colors.gray[600], fontFamily: fontFamily.bold, fontSize: 15 },
  confirmDeclineBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.error.DEFAULT,
  },
  confirmDeclineText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});

export default StoreDashboardScreen;
