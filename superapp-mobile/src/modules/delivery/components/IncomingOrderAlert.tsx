import { fontFamily } from '@theme/typography';
/**
 * IncomingOrderAlert
 *
 * Polls /delivery/orders/available every 10 s. When a brand-new order ID
 * appears it vibrates the device and slides up a bottom-sheet modal.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@services/api';
import { borderRadius, spacing } from '@theme/spacing';
import { colors } from '@theme/colors';

interface AvailableOrder {
  id: string;
  order_number: string;
  total_amount: number;
  delivery_fee: number;
  payment_method: string;
  delivery_address: { line1?: string; city?: string } | null;
  pickup_address: { line1?: string } | null;
  delivery_pincode: string;
  items_count: number;
  items: Array<{ name: string; qty: number }>;
}

const POLL_MS = 10_000;
const COUNTDOWN = 30;
const VIBRATE = [0, 500, 200, 500, 200, 500];

export const IncomingOrderAlert: React.FC = () => {
  const [alertOrder, setAlertOrder] = useState<AvailableOrder | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN);

  const alertOrderRef = useRef<AvailableOrder | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    alertOrderRef.current = alertOrder;
  }, [alertOrder]);

  const dismiss = useCallback(() => {
    Vibration.cancel();
    setAlertOrder(null);
    setAccepting(false);
    setCountdown(COUNTDOWN);
  }, []);

  const poll = useCallback(async () => {
    try {
      const orders = await api.get<AvailableOrder[]>('/delivery/orders/available');

      if (!initializedRef.current) {
        orders.forEach((o) => seenIdsRef.current.add(o.id));
        initializedRef.current = true;
        return;
      }

      if (alertOrderRef.current) return;

      const newOrder = orders.find((o) => !seenIdsRef.current.has(o.id));
      if (newOrder) {
        seenIdsRef.current.add(newOrder.id);
        Vibration.vibrate(VIBRATE);
        setCountdown(COUNTDOWN);
        setAlertOrder(newOrder);
      }
    } catch {
      // silently ignored
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (alertOrder) {
      pulseAnim.setValue(1);
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoopRef.current.start();
    } else {
      pulseLoopRef.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [alertOrder, pulseAnim]);

  useEffect(() => {
    if (!alertOrder) return;
    const id = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [alertOrder]);

  useEffect(() => {
    if (alertOrder && countdown === 0) dismiss();
  }, [countdown, alertOrder, dismiss]);

  const handleAccept = async () => {
    if (!alertOrder || accepting) return;
    setAccepting(true);
    const { id, order_number } = alertOrder;
    try {
      await api.post(`/delivery/orders/${id}/accept`, {});
      dismiss();
      Alert.alert(
        '🎉 Order Accepted!',
        `Order #${order_number} is yours.\nGo to Dashboard to track it.`
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Could not accept this order';
      dismiss();
      Alert.alert('Not Available', msg);
    }
  };

  if (!alertOrder) return null;

  const timerColor = countdown > 15 ? colors.success.DEFAULT : countdown > 8 ? colors.warning.DEFAULT : colors.error.DEFAULT;
  const barWidth = `${(countdown / COUNTDOWN) * 100}%` as any;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Countdown progress bar */}
          <View style={styles.timerBarBg}>
            <View style={[styles.timerBarFill, { width: barWidth, backgroundColor: timerColor }]} />
          </View>

          {/* Header row */}
          <View style={styles.headerRow}>
            <Animated.View style={[styles.iconRing, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="bicycle" size={28} color={colors.white} />
            </Animated.View>
            <View style={styles.headerText}>
              <Text style={styles.newOrderLabel}>New Delivery Order!</Text>
              <Text style={styles.orderNumber}>#{alertOrder.order_number}</Text>
            </View>
            <View style={[styles.timerBadge, { borderColor: timerColor }]}>
              <Text style={[styles.timerText, { color: timerColor }]}>{countdown}s</Text>
            </View>
          </View>

          {/* Earnings chips */}
          <View style={styles.earningsRow}>
            <View style={styles.earningChip}>
              <Text style={styles.earningLabel}>You Earn</Text>
              <Text style={styles.earningValue}>₹{alertOrder.delivery_fee.toFixed(0)}</Text>
            </View>
            <View style={styles.earningChip}>
              <Text style={styles.earningLabel}>Order Total</Text>
              <Text style={styles.earningValue}>₹{alertOrder.total_amount.toFixed(0)}</Text>
            </View>
            <View style={[styles.earningChip, alertOrder.payment_method === 'cod' && styles.codChip]}>
              <Text style={styles.earningLabel}>Payment</Text>
              <Text style={[styles.earningValue, alertOrder.payment_method === 'cod' && styles.codText]}>
                {alertOrder.payment_method.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Items summary */}
          <Text style={styles.itemsSummary} numberOfLines={1}>
            {'📦 '}
            {alertOrder.items_count} item{alertOrder.items_count !== 1 ? 's' : ''}{': '}
            {alertOrder.items.slice(0, 2).map((i) => `${i.name} ×${i.qty}`).join(', ')}
            {alertOrder.items_count > 2 ? ` +${alertOrder.items_count - 2} more` : ''}
          </Text>

          {/* Route: pickup → delivery */}
          <View style={styles.addressBlock}>
            <View style={styles.addressRow}>
              <View style={[styles.dot, { backgroundColor: colors.success.DEFAULT }]} />
              <Text style={styles.addressText} numberOfLines={1}>
                {alertOrder.pickup_address?.line1 ?? 'Store pickup'}
              </Text>
            </View>
            <View style={styles.addressLine} />
            <View style={styles.addressRow}>
              <View style={[styles.dot, { backgroundColor: colors.error.DEFAULT }]} />
              <Text style={styles.addressText} numberOfLines={1}>
                {alertOrder.delivery_address?.line1 ??
                  alertOrder.delivery_address?.city ??
                  'Customer address'}
                {' · '}
                {alertOrder.delivery_pincode}
              </Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.buttonsRow}>
            <TouchableOpacity style={styles.skipBtn} onPress={dismiss} disabled={accepting}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, accepting && styles.disabledBtn]}
              onPress={handleAccept}
              disabled={accepting}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.white} />
              <Text style={styles.acceptText}>{accepting ? 'Accepting…' : 'Accept Delivery'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  timerBarBg: { height: 5, backgroundColor: colors.gray[100] },
  timerBarFill: { height: '100%' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.success.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  newOrderLabel: { fontSize: 12, color: colors.success.DEFAULT, fontFamily: fontFamily.bold, letterSpacing: 0.5 },
  orderNumber: { fontSize: 20, fontFamily: fontFamily.bold, color: colors.gray[900], marginTop: 2 },
  timerBadge: {
    borderWidth: 2,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timerText: { fontSize: 16, fontFamily: fontFamily.bold },
  earningsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  earningChip: {
    flex: 1,
    backgroundColor: colors.gray[50],
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: 'center',
  },
  codChip: { backgroundColor: colors.warning.light },
  earningLabel: { fontSize: 10, color: colors.gray[400], marginBottom: 2 },
  earningValue: { fontSize: 15, fontFamily: fontFamily.bold, color: colors.gray[900] },
  codText: { color: colors.warning.dark },
  itemsSummary: {
    fontSize: 12,
    color: colors.gray[500],
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  addressBlock: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: borderRadius.xs },
  addressLine: { height: 12, width: 1.5, backgroundColor: colors.gray[300], marginLeft: 3.25 },
  addressText: { flex: 1, fontSize: 12, color: colors.gray[700] },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  skipBtn: {
    flex: 0.4,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gray[200],
  },
  skipText: { color: colors.gray[500], fontFamily: fontFamily.bold, fontSize: 15 },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.success.DEFAULT,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  acceptText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 15 },
  disabledBtn: { opacity: 0.6 },
});

export default IncomingOrderAlert;