import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp, useIsFocused } from '@react-navigation/native';
import { OrderStatusBadge } from '@components/OrderStatusBadge';
import { JinniSparkleAccent } from '@components/JinniSparkleAccent';
import { JinniMagicJourney, MagicJourneyStage } from '@modules/jinni/components/JinniMagicJourney';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography, fontFamily } from '@theme/typography';
import { api } from '@services/api';
import { useOrderRealtime } from '@shared/hooks/useOrderRealtime';

type OrderTrackingParams = { orderId: string; moduleType?: 'food' | 'grocery' };

type Tracking = {
  order_id: string;
  order_number: string;
  status: string;
  delivery_address: any;
  pickup_address: any;
  customer_rating?: number | null;
  rider?: { name?: string; phone?: string; rating?: number; vehicle_type?: string } | null;
};

const TRACK_ORDER = ['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'in_transit', 'delivered'];
const ACTIVE = new Set(['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'in_transit']);
const TERMINAL = new Set(['delivered', 'cancelled', 'no_store_available', 'failed']);

const journeyForStatus = (status?: string): { stage: MagicJourneyStage; label: string } => {
  switch (status) {
    case 'delivery_assigned': return { stage: 'takeoff', label: 'Your delivery partner is assigned' };
    case 'picked_up':
    case 'in_transit': return { stage: 'journey', label: 'Your order is on the way' };
    case 'delivered': return { stage: 'arrived', label: 'Delivered successfully' };
    case 'cancelled':
    case 'failed':
    case 'no_store_available': return { stage: 'idle', label: 'This order is no longer active' };
    default: return { stage: 'idle', label: 'Your order is being prepared' };
  }
};

export const OrderTrackingScreen: React.FC = () => {
  const route = useRoute<RouteProp<Record<string, OrderTrackingParams>, string>>();
  const isFocused = useIsFocused();
  const { orderId, moduleType = 'food' } = route.params;
  const accent = moduleType === 'grocery' ? colors.grocery.primary : colors.food.primary;
  const pickupLabel = moduleType === 'grocery' ? 'Store' : 'Restaurant';
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // This endpoint still returns rider GPS fields for other clients, but this
      // screen does not read them. Refresh slowly as a status-only safety net.
      const data = await api.get<Tracking>(`/orders/${orderId}/tracking`);
      setTracking(data);
    } catch (e: any) {
      console.warn('Order detail refresh failed', e?.response?.data || e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!isFocused) return;
    void load();
    // Status fallback only (not live GPS); WebSocket events refresh immediately.
    // Terminal orders stop polling entirely.
    const timer = setInterval(() => {
      if (!TERMINAL.has(tracking?.status || '')) void load(true);
    }, 60000);
    return () => clearInterval(timer);
  }, [isFocused, load, tracking?.status]);

  useOrderRealtime((event) => {
    // The realtime channel is a cue to fetch authoritative state, not proof itself.
    if (event.event === 'order.status_updated' || event.event === 'order.delivery_status_updated') {
      void load(true);
    }
  }, orderId);

  const isDelivered = tracking?.status === 'delivered';
  const journey = journeyForStatus(tracking?.status);
  const completedStages = useMemo(() => Math.max(0, TRACK_ORDER.indexOf(tracking?.status || 'pending_dispatch')), [tracking?.status]);

  const submitRating = async (stars: number) => {
    if (submittingRating) return;
    setRatingDraft(stars);
    setSubmittingRating(true);
    try {
      await api.post(`/orders/${orderId}/rating`, { rating: stars });
      setTracking((t) => (t ? { ...t, customer_rating: stars } : t));
    } catch (e: any) {
      setRatingDraft(0);
      console.warn('Rating error', e?.response?.data || e?.message);
    } finally {
      setSubmittingRating(false);
    }
  };

  const statusText = tracking?.status === 'in_transit' || tracking?.status === 'picked_up'
    ? 'Your rider is on the way'
    : tracking?.status === 'delivery_assigned'
      ? `Rider assigned — heading to the ${pickupLabel.toLowerCase()}`
      : tracking?.status === 'delivered'
        ? 'Delivered successfully'
        : tracking?.status === 'cancelled' || tracking?.status === 'no_store_available' || tracking?.status === 'failed'
          ? 'This order is no longer active'
          : moduleType === 'grocery'
            ? 'Your store is packing your order'
            : 'We are preparing your order';

  if (loading && !tracking) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={accent} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.eyebrow, { color: accent }]}>ORDER DETAIL</Text>
          <Text style={styles.title}>#{tracking?.order_number || orderId.slice(0, 8)}</Text>
        </View>
        {tracking && <OrderStatusBadge status={tracking.status} size="small" />}
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        <View style={[styles.etaHero, { backgroundColor: accent + '0F' }]}>
          <View style={styles.etaHeroTop}>
            <JinniSparkleAccent size={22} />
            <Text style={[styles.etaBig, { color: accent }]}>{isDelivered ? 'Delivered' : 'Order journey'}</Text>
          </View>
          <Text style={styles.etaSub}>
            {isDelivered ? 'Thanks for ordering locally.' : 'Updates follow confirmed order status. This is not live GPS.'}
          </Text>
        </View>
        <JinniMagicJourney stage={journey.stage} accent={accent} pickupLabel={pickupLabel} statusLabel={journey.label} />

        <View style={styles.sheet}>
          <Text style={styles.statusTitle}>{statusText}</Text>
          {tracking?.rider ? (
            <View style={styles.riderCard}>
              <View style={styles.avatar}><Ionicons name="bicycle" size={20} color={accent} /></View>
              <View style={styles.riderInfo}>
                <Text style={styles.riderName}>{tracking.rider.name || 'Delivery partner'}</Text>
                <View style={styles.riderMetaRow}>
                  <Ionicons name="star" size={12} color={colors.warning.DEFAULT} />
                  <Text style={styles.riderMeta}>{tracking.rider.rating != null ? tracking.rider.rating.toFixed(1) : 'Rating unavailable'}</Text>
                  {tracking.rider.vehicle_type ? <Text style={styles.riderMeta}>· {tracking.rider.vehicle_type}</Text> : null}
                </View>
              </View>
              {tracking.rider.phone ? (
                <TouchableOpacity style={[styles.callBtn, { backgroundColor: accent + '14' }]} onPress={() => tracking.rider?.phone && Linking.openURL(`tel:${tracking.rider.phone}`)}>
                  <Ionicons name="call" size={18} color={accent} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {isDelivered ? (
            <View style={styles.rateCard}>
              {tracking?.customer_rating ? (
                <View style={styles.rateDoneRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success.DEFAULT} />
                  <Text style={styles.rateDoneText}>You rated this order {tracking.customer_rating} star{tracking.customer_rating > 1 ? 's' : ''} — thanks!</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.rateTitle}>How was your order?</Text>
                  <View style={styles.starsRow}>{[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => submitRating(n)} disabled={submittingRating} hitSlop={6}>
                      <Ionicons name={n <= ratingDraft ? 'star' : 'star-outline'} size={30} color={n <= ratingDraft ? colors.warning.DEFAULT : colors.gray[300]} />
                    </TouchableOpacity>
                  ))}</View>
                </>
              )}
            </View>
          ) : null}

          <View style={styles.timeline}>
            {['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'in_transit', 'delivered'].map((s, index, all) => {
              const done = TRACK_ORDER.indexOf(s) <= completedStages;
              const label = s === 'pending_dispatch' ? 'Order placed'
                : s === 'store_accepted' ? `${pickupLabel} accepted`
                : s === 'preparing' ? (moduleType === 'grocery' ? 'Packing your order' : 'Preparing your food')
                : s === 'ready_for_pickup' ? 'Ready for pickup'
                : s === 'delivery_assigned' ? 'Rider assigned'
                : s === 'picked_up' ? 'Picked up'
                : s === 'in_transit' ? 'On the way' : 'Delivered';
              return <View key={s} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, done && { backgroundColor: accent, borderColor: accent }]}>{done && <Ionicons name="checkmark" size={10} color={colors.white} />}</View>
                  {index < all.length - 1 && <View style={[styles.timelineLine, done && { backgroundColor: accent }]} />}
                </View>
                <Text style={[styles.timelineText, done && styles.timelineTextDone]}>{label}</Text>
              </View>;
            })}
          </View>

          <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); void load(); }} disabled={refreshing}>
            {refreshing ? <ActivityIndicator color={accent} size="small" /> : <><Ionicons name="refresh" size={17} color={accent} /><Text style={[styles.refreshText, { color: accent }]}>Refresh status</Text></>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white },
  eyebrow: { ...typography.overline },
  title: { ...typography.h4, color: colors.gray[900], marginTop: 2 },
  scrollBody: { paddingBottom: spacing.xl },
  etaHero: { paddingTop: spacing.md, paddingBottom: spacing.sm, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  etaHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  etaBig: { ...typography.h2, fontFamily: fontFamily.bold },
  etaSub: { ...typography.body2, color: colors.gray[500], textAlign: 'center', marginTop: 2, paddingHorizontal: spacing.lg },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  statusTitle: { ...typography.h5, color: colors.gray[900] },
  riderCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.gray[100], borderRadius: borderRadius.md, backgroundColor: colors.surface.sunken },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  riderInfo: { flex: 1, marginLeft: spacing.md },
  riderName: { ...typography.h6, color: colors.gray[900] },
  riderMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  riderMeta: { ...typography.caption, color: colors.gray[500] },
  callBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rateCard: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.md, backgroundColor: colors.surface.sunken, alignItems: 'center' },
  rateTitle: { ...typography.label, color: colors.gray[800], marginBottom: spacing.sm },
  starsRow: { flexDirection: 'row', gap: 6 },
  rateDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rateDoneText: { ...typography.caption, color: colors.gray[600] },
  timeline: { marginTop: spacing.lg },
  timelineRow: { flexDirection: 'row', minHeight: 28 },
  timelineRail: { width: 24, alignItems: 'center' },
  timelineDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: colors.gray[300], backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.gray[200], marginVertical: 2 },
  timelineText: { ...typography.caption, color: colors.gray[400], marginLeft: 8, paddingTop: 0 },
  timelineTextDone: { color: colors.gray[800], fontFamily: typography.label.fontFamily },
  refreshBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.md, marginBottom: spacing.md, paddingVertical: 7 },
  refreshText: { ...typography.label },
});

export default OrderTrackingScreen;
