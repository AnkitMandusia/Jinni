import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { AdminStackParamList } from '@navigation/AdminNavigator';
import { colors } from '@theme/colors';
import { typography, fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { adminService } from '@services/admin.service';
import { useOrderRealtime } from '@shared/hooks/useOrderRealtime';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

type FilterTab = 'all' | 'pending' | 'active' | 'delivered' | 'cancelled';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'delivered', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: colors.warning.light, text: colors.warning.dark },
  confirmed: { bg: colors.info.light, text: colors.info.dark },
  preparing: { bg: colors.info.light, text: colors.info.dark },
  out_for_delivery: { bg: colors.secondary[50], text: colors.secondary[700] },
  delivered: { bg: colors.success.light, text: colors.success.dark },
  cancelled: { bg: colors.error.light, text: colors.error.dark },
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

interface OrderCardProps {
  order: any;
  onPress?: () => void;
}

const DELIVERY_IN_PROGRESS_STATUSES = ['delivery_assigned', 'picked_up', 'in_transit'];

const OrderCard: React.FC<OrderCardProps> = ({ order, onPress }) => {
  const status: OrderStatus = order.status ?? 'pending';
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  const canOpenDeliveryVerification = DELIVERY_IN_PROGRESS_STATUSES.includes(order.status);

  const CardWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    canOpenDeliveryVerification && onPress ? (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>{children}</TouchableOpacity>
    ) : (
      <View>{children}</View>
    );

  return (
    <CardWrapper>
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.orderId}>#{order.id?.toString().slice(-8) ?? '—'}</Text>
          <Text style={styles.orderDate}>{formatDate(order.created_at ?? '')}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>
            {STATUS_LABELS[status] ?? status}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.metaLine}>
          <Ionicons name="person-outline" size={13} color={colors.text.muted} />
          <Text style={styles.customerName}>{order.customer_name ?? order.customer_phone ?? 'Unknown'}</Text>
        </View>
        {order.store_name && (
          <View style={styles.metaLine}>
            <Ionicons name="storefront-outline" size={13} color={colors.text.muted} />
            <Text style={styles.storeName}>{order.store_name}</Text>
          </View>
        )}
        {order.restaurant_name && (
          <View style={styles.metaLine}>
            <Ionicons name="restaurant-outline" size={13} color={colors.text.muted} />
            <Text style={styles.storeName}>{order.restaurant_name}</Text>
          </View>
        )}
        {order.delivery_agent && (
          <View style={styles.metaLine}>
            <Ionicons name="bicycle-outline" size={13} color={colors.text.muted} />
            <Text style={styles.agentName}>{order.delivery_agent}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.itemCount}>
          {order.item_count ?? 0} item{(order.item_count ?? 0) !== 1 ? 's' : ''}
        </Text>
        <Text style={styles.amount}>
          ₹{(order.total ?? 0).toLocaleString('en-IN')}
        </Text>
      </View>
      {canOpenDeliveryVerification && (
        <View style={styles.deliveryHint}>
          <Ionicons name="shield-checkmark-outline" size={13} color={colors.primary[500]} />
          <Text style={styles.deliveryHintText}>Tap to view delivery verification</Text>
        </View>
      )}
    </View>
    </CardWrapper>
  );
};

export const AdminOrdersScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async (tab: FilterTab = activeTab) => {
    try {
      const params = tab === 'all' ? {} : { status: tab };
      const result = await adminService.getOrders(params);
      setOrders(result.orders ?? []);
      setTotal(result.total ?? 0);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    fetchOrders(activeTab);
  }, [activeTab]);

  // Live refresh: any order reaching "delivered" (via OTP or manual
  // completion) or moving through the pipeline refetches this list
  // silently, so Super Admin sees it without pulling to refresh.
  useOrderRealtime(() => fetchOrders(activeTab));

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders(activeTab);
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Ionicons name="receipt-outline" size={48} color={colors.gray[300]} />
      <Text style={styles.emptyTitle}>No orders found</Text>
      <Text style={styles.emptySubtitle}>Pull down to refresh</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Orders</Text>
        <Text style={styles.subtitle}>{total} total</Text>
      </View>

      <View style={styles.tabsRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.key && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary[500]}
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item, i) => item.id?.toString() ?? String(i)}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() =>
                navigation.navigate('DeliveryVerification', {
                  orderId: item.id,
                  orderNumber: item.order_number ?? item.id?.toString().slice(-8),
                })
              }
            />
          )}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary[500]]}
              tintColor={colors.primary[500]}
            />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.body2,
    color: colors.text.secondary,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    backgroundColor: colors.surface.sunken,
  },
  tabActive: {
    backgroundColor: colors.primary[500],
  },
  tabText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.text.secondary,
    fontFamily: fontFamily.semiBold,
  },
  tabTextActive: {
    color: colors.white,
  },
  loader: {
    marginTop: spacing.xxxxl,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  orderId: {
    ...typography.label,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: 'monospace',
  },
  orderDate: {
    ...typography.caption,
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    ...typography.caption,
    fontSize: 11,
    fontFamily: fontFamily.bold,
  },
  cardBody: {
    gap: 4,
    marginBottom: spacing.md,
  },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customerName: {
    ...typography.body2,
    color: colors.text.secondary,
  },
  storeName: {
    ...typography.body2,
    color: colors.text.secondary,
  },
  agentName: {
    ...typography.body2,
    color: colors.text.muted,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  itemCount: {
    ...typography.caption,
    color: colors.text.muted,
  },
  amount: {
    ...typography.h6,
    color: colors.text.primary,
  },
  deliveryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
  },
  deliveryHintText: {
    ...typography.caption,
    color: colors.primary[500],
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxxxl * 2,
  },
  emptyTitle: {
    ...typography.h5,
    color: colors.text.secondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body2,
    color: colors.text.muted,
  },
});

export default AdminOrdersScreen;
