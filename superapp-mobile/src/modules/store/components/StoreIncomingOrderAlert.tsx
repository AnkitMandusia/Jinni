import { fontFamily } from '@theme/typography';
/**
 * StoreIncomingOrderAlert
 *
 * Polls /orders/pending every 10 s for the logged-in store.
 * When a brand-new pending_dispatch order appears (one not in the seen set)
 * it vibrates and slides up a bottom-sheet modal so the owner can
 * Accept or Skip without leaving their current tab.
 *
 * Same stable-poll architecture as IncomingOrderAlert (delivery):
 * - poll() has EMPTY deps → interval created once, never restarted
 * - alertOrderRef keeps poll() in sync with modal state via a ref
 * - Pulse/countdown/auto-dismiss in separate effects (no setState-in-updater)
 * - No useNavigation (wrong context when mounted outside the Stack)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@services/api';
import { borderRadius, spacing } from '@theme/spacing';
import { colors } from '@theme/colors';
import { formatPrice } from '@utils/helpers';

// ── types ──────────────────────────────────────────────────────────────────

interface PendingOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  payment_method: string;
  delivery_address: { line1?: string; city?: string } | null;
  delivery_pincode: string;
  items: Array<{ product_name: string; quantity: number }>;
  created_at: string;
}

// ── constants ──────────────────────────────────────────────────────────────

const POLL_MS = 10_000;
const COUNTDOWN = 45;
const VIBRATE = [0, 400, 200, 400, 200, 400];

// ── component ──────────────────────────────────────────────────────────────

export const StoreIncomingOrderAlert: React.FC = () => {
  const [alertOrder, setAlertOrder] = useState<PendingOrder | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  const alertOrderRef = useRef<PendingOrder | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── Keep ref in sync ──────────────────────────────────────────────────────
  useEffect(() => {
    alertOrderRef.current = alertOrder;
  }, [alertOrder]);

  // ── dismiss ────────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    Vibration.cancel();
    setAlertOrder(null);
    setAccepting(false);
    setCountdown(COUNTDOWN);
    setDeclineMode(false);
    setDeclineReason('');
    setDeclining(false);
  }, []);

  // ── Stable poll — empty deps, reads alertOrderRef ─────────────────────────
  const poll = useCallback(async () => {
    try {
      const orders = await api.get<PendingOrder[]>('/orders/pending');

      if (!initializedRef.current) {
        orders.forEach((o) => seenIdsRef.current.add(o.id));
        initializedRef.current = true;
        return;
      }

      if (alertOrderRef.current) return;

      const newOrder = orders.find(
        (o) => o.status === 'pending_dispatch' && !seenIdsRef.current.has(o.id)
      );
      if (newOrder) {
        seenIdsRef.current.add(newOrder.id);
        Vibration.vibrate(VIBRATE);
        setCountdown(COUNTDOWN);
        setAlertOrder(newOrder);
      }
    } catch {
      // 400 (no store profile / no pincode set) or network — silently ignored
    }
  }, []);

  // ── Single stable interval ────────────────────────────────────────────────
  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // ── Pulse animation after alertOrder state flushes ────────────────────────
  useEffect(() => {
    if (alertOrder) {
      pulseAnim.setValue(1);
      pulseLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
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

  // ── Countdown ticker ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!alertOrder) return;
    const id = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [alertOrder]);

  // ── Auto-dismiss at 0 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (alertOrder && countdown === 0) dismiss();
  }, [countdown, alertOrder, dismiss]);

  // ── Accept ─────────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (!alertOrder || accepting) return;
    setAccepting(true);
    const { id, order_number } = alertOrder;
    try {
      await api.post(`/orders/${id}/accept`, {});
      dismiss();
      Alert.alert(
        '✅ Order Accepted!',
        `Order #${order_number} accepted.\nGo to the Orders tab to manage it.`
      );
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Could not accept this order';
      dismiss();
      Alert.alert('Failed', msg);
    }
  };

  // ── Decline ────────────────────────────────────────────────────────────────
  const handleDecline = async () => {
    if (!alertOrder || !declineReason.trim() || declining) return;
    setDeclining(true);
    const { id, order_number } = alertOrder;
    try {
      await api.post(`/orders/${id}/decline`, { reason: declineReason.trim() });
      dismiss();
      Alert.alert('Order Declined', `Order #${order_number} has been declined.`);
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Could not decline this order';
      dismiss();
      Alert.alert('Failed', msg);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  if (!alertOrder) return null;

  const timerColor = countdown > 20 ? colors.success.DEFAULT : countdown > 10 ? colors.warning.DEFAULT : colors.error.DEFAULT;
  const barWidth = `${(countdown / COUNTDOWN) * 100}%` as any;
  const itemsPreview = alertOrder.items
    .slice(0, 3)
    .map((i) => `${i.product_name} ×${i.quantity}`)
    .join(', ');
  const extraItems = alertOrder.items.length > 3 ? ` +${alertOrder.items.length - 3} more` : '';

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
          {/* Countdown bar */}
          <View style={styles.timerBarBg}>
            <View style={[styles.timerBarFill, { width: barWidth, backgroundColor: timerColor }]} />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <Animated.View style={[styles.iconRing, { transform: [{ scale: pulseAnim }] }]}>
              <Ionicons name="storefront" size={26} color={colors.white} />
            </Animated.View>
            <View style={styles.headerText}>
              <Text style={styles.newOrderLabel}>New Customer Order!</Text>
              <Text style={styles.orderNumber}>#{alertOrder.order_number}</Text>
            </View>
            <View style={[styles.timerBadge, { borderColor: timerColor }]}>
              <Text style={[styles.timerText, { color: timerColor }]}>{countdown}s</Text>
            </View>
          </View>

          {/* Amount & payment */}
          <View style={styles.earningsRow}>
            <View style={styles.earningChip}>
              <Text style={styles.earningLabel}>Order Value</Text>
              <Text style={styles.earningValue}>{formatPrice(alertOrder.total_amount)}</Text>
            </View>
            <View style={[styles.earningChip, alertOrder.payment_method === 'cod' && styles.codChip]}>
              <Text style={styles.earningLabel}>Payment</Text>
              <Text style={[styles.earningValue, alertOrder.payment_method === 'cod' && styles.codText]}>
                {alertOrder.payment_method?.toUpperCase() ?? 'COD'}
              </Text>
            </View>
            <View style={styles.earningChip}>
              <Text style={styles.earningLabel}>Items</Text>
              <Text style={styles.earningValue}>{alertOrder.items.length}</Text>
            </View>
          </View>

          {/* Items preview */}
          <Text style={styles.itemsSummary} numberOfLines={2}>
            {'🛒 '}{itemsPreview}{extraItems}
          </Text>

          {/* Delivery address */}
          <View style={styles.addressBlock}>
            <View style={styles.addressRow}>
              <View style={[styles.dot, { backgroundColor: colors.error.DEFAULT }]} />
              <Text style={styles.addressText} numberOfLines={1}>
                {alertOrder.delivery_address?.line1 ??
                  alertOrder.delivery_address?.city ??
                  'Customer address'}
                {alertOrder.delivery_pincode ? ` · ${alertOrder.delivery_pincode}` : ''}
              </Text>
            </View>
          </View>

          {/* Decline mode: reason input */}
          {declineMode ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <Text style={styles.declineModeTitle}>Why are you declining?</Text>
              <Text style={styles.declineModeSubtitle}>
                This note will be sent to the customer as a reason.
              </Text>
              <TextInput
                style={styles.declineInput}
                placeholder="e.g. The requested item is currently out of stock."
                placeholderTextColor={colors.gray[400]}
                value={declineReason}
                onChangeText={setDeclineReason}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={500}
                autoFocus
              />
              <Text style={styles.charCount}>{declineReason.length}/500</Text>
              <View style={styles.buttonsRow}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => { setDeclineMode(false); setDeclineReason(''); }}
                  disabled={declining}
                >
                  <Text style={styles.backBtnText}>← Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmDeclineBtn, (!declineReason.trim() || declining) && styles.disabledBtn]}
                  onPress={handleDecline}
                  disabled={!declineReason.trim() || declining}
                >
                  <Ionicons name="close-circle" size={18} color={colors.white} />
                  <Text style={styles.confirmDeclineText}>{declining ? 'Declining…' : 'Confirm Decline'}</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          ) : (
            /* Normal mode: action buttons */
            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={() => setDeclineMode(true)}
                disabled={accepting}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.error.DEFAULT} />
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, accepting && styles.disabledBtn]}
                onPress={handleAccept}
                disabled={accepting}
              >
                <Ionicons name="checkmark-circle" size={20} color={colors.white} />
                <Text style={styles.acceptText}>{accepting ? 'Accepting…' : 'Accept Order'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ── styles ──────────────────────────────────────────────────────────────────

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
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  newOrderLabel: { fontSize: 12, color: '#6366F1', fontFamily: fontFamily.bold, letterSpacing: 0.5 },
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
    fontSize: 13,
    color: colors.gray[700],
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  addressBlock: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: borderRadius.xs },
  addressText: { flex: 1, fontSize: 12, color: colors.gray[700] },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  declineBtn: {
    flex: 0.45,
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.error.DEFAULT,
  },
  declineBtnText: { color: colors.error.DEFAULT, fontFamily: fontFamily.bold, fontSize: 15 },
  declineModeTitle: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    color: colors.gray[900],
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  declineModeSubtitle: {
    fontSize: 12,
    color: colors.gray[500],
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  declineInput: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    fontSize: 13,
    color: colors.gray[900],
    minHeight: 80,
    backgroundColor: colors.gray[50],
  },
  charCount: {
    fontSize: 11,
    color: colors.gray[400],
    textAlign: 'right',
    marginRight: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  backBtn: {
    flex: 0.35,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.gray[200],
  },
  backBtnText: { color: colors.gray[500], fontFamily: fontFamily.bold, fontSize: 14 },
  confirmDeclineBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.error.DEFAULT,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmDeclineText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 14 },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  acceptText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 15 },
  disabledBtn: { opacity: 0.6 },
});

export default StoreIncomingOrderAlert;