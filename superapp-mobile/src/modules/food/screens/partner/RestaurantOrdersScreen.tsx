import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';

const FOOD = colors.food?.primary || '#FF6B6B';

interface PartnerOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: string | number;
  payment_method: string;
  delivery_address: { line1?: string; city?: string; pincode?: string } | null;
  items: Array<{ name: string; quantity: number; unit_price: string | number }>;
  notes?: string | null;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  pending_dispatch: { label: 'New', bg: colors.warning.light, text: colors.status.preparing, icon: 'time' },
  store_accepted: { label: 'Accepted', bg: colors.info.light, text: colors.status.confirmed, icon: 'checkmark-circle' },
  preparing: { label: 'Preparing', bg: colors.primary[50], text: colors.status.readyForPickup, icon: 'flame' },
  ready_for_pickup: { label: 'Ready for pickup', bg: colors.success.light, text: colors.success.dark, icon: 'basket' },
  delivery_assigned: { label: 'Rider assigned', bg: colors.primary[50], text: colors.status.outForDelivery, icon: 'bicycle' },
  picked_up: { label: 'Picked up', bg: colors.success.light, text: colors.success.dark, icon: 'walk' },
  in_transit: { label: 'On the way', bg: colors.warning.light, text: colors.warning.dark, icon: 'navigate' },
  delivered: { label: 'Delivered', bg: colors.success.light, text: colors.success.dark, icon: 'checkmark-done' },
  cancelled: { label: 'Cancelled', bg: colors.error.light, text: colors.error.dark, icon: 'close-circle' },
  rejected: { label: 'Declined', bg: colors.error.light, text: colors.error.dark, icon: 'close-circle' },
};

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  store_accepted: { status: 'preparing', label: 'Start preparing' },
  preparing: { status: 'ready_for_pickup', label: 'Mark ready for pickup' },
};

const TABS = ['active', 'completed', 'all'] as const;
type Tab = (typeof TABS)[number];

