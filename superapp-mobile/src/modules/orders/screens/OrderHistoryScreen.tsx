import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { typography, fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';
import { OrderWishBanner } from '../components/OrderWishBanner';

// ── types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Order {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  delivery_address: { line1?: string; city?: string } | null;
  items: OrderItem[];
  created_at: string;
  accepted_at: string | null;
  delivered_at: string | null;
  notes: string | null;
}

// ── status config ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending_dispatch:  'Pending',
  store_accepted:    'Accepted',
  preparing:         'Preparing',
  ready_for_pickup:  'Ready for Pickup',
  delivery_assigned: 'Agent Assigned',
  picked_up:         'Picked Up',
  in_transit:        'On the Way',
  delivered:         'Delivered',
  cancelled:         'Cancelled',
  no_store_available: 'No Store Available',
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending_dispatch:  { bg: colors.surface.sunken, text: colors.status.placed },
  store_accepted:    { bg: colors.info.light,      text: colors.status.confirmed },
  preparing:         { bg: colors.warning.light,   text: colors.status.preparing },
  ready_for_pickup:  { bg: colors.primary[50],     text: colors.status.readyForPickup },
  delivery_assigned: { bg: colors.primary[50],     text: colors.status.outForDelivery },
  picked_up:         { bg: colors.primary[50],     text: colors.status.pickedUp },
  in_transit:        { bg: colors.warning.light,   text: colors.status.outForDelivery },
  delivered:         { bg: colors.success.light,   text: colors.status.delivered },
  cancelled:         { bg: colors.error.light,     text: colors.status.cancelled },
  no_store_available: { bg: colors.error.light,    text: colors.status.cancelled },
};

const TRACKING_STEPS = [
  { key: 'pending_dispatch',  label: 'Order Placed',    icon: 'receipt-outline' },
  { key: 'store_accepted',    label: 'Store Accepted',  icon: 'storefront-outline' },
  { key: 'preparing',         label: 'Preparing',       icon: 'restaurant-outline' },
  { key: 'ready_for_pickup',  label: 'Ready',           icon: 'basket-outline' },
  { key: 'delivery_assigned', label: 'Agent Assigned',  icon: 'person-outline' },
  { key: 'picked_up',         label: 'Picked Up',       icon: 'cube-outline' },
  { key: 'in_transit',        label: 'On the Way',      icon: 'navigate-outline' },
  { key: 'delivered',         label: 'Delivered',       icon: 'checkmark-circle-outline' },
];

const STATUS_ORDER = TRACKING_STEPS.map((s) => s.key);

const ORDER_TYPE_ICON: Record<string, string> = {
  grocery: 'basket',
  food:    'restaurant',
  cab:     'car',
  salon:   'cut',
};

function statusIndex(s: string) {
  return STATUS_ORDER.indexOf(s);
}

// ── sub-components ────────────────────────────────────────────────────────────

