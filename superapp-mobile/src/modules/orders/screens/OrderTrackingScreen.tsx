import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp } from '@react-navigation/native';
import { OrderStatusBadge } from '@components/OrderStatusBadge';
import { JinniSparkleAccent } from '@components/JinniSparkleAccent';
import { JinniETAFlight, estimateEtaMinutes, haversineKm } from '@modules/jinni/components/JinniETAFlight';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography, fontFamily } from '@theme/typography';
import { api } from '@services/api';
import { useOrderRealtime } from '@shared/hooks/useOrderRealtime';

/**
 * Shared order-detail / tracking screen, used by both the Food and Grocery
 * stacks and from the Orders tab (OrdersStack -> OrderTracking). `moduleType`
 * (route param, defaults to 'food') only decides the accent colour and the
 * pickup-point label ("Restaurant" vs "Store").
 *
 * No live map here on purpose — react-native-maps + GPS polling was the
 * costly part of this screen (a maps SDK render plus a location ping every
 * few seconds, for every open tracking screen). Instead this shows a
 * distance-derived ETA (see JinniETAFlight) and a Zomato/Blinkit-style rider
 * card with name, phone and rating. The 5s status poll stays — that's just
 * our own `/orders/{id}/tracking` call, not a maps bill.
 */

type OrderTrackingParams = { orderId: string; moduleType?: 'food' | 'grocery' };

type Tracking = {
  order_id: string;
  order_number: string;
  status: string;
  delivery_address: any;
  pickup_address: any;
  destination: { latitude?: number; longitude?: number };
  pickup?: { latitude?: number; longitude?: number };
  rider?: {
    name?: string; phone?: string; rating?: number; vehicle_type?: string;
    latitude?: number; longitude?: number; updated_at?: string;
  } | null;
};

