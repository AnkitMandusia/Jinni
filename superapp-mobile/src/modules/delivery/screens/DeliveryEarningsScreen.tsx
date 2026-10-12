import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, shadows, spacing } from '@theme/spacing';
import { api } from '@services/api';

type Period = 'today' | 'week' | 'month';

interface EarningsData {
  period: string;
  orders_count: number;
  earnings: number;
  cod_collected: number;
  orders: Array<{
    id: string;
    order_number: string;
    total_amount: number;
    delivery_fee: number;
    payment_method: string;
    delivered_at: string | null;
  }>;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

export const DeliveryEarningsScreen: React.FC = () => {
  const [period, setPeriod] = useState<Period>('today');
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEarnings = useCallback(async (p: Period = period) => {
    try {
      const res = await api.get<EarningsData>(`/delivery/earnings?period=${p}`);
      setData(res);
    } catch (e: any) {
      console.error('Earnings error:', e?.response?.data || e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      fetchEarnings(period);
    }, [period])
  );

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setLoading(true);
    fetchEarnings(p);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings(period);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Earnings</Text>
      </View>

      {/* Period Tabs */}
      <View style={styles.periodTabs}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.periodTabActive]}
            onPress={() => handlePeriodChange(p)}
          >
            <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 80 }} />
      ) : (
        <FlatList
          data={data?.orders ?? []}
          keyExtractor={o => o.id}
          ListHeaderComponent={
            <View>
              {/* Summary Cards */}
              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCard, styles.earningsCard]}>
                  <Ionicons name="trending-up-outline" size={24} color={colors.white} />
                  <Text style={styles.summaryValue}>₹{(data?.earnings ?? 0).toFixed(0)}</Text>
                  <Text style={styles.summaryLabel}>Delivery Earnings</Text>
                </View>
                <View style={styles.summarySmallGrid}>
                  <View style={[styles.summaryCard, styles.ordersCard]}>
                    <Ionicons name="checkmark-circle-outline" size={20} color={colors.info.dark} />
                    <Text style={[styles.summaryValue, { color: colors.info.dark, fontSize: 22 }]}>
                      {data?.orders_count ?? 0}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: colors.info.DEFAULT }]}>Orders</Text>
                  </View>
                  <View style={[styles.summaryCard, styles.codCard]}>
                    <Ionicons name="wallet-outline" size={20} color={colors.warning.dark} />
                    <Text style={[styles.summaryValue, { color: colors.warning.dark, fontSize: 16 }]}>
                      ₹{(data?.cod_collected ?? 0).toFixed(0)}
                    </Text>
                    <Text style={[styles.summaryLabel, { color: colors.warning.dark }]}>COD Collected</Text>
                  </View>
                </View>
              </View>

              {data && data.orders_count > 0 && (
                <View style={styles.avgRow}>
                  <Ionicons name="calculator-outline" size={16} color={colors.gray[500]} />
                  <Text style={styles.avgText}>
                    Avg per order: ₹{data.orders_count > 0 ? (data.earnings / data.orders_count).toFixed(0) : 0}
                  </Text>
                </View>
              )}

              {(data?.orders ?? []).length > 0 && (
                <Text style={styles.listTitle}>Completed Deliveries</Text>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.orderItem, index === 0 && styles.firstItem]}>
              <View style={styles.orderItemLeft}>
                <Text style={styles.orderItemNumber}>#{item.order_number}</Text>
                <Text style={styles.orderItemDate}>{formatDate(item.delivered_at)}</Text>
              </View>
              <View style={styles.orderItemRight}>
                <Text style={styles.orderItemEarning}>+₹{item.delivery_fee.toFixed(0)}</Text>
                <View style={[
                  styles.paymentChip,
                  item.payment_method === 'cod' ? styles.codPayment : styles.onlinePayment
                ]}>
                  <Text style={styles.paymentChipText}>{item.payment_method.toUpperCase()}</Text>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={56} color={colors.gray[300]} />
              <Text style={styles.emptyTitle}>No deliveries {PERIOD_LABELS[period].toLowerCase()}</Text>
              <Text style={styles.emptySub}>Complete deliveries to see earnings here</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  headerTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[900] },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  periodTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.gray[100],
  },
  periodTabActive: { backgroundColor: colors.primary[500] },
  periodTabText: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.gray[500] },
  periodTabTextActive: { color: colors.white },
  summaryGrid: { flexDirection: 'row', gap: spacing.md, padding: spacing.xl },
  summarySmallGrid: { flex: 1, gap: spacing.md },
  summaryCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.sm,
  },
  earningsCard: {
    flex: 1.2,
    backgroundColor: colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  ordersCard: { backgroundColor: colors.info.light, alignItems: 'center', justifyContent: 'center' },
  codCard: { backgroundColor: colors.warning.light, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: 26, fontFamily: fontFamily.bold, color: colors.white },
  summaryLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: fontFamily.medium },
  avgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  avgText: { fontSize: 13, color: colors.gray[500] },
  listTitle: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    fontSize: 14,
    fontFamily: fontFamily.bold,
    color: colors.gray[700],
  },
  listContent: { paddingBottom: spacing.xl },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  firstItem: { borderTopWidth: 1 },
  orderItemLeft: { gap: spacing.xs },
  orderItemNumber: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.gray[900] },
  orderItemDate: { fontSize: 12, color: colors.gray[400] },
  orderItemRight: { alignItems: 'flex-end', gap: spacing.xs },
  orderItemEarning: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.success.DEFAULT },
  paymentChip: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  codPayment: { backgroundColor: colors.warning.light },
  onlinePayment: { backgroundColor: colors.success.light },
  paymentChipText: { fontSize: 10, fontFamily: fontFamily.bold, color: colors.gray[700] },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl * 2,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[700] },
  emptySub: { fontSize: 14, color: colors.gray[400], textAlign: 'center' },
});

export default DeliveryEarningsScreen;