import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, shadows, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { useOrderRealtime } from '@shared/hooks/useOrderRealtime';

interface ActiveOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  payment_method: string;
  delivery_fee: number;
  delivery_address: any;
  pickup_address: any;
  // delivery_otp intentionally no longer part of this response — OTPs are
  // never returned by the API. See app.modules.delivery_otp on the backend.
  items: Array<{ name: string; qty: number }>;
}

const STATUS_FLOW = ['delivery_assigned', 'picked_up', 'in_transit', 'delivered'];

const STATUS_LABEL: Record<string, string> = {
  delivery_assigned: 'Head to Pickup',
  picked_up: 'Head to Customer',
  in_transit: 'In Transit',
  delivered: 'Delivered',
};

const openMaps = (address: any) => {
  if (!address) return;
  const query = encodeURIComponent(
    [address.line1, address.city, address.pincode].filter(Boolean).join(', ')
  );
  const url = Platform.OS === 'ios'
    ? `maps://maps.apple.com/?q=${query}`
    : `geo:0,0?q=${query}`;
  Linking.openURL(url).catch(() =>
    Linking.openURL(`https://maps.google.com/?q=${query}`)
  );
};

export const DeliveryActiveOrderScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [order, setOrder] = useState<ActiveOrder | null>(route.params?.order ?? null);
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppHint, setWhatsAppHint] = useState<string | null>(null);
  const [channelStatus, setChannelStatus] = useState<string | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  // Live updates for the OTP delivery channel (WhatsApp Delivered, SMS
  // fallback kicking in, etc.) and for the final delivered/manual-complete
  // event — without this the screen only ever showed the status returned
  // by the initial "Confirm Delivery" tap and never reflected anything that
  // happened afterwards (a delayed webhook, an admin manual completion from
  // another device). Falls back silently to the existing polling/manual
  // refresh if the socket can't connect.
  useOrderRealtime((evt) => {
    if (evt.event === 'order.delivery_status_updated' || evt.event === 'order.status_updated') {
      if (typeof evt.status === 'string') {
        setOrder((prev) => (prev ? { ...prev, status: evt.status as string } : prev));
      }
    }
    if (typeof (evt as any).channelStatus === 'string') {
      setChannelStatus((evt as any).channelStatus);
    }
  }, order?.id);

  useEffect(() => {
    let cancelled = false;
    const startTracking = async () => {
      if (!order || !['picked_up', 'in_transit'].includes(order.status)) return;
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      locationSubscription.current?.remove();
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
        async (position) => {
          try {
            await api.patch(`/delivery/location?order_id=${encodeURIComponent(order.id)}`, {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              speed: position.coords.speed != null ? position.coords.speed * 3.6 : null,
              heading: position.coords.heading,
            });
            setOrder(prev => prev && prev.status === 'picked_up' ? { ...prev, status: 'in_transit' } : prev);
          } catch (e) {
            console.warn('Location update failed', e);
          }
        }
      );
    };
    startTracking();
    return () => { cancelled = true; locationSubscription.current?.remove(); locationSubscription.current = null; };
  }, [order?.id, order?.status]);

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="bicycle-outline" size={64} color={colors.gray[300]} />
          <Text style={styles.emptyTitle}>No Active Order</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentStatusIndex = STATUS_FLOW.indexOf(order.status);

  const handlePickup = async () => {
    setLoading(true);
    try {
      await api.post(`/delivery/orders/${order.id}/pickup`, {});
      setOrder(prev => prev ? { ...prev, status: 'picked_up' } : prev);
      Alert.alert('✅ Pickup Confirmed', 'Head to the customer now!');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to confirm pickup');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async () => {
    setSendingWhatsApp(true);
    try {
      const res = await api.post(`/orders/${order.id}/delivery-otp`, {});
      setWhatsAppHint(res.phone_hint ?? null);
      setChannelStatus(res.channel_status ?? 'sending');
      const ch = res.channel_status || '';
      let msg = 'OTP is being sent to the customer. Ask them for the 6-digit code.';
      if (ch === 'whatsapp_sent' || ch === 'whatsapp_delivered') msg = 'OTP sent via WhatsApp. Ask the customer for the code.';
      else if (ch === 'sms_sent') msg = 'OTP sent via SMS (WhatsApp unavailable). Ask the customer for the code.';
      else if (ch === 'failed') msg = 'Could not deliver OTP. You can still try entering a code, or contact Super Admin.';
      Alert.alert('✅ Confirm Delivery', msg);
      setShowOtpInput(true);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to start delivery verification');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleResendOtp = async () => {
    setSendingWhatsApp(true);
    try {
      const res = await api.post(`/orders/${order.id}/delivery-otp/resend`, {});
      setWhatsAppHint(res.phone_hint ?? null);
      setChannelStatus(res.channel_status ?? null);
      Alert.alert('OTP Resent', 'A new code was sent to the customer.');
    } catch (e: any) {
      Alert.alert('Resend', e?.response?.data?.detail ?? 'Could not resend OTP');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleDeliver = async () => {
    if (!otp.trim() || otp.length < 6) {
      Alert.alert('Enter OTP', 'Please enter the 6-digit OTP given by the customer');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/orders/${order.id}/delivery-otp/verify`, { otp: otp.trim() });
      Alert.alert(
        '🎉 Delivered!',
        `Order #${order.order_number} delivered successfully!`,
        [{ text: 'Done', onPress: () => navigation.navigate('Dashboard') }]
      );
    } catch (e: any) {
      Alert.alert('OTP Error', e?.response?.data?.detail ?? 'Incorrect OTP. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Delivery</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Order Info */}
        <View style={styles.orderInfoCard}>
          <View style={styles.orderInfoRow}>
            <Text style={styles.orderNumberLarge}>#{order.order_number}</Text>
            <View style={[styles.statusBadge, { backgroundColor: order.status === 'delivered' ? colors.success.DEFAULT : colors.info.DEFAULT }]}>
              <Text style={styles.statusBadgeText}>{STATUS_LABEL[order.status] ?? order.status}</Text>
            </View>
          </View>
          <View style={styles.orderInfoRow}>
            <Text style={styles.orderTotal}>₹{order.total_amount?.toFixed(0)}</Text>
            <Text style={[styles.paymentMethod, order.payment_method === 'cod' && styles.codText]}>
              {order.payment_method?.toUpperCase()} {order.payment_method === 'cod' ? '(Collect Cash)' : '(Paid)'}
            </Text>
          </View>
        </View>

        {/* Progress Steps */}
        <View style={styles.progressCard}>
          {STATUS_FLOW.slice(0, -1).map((s, i) => (
            <View key={s} style={styles.progressStep}>
              <View style={[
                styles.progressDot,
                currentStatusIndex > i && styles.progressDotDone,
                currentStatusIndex === i && styles.progressDotActive,
              ]}>
                {currentStatusIndex > i ? (
                  <Ionicons name="checkmark" size={12} color={colors.white} />
                ) : currentStatusIndex === i ? (
                  <View style={styles.progressDotInner} />
                ) : null}
              </View>
              {i < STATUS_FLOW.length - 2 && (
                <View style={[styles.progressLine, currentStatusIndex > i && styles.progressLineDone]} />
              )}
            </View>
          ))}
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>Assigned</Text>
            <Text style={styles.progressLabel}>Picked Up</Text>
            <Text style={styles.progressLabel}>Delivered</Text>
          </View>
        </View>

        {/* Pickup Address */}
        <View style={styles.addressCard}>
          <View style={styles.addressHeader}>
            <View style={[styles.addressIcon, { backgroundColor: colors.success.light }]}>
              <Ionicons name="storefront-outline" size={18} color={colors.success.DEFAULT} />
            </View>
            <Text style={styles.addressTitle}>Pickup from Store</Text>
            <TouchableOpacity onPress={() => openMaps(order.pickup_address)} style={styles.directionsBtn}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary[500]} />
              <Text style={styles.directionsBtnText}>Directions</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.addressMain}>{order.pickup_address?.line1 ?? 'Store address'}</Text>
          {order.pickup_address?.line2 ? <Text style={styles.addressSub}>{order.pickup_address.line2}</Text> : null}
          <Text style={styles.addressSub}>{order.pickup_address?.city} {order.pickup_address?.pincode}</Text>
        </View>

        {/* Delivery Address */}
        <View style={styles.addressCard}>
          <View style={styles.addressHeader}>
            <View style={[styles.addressIcon, { backgroundColor: colors.error.light }]}>
              <Ionicons name="location-outline" size={18} color={colors.error.DEFAULT} />
            </View>
            <Text style={styles.addressTitle}>Deliver to Customer</Text>
            <TouchableOpacity onPress={() => openMaps(order.delivery_address)} style={styles.directionsBtn}>
              <Ionicons name="navigate-outline" size={16} color={colors.primary[500]} />
              <Text style={styles.directionsBtnText}>Directions</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.addressMain}>{order.delivery_address?.line1 ?? 'Delivery address'}</Text>
          {order.delivery_address?.line2 ? <Text style={styles.addressSub}>{order.delivery_address.line2}</Text> : null}
          <Text style={styles.addressSub}>{order.delivery_address?.city} {order.delivery_address?.pincode}</Text>
        </View>

        {/* Items */}
        <View style={styles.itemsCard}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          {order.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQty}>×{item.qty}</Text>
            </View>
          ))}
        </View>

        {/* OTP Section */}
        {order.status !== 'delivered' && (order.status === 'picked_up' || order.status === 'in_transit') && (
          <View style={styles.otpCard}>
            <View style={styles.otpHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#7C3AED" />
              <Text style={styles.otpTitle}>Delivery Confirmation</Text>
            </View>
            {whatsAppHint ? (
              <Text style={styles.otpHint}>
                Code sent to {whatsAppHint}
                {channelStatus ? ` · Status: ${channelStatus.replace(/_/g, ' ')}` : ''}.
                {'\n'}Ask the customer for the 6-digit OTP.
              </Text>
            ) : (
              <Text style={styles.otpHint}>
                Tap Confirm Delivery to send a secure OTP to the customer (WhatsApp first, SMS fallback).
              </Text>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          {order.status === 'delivery_assigned' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.pickupBtn, loading && styles.disabledBtn]}
              onPress={handlePickup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="bag-check-outline" size={20} color={colors.white} />
                  <Text style={styles.actionBtnText}>Confirm Pickup</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {(order.status === 'picked_up' || order.status === 'in_transit') && (
            <>
              {!showOtpInput ? (
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deliverBtn, sendingWhatsApp && styles.disabledBtn]}
                    onPress={handleConfirmDelivery}
                    disabled={sendingWhatsApp}
                  >
                    {sendingWhatsApp ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done-outline" size={20} color={colors.white} />
                        <Text style={styles.actionBtnText}>Confirm Delivery</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.otpInputCard}>
                  <Text style={styles.otpInputLabel}>Enter Customer OTP</Text>
                  <TextInput
                    style={styles.otpInput}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="------"
                    placeholderTextColor={colors.gray[300]}
                    autoFocus
                  />
                  <View style={styles.otpBtns}>
                    <TouchableOpacity
                      style={styles.cancelOtpBtn}
                      onPress={() => { setShowOtpInput(false); setOtp(''); setChannelStatus(null); }}
                    >
                      <Text style={styles.cancelOtpBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.confirmOtpBtn, loading && styles.disabledBtn]}
                      onPress={handleDeliver}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <Text style={styles.confirmOtpBtnText}>Verify & Complete</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignItems: 'center' }}
                    onPress={handleResendOtp}
                    disabled={sendingWhatsApp}
                  >
                    <Text style={{ color: colors.primary[500], fontSize: 13 }}>Resend OTP</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[900] },
  orderInfoCard: {
    backgroundColor: colors.white,
    margin: spacing.xl,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  orderInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumberLarge: { fontSize: 22, fontFamily: fontFamily.bold, color: colors.gray[900] },
  statusBadge: { borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 5 },
  statusBadgeText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 12 },
  orderTotal: { fontSize: 20, fontFamily: fontFamily.bold, color: colors.gray[900] },
  paymentMethod: { fontSize: 13, color: colors.gray[400], fontFamily: fontFamily.semiBold },
  codText: { color: colors.warning.dark, fontFamily: fontFamily.bold },
  progressCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  progressStep: { flexDirection: 'row', alignItems: 'center' },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray[100],
    borderWidth: 2,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  progressDotDone: { backgroundColor: colors.success.DEFAULT, borderColor: colors.success.DEFAULT },
  progressDotInner: { width: 8, height: 8, borderRadius: borderRadius.xs, backgroundColor: colors.primary[500] },
  progressLine: { flex: 1, height: 2, backgroundColor: colors.gray[200] },
  progressLineDone: { backgroundColor: colors.success.DEFAULT },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  progressLabel: { fontSize: 10, color: colors.gray[400], fontFamily: fontFamily.semiBold },
  addressCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  addressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  addressIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addressTitle: { flex: 1, fontSize: 14, fontFamily: fontFamily.bold, color: colors.gray[700] },
  directionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.info.light,
    borderRadius: borderRadius.sm,
  },
  directionsBtnText: { color: colors.primary[500], fontSize: 12, fontFamily: fontFamily.semiBold },
  addressMain: { fontSize: 15, fontFamily: fontFamily.semiBold, color: colors.gray[900] },
  addressSub: { fontSize: 12, color: colors.gray[400], marginTop: 2 },
  itemsCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  sectionTitle: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.gray[700], marginBottom: spacing.md },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  itemName: { fontSize: 14, color: colors.gray[700] },
  itemQty: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.gray[900] },
  otpCard: {
    backgroundColor: '#FAF5FF',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  otpHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  otpTitle: { fontSize: 14, fontFamily: fontFamily.bold, color: '#7C3AED' },
  otpHint: { fontSize: 13, color: colors.gray[500] },
  actionsSection: { padding: spacing.xl, gap: spacing.md },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  pickupBtn: { backgroundColor: colors.info.DEFAULT },
  deliverBtn: { backgroundColor: colors.success.DEFAULT },
  whatsappBtn: { backgroundColor: '#25D366' },
  actionBtnText: { color: colors.white, fontSize: 16, fontFamily: fontFamily.bold },
  disabledBtn: { opacity: 0.6 },
  otpInputCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    gap: spacing.md,
  },
  otpInputLabel: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.gray[700], textAlign: 'center' },
  otpInput: {
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    textAlign: 'center',
    fontSize: 28,
    fontFamily: fontFamily.bold,
    letterSpacing: 8,
    color: colors.gray[900],
    borderWidth: 1.5,
    borderColor: colors.gray[200],
  },
  otpBtns: { flexDirection: 'row', gap: spacing.md },
  cancelOtpBtn: {
    flex: 0.4,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gray[200],
  },
  cancelOtpBtnText: { color: colors.gray[500], fontFamily: fontFamily.semiBold },
  confirmOtpBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.success.DEFAULT,
  },
  confirmOtpBtnText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 15 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: 20, fontFamily: fontFamily.bold, color: colors.gray[700] },
  backBtn: {
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  backBtnText: { color: colors.white, fontFamily: fontFamily.bold },
});

export default DeliveryActiveOrderScreen;