const TRACK_ORDER = ['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'in_transit', 'delivered'];
const ACTIVE = new Set(['delivery_assigned', 'picked_up', 'in_transit']);

const coords = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    ? { latitude: Number(lat), longitude: Number(lng) }
    : null;

export const OrderTrackingScreen: React.FC = () => {
  const route = useRoute<RouteProp<Record<string, OrderTrackingParams>, string>>();
  const { orderId, moduleType = 'food' } = route.params;
  const accent = moduleType === 'grocery' ? colors.grocery.primary : colors.food.primary;
  const pickupLabel = moduleType === 'grocery' ? 'Store' : 'Restaurant';
  const pickupIcon = moduleType === 'grocery' ? 'storefront' : 'restaurant';
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [firstLoadedAt] = useState(() => Date.now());

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.get<Tracking>(`/orders/${orderId}/tracking`);
      setTracking(data);
    } catch (e: any) {
      console.warn('Tracking error', e?.response?.data || e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 5000);
    const clock = setInterval(() => setNowTick(Date.now()), 30000);
    return () => { clearInterval(timer); clearInterval(clock); };
  }, [load]);

  // Realtime push: refetch immediately on a status change instead of
  // waiting for the next 5s poll tick. The 5s poll stays as-is — it's the
  // safety net for missed/delayed socket messages (reconnects, dropped
  // connections) per requirement 8 ("never rely exclusively on ... a
  // socket event").
  useOrderRealtime(() => load(true), orderId);

  const destination = coords(tracking?.destination?.latitude, tracking?.destination?.longitude);
  const pickupPoint = coords(tracking?.pickup?.latitude, tracking?.pickup?.longitude);

  const distanceKm = useMemo(
    () => haversineKm(pickupPoint, destination),
    [pickupPoint?.latitude, pickupPoint?.longitude, destination?.latitude, destination?.longitude]
  );
  const etaMinutes = useMemo(() => estimateEtaMinutes(distanceKm), [distanceKm]);

  const elapsedMinutes = Math.floor((nowTick - firstLoadedAt) / 60000);
  const isDelivered = tracking?.status === 'delivered';
  const remainingMinutes = isDelivered ? 0 : Math.max(2, etaMinutes - elapsedMinutes);

  // Journey progress for the carpet visual: how far through the known
  // status stages we are, nudged forward a little using elapsed vs. ETA so
  // it isn't perfectly stair-stepped between statuses.
  const progress = useMemo(() => {
    const current = TRACK_ORDER.indexOf(tracking?.status || 'pending_dispatch');
    const stageProgress = Math.max(0, current) / (TRACK_ORDER.length - 1);
    const timeProgress = Math.min(1, elapsedMinutes / Math.max(etaMinutes, 1));
    return ACTIVE.has(tracking?.status || '')
      ? Math.max(stageProgress, Math.min(0.95, timeProgress))
      : stageProgress;
  }, [tracking?.status, elapsedMinutes, etaMinutes]);

  const statusText = tracking?.status === 'in_transit' || tracking?.status === 'picked_up'
    ? 'Your rider is on the way'
    : tracking?.status === 'delivery_assigned'
      ? `Rider assigned — heading to the ${pickupLabel.toLowerCase()}`
      : tracking?.status === 'delivered'
        ? 'Delivered successfully'
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
        {/* ETA hero — replaces the old live map */}
        <View style={[styles.etaHero, { backgroundColor: accent + '0F' }]}>
          <View style={styles.etaHeroTop}>
            <JinniSparkleAccent size={22} />
            <Text style={[styles.etaBig, { color: accent }]}>
              {isDelivered ? 'Delivered' : `${remainingMinutes} min`}
            </Text>
          </View>
          <Text style={styles.etaSub}>
            {isDelivered
              ? 'Thanks for ordering locally.'
              : ACTIVE.has(tracking?.status || '')
                ? `Estimated arrival, with a little Jinni magic`
                : `${pickupLabel} is getting your order ready`}
          </Text>
          <JinniETAFlight progress={progress} accent={accent} pickupIcon={pickupIcon as any} pickupLabel={pickupLabel} />
        </View>

        <View style={styles.sheet}>
          <Text style={styles.statusTitle}>{statusText}</Text>

          {tracking?.rider ? (
            <View style={styles.riderCard}>
              <View style={styles.avatar}><Ionicons name="bicycle" size={20} color={accent} /></View>
              <View style={styles.riderInfo}>
                <Text style={styles.riderName}>{tracking.rider.name || 'Delivery partner'}</Text>
                <View style={styles.riderMetaRow}>
                  <Ionicons name="star" size={12} color={colors.warning.DEFAULT} />
                  <Text style={styles.riderMeta}>{(tracking.rider.rating ?? 4.8).toFixed(1)}</Text>
                  {tracking.rider.vehicle_type ? (
                    <Text style={styles.riderMeta}>· {tracking.rider.vehicle_type}</Text>
                  ) : null}
                </View>
              </View>
              {tracking.rider.phone ? (
                <TouchableOpacity
                  style={[styles.callBtn, { backgroundColor: accent + '14' }]}
                  onPress={() => tracking.rider?.phone && Linking.openURL(`tel:${tracking.rider.phone}`)}
                >
                  <Ionicons name="call" size={18} color={accent} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.timeline}>
            {['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'delivered'].map((s, index, all) => {
              const current = TRACK_ORDER.indexOf(tracking?.status || 'pending_dispatch');
              const done = TRACK_ORDER.indexOf(s) <= current;
              const label = s === 'pending_dispatch'
                ? 'Order placed'
                : s === 'store_accepted'
                  ? `${pickupLabel} accepted`
                  : s === 'preparing'
                    ? (moduleType === 'grocery' ? 'Packing your order' : 'Preparing your food')
                    : s === 'ready_for_pickup'
                      ? 'Ready for pickup'
                      : s === 'delivery_assigned'
                        ? 'Rider assigned'
                        : s === 'picked_up'
                          ? 'Picked up'
                          : 'Delivered';
              return <View key={s} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, done && { backgroundColor: accent, borderColor: accent }]}>{done && <Ionicons name="checkmark" size={10} color={colors.white} />}</View>
                  {index < all.length - 1 && <View style={[styles.timelineLine, done && { backgroundColor: accent }]} />}
                </View>
                <Text style={[styles.timelineText, done && styles.timelineTextDone]}>{label}</Text>
              </View>;
            })}
          </View>

          <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); load(); }} disabled={refreshing}>
            {refreshing ? <ActivityIndicator color={accent} size="small" /> : <><Ionicons name="refresh" size={17} color={accent} /><Text style={[styles.refreshText, { color: accent }]}>Refresh</Text></>}
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
  etaSub: { ...typography.body2, color: colors.gray[500], textAlign: 'center', marginTop: 2 },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  statusTitle: { ...typography.h5, color: colors.gray[900] },
  riderCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.gray[100], borderRadius: borderRadius.md, backgroundColor: colors.surface.sunken },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  riderInfo: { flex: 1, marginLeft: spacing.md },
  riderName: { ...typography.h6, color: colors.gray[900] },
  riderMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  riderMeta: { ...typography.caption, color: colors.gray[500] },
  callBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
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
