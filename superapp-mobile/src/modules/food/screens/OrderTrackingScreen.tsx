import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Circle, Marker, Polyline, Region } from 'react-native-maps';
import { useRoute, RouteProp } from '@react-navigation/native';
import { FoodStackParamList } from '@navigation/stacks/FoodStack';
import { OrderStatusBadge } from '@components/OrderStatusBadge';
import { JinniSparkleAccent } from '@components/JinniSparkleAccent';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';
import { api } from '@services/api';

type Tracking = {
  order_id: string;
  order_number: string;
  status: string;
  delivery_address: any;
  pickup_address: any;
  destination: { latitude?: number; longitude?: number };
  rider?: { name?: string; phone?: string; latitude?: number; longitude?: number; accuracy?: number; updated_at?: string } | null;
};

const ACTIVE = new Set(['delivery_assigned', 'picked_up', 'in_transit']);

const coords = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    ? { latitude: Number(lat), longitude: Number(lng) }
    : null;

export const OrderTrackingScreen: React.FC = () => {
  const route = useRoute<RouteProp<FoodStackParamList, 'OrderTracking'>>();
  const { orderId } = route.params;
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mapRef = useRef<MapView>(null);

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
    return () => clearInterval(timer);
  }, [load]);

  const rider = coords(tracking?.rider?.latitude, tracking?.rider?.longitude);
  const destination = coords(tracking?.destination?.latitude, tracking?.destination?.longitude);
  const pickup = coords(tracking?.pickup_address?.latitude, tracking?.pickup_address?.longitude);
  const mapCenter = rider || destination || pickup;

  useEffect(() => {
    if (!mapCenter) return;
    mapRef.current?.animateToRegion({ ...mapCenter, latitudeDelta: 0.018, longitudeDelta: 0.018 }, 500);
  }, [tracking?.rider?.latitude, tracking?.rider?.longitude, tracking?.destination?.latitude, tracking?.destination?.longitude]);

  const routeLine = useMemo(() => {
    if (!rider || !destination) return [];
    return [rider, destination];
  }, [rider?.latitude, rider?.longitude, destination?.latitude, destination?.longitude]);

  const statusText = tracking?.status === 'in_transit' || tracking?.status === 'picked_up'
    ? 'Your rider is on the way'
    : tracking?.status === 'delivery_assigned'
      ? 'Rider assigned — heading to the restaurant'
      : tracking?.status === 'delivered'
        ? 'Delivered successfully'
        : 'We are preparing your order';

  if (loading && !tracking) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={colors.food.primary} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>ORDER TRACKING</Text>
          <Text style={styles.title}>#{tracking?.order_number || orderId.slice(0, 8)}</Text>
        </View>
        {tracking && <OrderStatusBadge status={tracking.status} size="small" />}
      </View>

      <View style={styles.mapWrap}>
        {mapCenter ? (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{ ...mapCenter, latitudeDelta: 0.018, longitudeDelta: 0.018 }}
            toolbarEnabled={false}
            rotateEnabled={false}
          >
            {pickup && <Marker coordinate={pickup} title="Restaurant" description="Pickup point"><View style={[styles.mapPin, styles.restaurantPin]}><Ionicons name="restaurant" size={16} color={colors.white} /></View></Marker>}
            {destination && <Marker coordinate={destination} title="Delivery address"><View style={[styles.mapPin, styles.destinationPin]}><Ionicons name="home" size={16} color={colors.white} /></View></Marker>}
            {rider && (
              <>
                <Circle center={rider} radius={Math.max(12, tracking?.rider?.accuracy || 20)} fillColor={colors.food.primary + '22'} strokeColor={colors.food.primary + '66'} />
                <Marker coordinate={rider} title={tracking?.rider?.name || 'Delivery partner'} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={styles.riderPin}><Ionicons name="bicycle" size={22} color={colors.food.primary} /></View>
                </Marker>
                {destination && <Polyline coordinates={routeLine} strokeColor={colors.food.primary} strokeWidth={4} lineDashPattern={[1]} /> }
              </>
            )}
          </MapView>
        ) : (
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={42} color={colors.gray[300]} />
            <Text style={styles.fallbackTitle}>Live map will appear when location is available</Text>
            <Text style={styles.fallbackText}>Your delivery partner's GPS location will update automatically after pickup.</Text>
          </View>
        )}
        <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>{ACTIVE.has(tracking?.status || '') ? 'LIVE' : 'TRACKING'}</Text></View>
        <View style={styles.mapCredit}><Text>Map view · live rider location</Text></View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.statusTitleRow}>
          {tracking?.status === 'delivered' && (
            <JinniSparkleAccent size={64} style={styles.sparkleBehindTitle} />
          )}
          <Text style={styles.statusTitle}>{statusText}</Text>
        </View>
        <Text style={styles.eta}>{tracking?.status === 'delivered' ? 'Thanks for ordering locally.' : 'Location refreshes automatically every few seconds.'}</Text>

        {tracking?.rider ? (
          <View style={styles.riderCard}>
            <View style={styles.avatar}><Ionicons name="bicycle" size={20} color={colors.food.primary} /></View>
            <View style={styles.riderInfo}>
              <Text style={styles.riderName}>{tracking.rider.name || 'Delivery partner'}</Text>
              <Text style={styles.riderMeta}>{tracking.rider.updated_at ? 'Location updated just now' : 'Waiting for GPS signal'}</Text>
            </View>
            {tracking.rider.phone ? <TouchableOpacity style={styles.callBtn} onPress={() => tracking.rider?.phone && Linking.openURL(`tel:${tracking.rider.phone}`)}><Ionicons name="call" size={18} color={colors.food.primary} /></TouchableOpacity> : null}
          </View>
        ) : null}

        <View style={styles.timeline}>
          {['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'delivered'].map((s, index, all) => {
            const order = ['pending_dispatch', 'store_accepted', 'preparing', 'ready_for_pickup', 'delivery_assigned', 'picked_up', 'in_transit', 'delivered'];
            const current = order.indexOf(tracking?.status || 'pending_dispatch');
            const done = order.indexOf(s) <= current;
            return <View key={s} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={[styles.timelineDot, done && styles.timelineDotDone]}>{done && <Ionicons name="checkmark" size={10} color={colors.white} />}</View>
                {index < all.length - 1 && <View style={[styles.timelineLine, done && styles.timelineLineDone]} />}
              </View>
              <Text style={[styles.timelineText, done && styles.timelineTextDone]}>{s === 'pending_dispatch' ? 'Order placed' : s === 'store_accepted' ? 'Restaurant accepted' : s === 'preparing' ? 'Preparing your food' : s === 'ready_for_pickup' ? 'Ready for pickup' : s === 'delivery_assigned' ? 'Rider assigned' : s === 'picked_up' ? 'Picked up' : 'Delivered'}</Text>
            </View>;
          })}
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={() => { setRefreshing(true); load(); }} disabled={refreshing}>
          {refreshing ? <ActivityIndicator color={colors.food.primary} size="small" /> : <><Ionicons name="refresh" size={17} color={colors.food.primary} /><Text style={styles.refreshText}>Refresh tracking</Text></>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white },
  eyebrow: { ...typography.overline, color: colors.food.primary },
  title: { ...typography.h4, color: colors.gray[900], marginTop: 2 },
  mapWrap: { height: 330, backgroundColor: colors.gray[100], overflow: 'hidden', position: 'relative' },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  fallbackTitle: { ...typography.h6, color: colors.gray[700], textAlign: 'center', marginTop: spacing.md },
  fallbackText: { ...typography.body2, color: colors.gray[500], textAlign: 'center', marginTop: spacing.xs },
  livePill: { position: 'absolute', top: spacing.md, left: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, elevation: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.food.primary },
  liveText: { ...typography.caption, color: colors.gray[800], fontFamily: typography.label.fontFamily },
  mapCredit: { position: 'absolute', right: 4, bottom: 3, backgroundColor: colors.white + 'DD', paddingHorizontal: 4, paddingVertical: 2 },
  mapPin: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.white, elevation: 4 },
  restaurantPin: { backgroundColor: colors.primary[700] },
  destinationPin: { backgroundColor: colors.food.primary },
  riderPin: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.food.primary, elevation: 5 },
  sheet: { flex: 1, backgroundColor: colors.white, marginTop: -12, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: spacing.lg, paddingTop: 8 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.gray[200], alignSelf: 'center', marginBottom: spacing.md },
  statusTitleRow: { alignItems: 'flex-start', justifyContent: 'center' },
  sparkleBehindTitle: { position: 'absolute', left: -14, top: -22 },
  statusTitle: { ...typography.h5, color: colors.gray[900] },
  eta: { ...typography.body2, color: colors.gray[500], marginTop: 2 },
  riderCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.gray[100], borderRadius: borderRadius.md, backgroundColor: colors.surface.sunken },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  riderInfo: { flex: 1, marginLeft: spacing.md },
  riderName: { ...typography.h6, color: colors.gray[900] },
  riderMeta: { ...typography.caption, color: colors.gray[500], marginTop: 1 },
  callBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.food.primary + '14', alignItems: 'center', justifyContent: 'center' },
  timeline: { marginTop: spacing.md },
  timelineRow: { flexDirection: 'row', minHeight: 28 },
  timelineRail: { width: 24, alignItems: 'center' },
  timelineDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: colors.gray[300], backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  timelineDotDone: { backgroundColor: colors.food.primary, borderColor: colors.food.primary },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.gray[200], marginVertical: 2 },
  timelineLineDone: { backgroundColor: colors.food.primary },
  timelineText: { ...typography.caption, color: colors.gray[400], marginLeft: 8, paddingTop: 0 },
  timelineTextDone: { color: colors.gray[800], fontFamily: typography.label.fontFamily },
  refreshBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, marginBottom: spacing.md, paddingVertical: 7 },
  refreshText: { ...typography.label, color: colors.food.primary },
});

export default OrderTrackingScreen;
