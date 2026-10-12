import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, shadows, spacing } from '@theme/spacing';
import { api } from '@services/api';

interface AvailableOrder {
  id: string;
  order_number: string;
  total_amount: number;
  delivery_fee: number;
  payment_method: string;
  delivery_address: any;
  pickup_address: any;
  delivery_pincode: string;
  items_count: number;
  items: Array<{ name: string; qty: number }>;
  ready_at: string | null;
  created_at: string | null;
}

const TIMER_SECONDS = 30;

const OrderCard: React.FC<{
  order: AvailableOrder;
  onAccept: (id: string) => void;
  onSkip: (id: string) => void;
  accepting: boolean;
}> = ({ order, onAccept, onSkip, accepting }) => {
  const [seconds, setSeconds] = useState(TIMER_SECONDS);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.timing(progressAnim, {
      toValue: 0,
      duration: TIMER_SECONDS * 1000,
      useNativeDriver: false,
    });
    animation.start();

    const interval = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          clearInterval(interval);
          onSkip(order.id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
      animation.stop();
    };
  }, [order.id]);

  const timerColor = seconds > 15 ? colors.success.DEFAULT : seconds > 8 ? colors.warning.DEFAULT : colors.error.DEFAULT;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.orderCard}>
      {/* Timer Bar */}
      <View style={styles.timerBarBg}>
        <Animated.View style={[styles.timerBarFill, { width: progressWidth, backgroundColor: timerColor }]} />
      </View>

      <View style={styles.cardBody}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.orderNumber}>#{order.order_number}</Text>
          <View style={styles.timerBadge}>
            <Ionicons name="timer-outline" size={14} color={timerColor} />
            <Text style={[styles.timerText, { color: timerColor }]}>{seconds}s</Text>
          </View>
        </View>

        {/* Earnings */}
        <View style={styles.earningsRow}>
          <View style={styles.earningChip}>
            <Text style={styles.earningLabel}>You Earn</Text>
            <Text style={styles.earningValue}>₹{order.delivery_fee.toFixed(0)}</Text>
          </View>
          <View style={styles.earningChip}>
            <Text style={styles.earningLabel}>Order Total</Text>
            <Text style={styles.earningValue}>₹{order.total_amount.toFixed(0)}</Text>
          </View>
          <View style={[styles.earningChip, order.payment_method === 'cod' && styles.codChip]}>
            <Text style={styles.earningLabel}>Payment</Text>
            <Text style={[styles.earningValue, order.payment_method === 'cod' && styles.codText]}>
              {order.payment_method.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Items */}
        <Text style={styles.itemsSummary} numberOfLines={1}>
          📦 {order.items_count} item{order.items_count !== 1 ? 's' : ''}: {order.items.slice(0, 2).map(i => `${i.name} ×${i.qty}`).join(', ')}
          {order.items_count > 2 ? ` +${order.items_count - 2} more` : ''}
        </Text>

        {/* Addresses */}
        <View style={styles.addressBlock}>
          <View style={styles.addressRow}>
            <View style={[styles.addressDot, { backgroundColor: colors.success.DEFAULT }]} />
            <Text style={styles.addressText} numberOfLines={1}>
              {order.pickup_address?.line1 ?? 'Pickup location'}
            </Text>
          </View>
          <View style={styles.addressLine} />
          <View style={styles.addressRow}>
            <View style={[styles.addressDot, { backgroundColor: colors.error.DEFAULT }]} />
            <Text style={styles.addressText} numberOfLines={1}>
              {order.delivery_address?.line1 ?? 'Delivery location'}, {order.delivery_pincode}
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity style={styles.skipBtn} onPress={() => onSkip(order.id)} disabled={accepting}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.acceptBtn, accepting && styles.disabledBtn]}
            onPress={() => onAccept(order.id)}
            disabled={accepting}
          >
            {accepting ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                <Text style={styles.acceptBtnText}>Accept Delivery</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export const DeliveryOrdersScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [orders, setOrders] = useState<AvailableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api.get<AvailableOrder[]>('/delivery/orders/available');
      setOrders(data.filter(o => !skippedIds.has(o.id)));
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? 'Failed to fetch orders';
      if (!msg.includes('Go online')) {
        console.error('Fetch orders error:', msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [skippedIds]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
      const interval = setInterval(fetchOrders, 20000);
      return () => clearInterval(interval);
    }, [fetchOrders])
  );

  const handleAccept = async (orderId: string) => {
    setAcceptingId(orderId);
    try {
      const res = await api.post(`/delivery/orders/${orderId}/accept`, {});
      setOrders(prev => prev.filter(o => o.id !== orderId));
      Alert.alert(
        '🎉 Delivery Accepted!',
        `Order #${res.order_number}\nHead to pickup location.`,
        [{ text: 'View Active Order', onPress: () => navigation.navigate('Dashboard') }]
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Failed to accept order';
      Alert.alert('Could Not Accept', msg);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleSkip = (orderId: string) => {
    setSkippedIds(prev => new Set([...prev, orderId]));
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const displayOrders = orders.filter(o => !skippedIds.has(o.id));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Available Orders</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color={colors.primary[500]} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 80 }} />
      ) : displayOrders.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bicycle-outline" size={64} color={colors.gray[300]} />
          <Text style={styles.emptyTitle}>No Orders Available</Text>
          <Text style={styles.emptySub}>New orders appear here automatically. Make sure you're online.</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayOrders}
          keyExtractor={o => o.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onAccept={handleAccept}
              onSkip={handleSkip}
              accepting={acceptingId === item.id}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
          contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[900] },
  refreshBtn: { padding: spacing.sm },
  orderCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  timerBarBg: { height: 4, backgroundColor: colors.gray[100] },
  timerBarFill: { height: '100%', borderRadius: 2 },
  cardBody: { padding: spacing.lg },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  orderNumber: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[900] },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  timerText: { fontSize: 14, fontFamily: fontFamily.bold },
  earningsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  earningChip: {
    flex: 1,
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: 'center',
  },
  codChip: { backgroundColor: colors.warning.light },
  earningLabel: { fontSize: 10, color: colors.gray[400], marginBottom: 2 },
  earningValue: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.gray[900] },
  codText: { color: colors.warning.dark },
  itemsSummary: { fontSize: 12, color: colors.gray[500], marginBottom: spacing.md },
  addressBlock: {
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addressDot: { width: 8, height: 8, borderRadius: borderRadius.xs },
  addressLine: { height: 12, width: 1.5, backgroundColor: colors.gray[300], marginLeft: 3.25 },
  addressText: { flex: 1, fontSize: 12, color: colors.gray[700] },
  buttonsRow: { flexDirection: 'row', gap: spacing.md },
  skipBtn: {
    flex: 0.4,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gray[200],
  },
  skipBtnText: { color: colors.gray[500], fontFamily: fontFamily.semiBold, fontSize: 14 },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  acceptBtnText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 14 },
  disabledBtn: { opacity: 0.6 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: 20, fontFamily: fontFamily.bold, color: colors.gray[700] },
  emptySub: { fontSize: 14, color: colors.gray[400], textAlign: 'center' },
  refreshButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  refreshButtonText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 14 },
});

export default DeliveryOrdersScreen;