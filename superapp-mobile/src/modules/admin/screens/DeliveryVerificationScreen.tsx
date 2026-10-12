import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { adminService, DeliveryVerification } from '@services/admin.service';
import type { AdminStackParamList } from '@navigation/AdminNavigator';

type RouteParams = RouteProp<AdminStackParamList, 'DeliveryVerification'>;

const CHANNEL_STATUS_LABELS: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  sending: { label: 'Sending…', color: colors.info.dark, icon: 'time-outline' },
  whatsapp_sent: { label: 'WhatsApp Sent', color: colors.info.dark, icon: 'logo-whatsapp' },
  whatsapp_delivered: { label: 'WhatsApp Delivered', color: colors.success.dark, icon: 'checkmark-done' },
  sms_sent: { label: 'SMS Sent (fallback)', color: colors.warning.dark, icon: 'chatbox-outline' },
  sms_delivered: { label: 'SMS Delivered (fallback)', color: colors.success.dark, icon: 'checkmark-done' },
  failed: { label: 'Failed — both channels', color: colors.error.dark, icon: 'close-circle' },
};

export const DeliveryVerificationScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AdminStackParamList>>();
  const route = useRoute<RouteParams>();
  const { orderId, orderNumber } = route.params;

  const [data, setData] = useState<DeliveryVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await adminService.getDeliveryVerification(orderId);
      setData(res);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not load delivery verification status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
    // Poll while this screen is open — manual completion is a rare,
    // deliberate admin action so a 5s poll is simpler and safer here than
    // wiring a dedicated WebSocket listener just for this screen; the
    // order-level realtime event still fires for the customer/delivery apps.
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, [load]);

  const handleManualComplete = async () => {
    if (reason.trim().length < 10) {
      Alert.alert('Reason required', 'Please enter at least 10 characters explaining why you verified this delivery manually.');
      return;
    }
    setSubmitting(true);
    try {
      await adminService.manualCompleteDelivery(orderId, reason.trim());
      setModalVisible(false);
      setReason('');
      Alert.alert('Done', 'Order marked as delivered. All apps will update automatically.');
      await load();
    } catch (e: any) {
      Alert.alert('Could not complete', e?.message ?? 'The order may have already been completed, or you may not have permission.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </SafeAreaView>
    );
  }

  const channel = data?.channel_status ? CHANNEL_STATUS_LABELS[data.channel_status] : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delivery Verification</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.card}>
          <Text style={styles.orderNo}>#{orderNumber ?? data?.order_number}</Text>
          <Text style={styles.orderStatus}>Current status: {data?.status}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Row label="Phone" value={data?.customer_phone_hint ?? '—'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery Partner</Text>
          <Row label="Assigned" value={data?.delivery_agent_name ?? 'Unassigned'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>OTP Delivery Status</Text>
          {channel && (
            <View style={[styles.statusChip, { backgroundColor: channel.color + '1A' }]}>
              <Ionicons name={channel.icon} size={16} color={channel.color} />
              <Text style={[styles.statusChipText, { color: channel.color }]}>{channel.label}</Text>
            </View>
          )}
          <Row label="WhatsApp" value={data?.whatsapp_status ?? '—'} />
          <Row label="SMS" value={data?.sms_status ?? '—'} />
          <Row label="OTP active" value={data?.otp_active ? 'Yes' : 'No / expired'} />
          {data?.failure_reason && <Row label="Failure reason" value={data.failure_reason} warn />}
        </View>

        {data && data.manual_complete_history.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Manual Completion History</Text>
            {data.manual_complete_history.map((h, idx) => (
              <View key={idx} style={styles.historyRow}>
                <Text style={styles.historyText}>
                  {new Date(h.created_at).toLocaleString('en-IN')} — {h.previous_status} → {h.new_status}
                </Text>
                <Text style={styles.historyReason}>"{h.reason}"</Text>
              </View>
            ))}
          </View>
        )}

        {data?.status === 'delivered' ? (
          <View style={styles.deliveredBanner}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success.dark} />
            <Text style={styles.deliveredBannerText}>
              Delivered{data.delivered_at ? ` at ${new Date(data.delivered_at).toLocaleString('en-IN')}` : ''}
            </Text>
          </View>
        ) : data?.manual_complete_available ? (
          <>
            <View style={styles.warningBox}>
              <Ionicons name="warning-outline" size={18} color={colors.warning.dark} />
              <Text style={styles.warningText}>
                Only use this after you have independently confirmed the order was actually
                delivered — e.g. by calling the customer or the delivery partner. A failed
                OTP message is not proof of delivery by itself.
              </Text>
            </View>
            <TouchableOpacity style={styles.manualBtn} onPress={() => setModalVisible(true)}>
              <Ionicons name="shield-checkmark" size={18} color={colors.white} />
              <Text style={styles.manualBtnText}>Manually Complete Delivery</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Manual Completion</Text>
            <Text style={styles.modalSubtitle}>
              This action is recorded in an audit log with your admin ID and cannot be undone.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason (required, min 10 characters)…"
              placeholderTextColor={colors.text.muted}
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => { setModalVisible(false); setReason(''); }}
                disabled={submitting}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={handleManualComplete}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.modalBtnConfirmText}>Confirm & Complete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const Row: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, warn && { color: colors.error.dark }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  headerTitle: { ...typography.h6, color: colors.text.primary },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  orderNo: { ...typography.h5, color: colors.text.primary },
  orderStatus: { ...typography.caption, color: colors.text.muted, marginTop: 2 },
  sectionTitle: { ...typography.subtitle2, color: colors.text.primary, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { ...typography.caption, color: colors.text.muted },
  rowValue: { ...typography.caption, color: colors.text.primary, fontWeight: '600' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full ?? 999,
    marginBottom: spacing.sm,
  },
  statusChipText: { ...typography.caption, fontWeight: '700' },
  historyRow: { marginBottom: spacing.sm },
  historyText: { ...typography.caption, color: colors.text.primary },
  historyReason: { ...typography.caption, color: colors.text.muted, fontStyle: 'italic' },
  deliveredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.success.light,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  deliveredBannerText: { ...typography.body2, color: colors.success.dark, fontWeight: '600' },
  warningBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.warning.light,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  warningText: { ...typography.caption, color: colors.warning.dark, flex: 1 },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.error.dark,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  manualBtnText: { ...typography.body2, color: colors.white, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.lg },
  modalTitle: { ...typography.h6, color: colors.text.primary, marginBottom: 4 },
  modalSubtitle: { ...typography.caption, color: colors.text.muted, marginBottom: spacing.md },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    minHeight: 90,
    textAlignVertical: 'top',
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  modalBtnGhost: { backgroundColor: colors.gray[100] },
  modalBtnGhostText: { ...typography.body2, color: colors.text.primary, fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: colors.error.dark },
  modalBtnConfirmText: { ...typography.body2, color: colors.white, fontWeight: '700' },
});