const TrackingTimeline: React.FC<{ currentStatus: string }> = ({ currentStatus }) => {
  const reached = statusIndex(currentStatus);
  return (
    <View style={styles.timeline}>
      {TRACKING_STEPS.map((step, idx) => {
        const done = idx <= reached;
        const active = idx === reached;
        return (
          <View key={step.key} style={styles.timelineRow}>
            <View style={styles.timelineLeft}>
              <View style={[
                styles.timelineDot,
                done && styles.timelineDotDone,
                active && styles.timelineDotActive,
              ]}>
                <Ionicons
                  name={step.icon as any}
                  size={12}
                  color={done ? colors.white : colors.gray[400]}
                />
              </View>
              {idx < TRACKING_STEPS.length - 1 && (
                <View style={[styles.timelineLine, done && styles.timelineLineDone]} />
              )}
            </View>
            <Text style={[
              styles.timelineLabel,
              active && styles.timelineLabelActive,
              done && !active && styles.timelineLabelDone,
            ]}>
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// Orders in this set have a live store/rider lifecycle worth a dedicated
// detail page; pending/delivered/cancelled/no-store orders have nothing to
// track so they just expand inline instead.
const TRACKABLE_STATUSES = new Set([
  'store_accepted', 'preparing', 'ready_for_pickup',
  'delivery_assigned', 'picked_up', 'in_transit',
]);

const OrderCard: React.FC<{ order: Order }> = ({ order }) => {
  const navigation = useNavigation<any>();
  const [expanded, setExpanded] = useState(false);
  const sc = STATUS_COLOR[order.status] ?? STATUS_COLOR.pending_dispatch;
  const isCancelled = order.status === 'cancelled' || order.status === 'no_store_available';
  const isDelivered = order.status === 'delivered';
  const typeIcon = ORDER_TYPE_ICON[order.order_type] ?? 'cart';
  const isTrackable =
    TRACKABLE_STATUSES.has(order.status) &&
    (order.order_type === 'grocery' || order.order_type === 'food');

  const handlePress = () => {
    if (isTrackable) {
      navigation.navigate('OrderTracking', {
        orderId: order.id,
        moduleType: order.order_type === 'grocery' ? 'grocery' : 'food',
      });
      return;
    }
    setExpanded((e) => !e);
  };

  return (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {/* Card header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.orderTypeIcon}>
            <Ionicons name={typeIcon as any} size={18} color={colors.primary[500]} />
          </View>
          <View>
            <Text style={styles.orderNumber}>#{order.order_number}</Text>
            <Text style={styles.orderDate}>
              {new Date(order.created_at).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>
            {STATUS_LABEL[order.status] ?? order.status}
          </Text>
        </View>
      </View>

      {/* Items preview (always visible) */}
      <Text style={styles.itemsPreview} numberOfLines={expanded ? undefined : 1}>
        {order.items.map((i) => `${i.product_name} ×${i.quantity}`).join('  ·  ')}
      </Text>

      {/* Cancellation / no-store note */}
      {isCancelled && (order.notes || order.status === 'no_store_available') && (
        <View style={styles.cancelNote}>
          <Ionicons name="information-circle-outline" size={14} color={colors.error.dark} />
          <Text style={styles.cancelNoteText}>
            {order.notes || 'No nearby store was open to accept this order. Please try again or choose a different store.'}
          </Text>
        </View>
      )}

      {/* Footer: total + expand chevron */}
      <View style={styles.cardFooter}>
        <Text style={styles.totalAmount}>{formatPrice(order.total_amount)}</Text>
        <View style={styles.footerRight}>
          <Text style={styles.paymentMethod}>{order.payment_method?.toUpperCase()}</Text>
          {isTrackable ? (
            <View style={styles.trackPill}>
              <Ionicons name="navigate" size={11} color={colors.primary[600]} />
              <Text style={styles.trackPillText}>Track</Text>
            </View>
          ) : (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.gray[400]}
            />
          )}
        </View>
      </View>

      {/* Expanded: tracking timeline + full item list (non-trackable orders only —
          trackable ones push to the dedicated detail page instead, see handlePress) */}
      {expanded && !isCancelled && !isTrackable && (
        <View style={styles.expandedSection}>
          <Text style={styles.expandedSectionTitle}>Tracking</Text>
          <TrackingTimeline currentStatus={order.status} />

          <Text style={styles.expandedSectionTitle}>Order Items</Text>
          {order.items.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.product_name}
              </Text>
              <Text style={styles.itemQty}>×{item.quantity}</Text>
              <Text style={styles.itemSubtotal}>{formatPrice(item.subtotal)}</Text>
            </View>
          ))}

          {order.delivery_address && (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={14} color={colors.gray[400]} />
              <Text style={styles.addressText}>
                {order.delivery_address.line1 ?? order.delivery_address.city ?? 'N/A'}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// ── main screen ───────────────────────────────────────────────────────────────

export const OrderHistoryScreen: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'past' | 'cancelled'>('active');

  const fetchOrders = useCallback(async () => {
    try {
      const res = await api.get<{ items: Order[] }>('/orders/my-orders');
      setOrders(res.items ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { fetchOrders(); }, [fetchOrders])
  );

  const filtered = orders.filter((o) => {
    if (activeTab === 'active')    return !['delivered', 'cancelled', 'no_store_available'].includes(o.status);
    if (activeTab === 'past')      return o.status === 'delivered';
    if (activeTab === 'cancelled') return o.status === 'cancelled' || o.status === 'no_store_available';
    return true;
  });

  const tabs: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'active',    label: 'Active' },
    { key: 'past',      label: 'Past' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Orders</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={styles.loader} />
      ) : (
        <FlatList
          ListHeaderComponent={<OrderWishBanner />}
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchOrders(); }}
              colors={[colors.primary[500]]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={56} color={colors.gray[300]} />
              <Text style={styles.emptyText}>
                {activeTab === 'active'
                  ? 'No active orders'
                  : activeTab === 'cancelled'
                  ? 'No cancelled orders'
                  : 'No past orders'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  title: { ...typography.h4, color: colors.text.primary },
  tabs: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary[500] },
  tabText: { ...typography.label, color: colors.text.secondary },
  tabTextActive: { color: colors.white },
  loader: { marginTop: 80 },
  list: { padding: spacing.md, paddingBottom: 32 },

  orderCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  orderTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderNumber: { ...typography.label, fontSize: 15, color: colors.text.primary },
  orderDate: { ...typography.caption, fontSize: 11, color: colors.text.muted, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  statusText: { ...typography.caption, fontSize: 11, fontFamily: fontFamily.bold },

  itemsPreview: { ...typography.body2, color: colors.text.secondary, marginBottom: spacing.sm },

  cancelNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.error.light,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.error.DEFAULT,
  },
  cancelNoteText: { flex: 1, ...typography.caption, color: colors.error.dark, lineHeight: 18 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  totalAmount: { ...typography.h6, color: colors.text.primary },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  trackPillText: { fontSize: 11, fontFamily: fontFamily.bold, color: colors.primary[600] },
  paymentMethod: { ...typography.caption, fontSize: 11, color: colors.text.muted, fontFamily: fontFamily.semiBold },

  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  expandedSectionTitle: {
    ...typography.label,
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // Timeline
  timeline: { marginLeft: spacing.sm, marginBottom: spacing.md },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineLeft: { alignItems: 'center', width: 24, marginRight: spacing.sm },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: { backgroundColor: colors.primary[400] },
  timelineDotActive: { backgroundColor: colors.primary[600] },
  timelineLine: { width: 2, height: 16, backgroundColor: colors.gray[200] },
  timelineLineDone: { backgroundColor: colors.primary[300] },
  timelineLabel: { ...typography.caption, color: colors.text.muted, paddingVertical: 3, lineHeight: 22 },
  timelineLabelDone: { color: colors.text.secondary },
  timelineLabelActive: { color: colors.primary[700], fontFamily: fontFamily.bold },

  // Item rows
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  itemName: { flex: 1, ...typography.body2, color: colors.text.secondary },
  itemQty: { ...typography.caption, color: colors.text.muted, marginRight: spacing.sm },
  itemSubtotal: { ...typography.label, fontSize: 13, color: colors.gray[800] },

  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  addressText: { ...typography.caption, color: colors.text.muted },

  emptyState: { alignItems: 'center', paddingTop: 80 },
  emptyText: { ...typography.body1, color: colors.text.secondary, marginTop: spacing.md },
});

export default OrderHistoryScreen;