export const RestaurantOrdersScreen: React.FC = () => {
  const [tab, setTab] = useState<Tab>('active');
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get<{ orders: PartnerOrder[] }>('/food/partner/orders', { params: { page_size: 50 } });
      let list = res.orders || [];
      if (tab === 'active') {
        list = list.filter((o) => !['delivered', 'cancelled', 'rejected'].includes(o.status));
      } else if (tab === 'completed') {
        list = list.filter((o) => ['delivered', 'cancelled', 'rejected'].includes(o.status));
      }
      setOrders(list);
    } catch (e) {
      console.error('Failed to fetch orders', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchOrders();
    }, [fetchOrders])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    setActingId(orderId);
    try {
      await api.post(`/food/partner/orders/${orderId}/status`, null, { params: { new_status: newStatus } });
      fetchOrders();
    } catch (e: any) {
      Alert.alert('Could not update order', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setActingId(null);
    }
  };

  const confirmDecline = (orderId: string, orderNumber: string) => {
    Alert.alert(
      `Decline order #${orderNumber}?`,
      'The customer will be notified that this order was declined.',
      [
        { text: 'Keep order', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => updateStatus(orderId, 'rejected') },
      ]
    );
  };

  const renderItem = ({ item }: { item: PartnerOrder }) => {
    const meta = STATUS_META[item.status] || STATUS_META.pending_dispatch;
    const isPending = item.status === 'pending_dispatch';
    const nextAction = NEXT_ACTION[item.status];

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.orderNumber}>#{item.order_number}</Text>
            <Text style={styles.orderTime}>
              {new Date(item.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={12} color={meta.text} />
            <Text style={[styles.statusText, { color: meta.text }]}>{meta.label}</Text>
          </View>
        </View>

        <View style={styles.itemsBox}>
          {(item.items || []).slice(0, 4).map((it, idx) => (
            <Text key={idx} style={styles.itemLine}>• {it.name} x{it.quantity}</Text>
          ))}
          {(item.items?.length || 0) > 4 && (
            <Text style={styles.moreItems}>+{item.items.length - 4} more</Text>
          )}
        </View>

        {item.delivery_address?.city ? (
          <View style={styles.addrRow}>
            <Ionicons name="location-outline" size={13} color={colors.gray[500]} />
            <Text style={styles.addrText} numberOfLines={1}>
              {item.delivery_address.line1 ? `${item.delivery_address.line1}, ` : ''}{item.delivery_address.city}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View>
            <Text style={styles.amount}>{formatPrice(item.total_amount)}</Text>
            <Text style={styles.payMethod}>{item.payment_method === 'cod' ? 'Cash on delivery' : 'Paid online'}</Text>
          </View>

          {actingId === item.id ? (
            <ActivityIndicator color={FOOD} />
          ) : isPending ? (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.declineBtn} onPress={() => confirmDecline(item.id, item.order_number)}>
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acceptBtn} onPress={() => updateStatus(item.id, 'store_accepted')}>
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : nextAction ? (
            <TouchableOpacity style={styles.nextBtn} onPress={() => updateStatus(item.id, nextAction.status)}>
              <Text style={styles.nextBtnText}>{nextAction.label}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.white} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
      </View>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={FOOD} style={{ marginTop: 80 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FOOD} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={56} color={colors.gray[300]} />
              <Text style={styles.emptyTitle}>No orders here</Text>
              <Text style={styles.emptySub}>
                {tab === 'active' ? 'New orders will show up here' : 'Completed orders will show up here'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  title: { fontSize: 22, color: colors.gray[900], fontFamily: fontFamily.bold},
  tabs: { flexDirection: 'row', padding: spacing.md, gap: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.xl, alignItems: 'center', backgroundColor: colors.surface.sunken },
  tabOn: { backgroundColor: FOOD },
  tabText: { fontSize: 13, color: colors.gray[600], fontFamily: fontFamily.bold},
  tabTextOn: { color: colors.white },
  list: { padding: spacing.md, paddingBottom: spacing.xxxl },
  card: { backgroundColor: colors.white, borderRadius: 14, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.gray[100] },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  orderNumber: { fontSize: 15, color: colors.gray[900], fontFamily: fontFamily.bold},
  orderTime: { fontSize: 11, color: colors.gray[500], marginTop: 2, fontFamily: fontFamily.regular},
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: 10, paddingVertical: spacing.xs, borderRadius: borderRadius.md },
  statusText: { fontSize: 11, fontFamily: fontFamily.bold},
  itemsBox: { marginBottom: spacing.sm },
  itemLine: { fontSize: 13, color: colors.gray[700], marginBottom: 2, fontFamily: fontFamily.regular},
  moreItems: { fontSize: 12, color: colors.gray[500], fontStyle: 'italic', fontFamily: fontFamily.regular},
  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  addrText: { fontSize: 12, color: colors.gray[500], flex: 1, fontFamily: fontFamily.regular},
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.sm },
  amount: { fontSize: 16, color: colors.gray[900], fontFamily: fontFamily.bold},
  payMethod: { fontSize: 11, color: colors.gray[500], marginTop: 1, fontFamily: fontFamily.regular},
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  declineBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm, borderWidth: 1.5, borderColor: colors.error.DEFAULT },
  declineText: { color: colors.error.DEFAULT, fontSize: 13, fontFamily: fontFamily.bold},
  acceptBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm, backgroundColor: colors.success.DEFAULT },
  acceptText: { color: colors.white, fontSize: 13, fontFamily: fontFamily.bold},
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: FOOD, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm },
  nextBtnText: { color: colors.white, fontSize: 13, fontFamily: fontFamily.bold},
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyTitle: { fontSize: 15, color: colors.gray[600], marginTop: spacing.md, fontFamily: fontFamily.bold},
  emptySub: { fontSize: 12, color: colors.gray[500], marginTop: spacing.xs, fontFamily: fontFamily.regular},
});

export default RestaurantOrdersScreen;
