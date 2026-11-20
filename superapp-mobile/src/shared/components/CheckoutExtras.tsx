import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

type Props = {
  payment: 'cod' | 'online' | 'wallet';
  setPayment: (p: 'cod' | 'online' | 'wallet') => void;
  total: number;
  accent: string;
  /** ISO string (UTC) or null for ASAP */
  scheduledFor: string | null;
  setScheduledFor: (iso: string | null) => void;
};

// Slots are computed from "now" at tap time and re-validated by the server
// (30 min – 48 h), so a stale chip can never place an invalid schedule.
const SLOTS: { label: string; at: () => Date }[] = [
  { label: 'In 1 hour', at: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: 'In 3 hours', at: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  {
    label: 'Tomorrow 9 AM',
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

/** Wallet payment option + delivery-time chips shared by food and grocery checkout. */
export const CheckoutExtras: React.FC<Props> = ({ payment, setPayment, total, accent, scheduledFor, setScheduledFor }) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [slotLabel, setSlotLabel] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ balance: number }>('/wallet').then((w) => setBalance(w.balance)).catch(() => setBalance(null));
  }, []);

  // If the bill grows past the balance after wallet was chosen, fall back to COD.
  const enough = balance !== null && balance >= total;
  useEffect(() => {
    if (payment === 'wallet' && !enough) setPayment('cod');
  }, [payment, enough, setPayment]);

  return (
    <View>
      {balance !== null && balance > 0 && (
        <TouchableOpacity
          style={[styles.walletRow, payment === 'wallet' && { borderColor: accent }, !enough && { opacity: 0.5 }]}
          disabled={!enough}
          onPress={() => setPayment('wallet')}
          activeOpacity={0.88}
        >
          <Ionicons name="wallet-outline" size={18} color={payment === 'wallet' ? accent : colors.gray[500]} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.title, payment === 'wallet' && { color: accent }]}>Jinni Wallet</Text>
            <Text style={styles.sub}>{enough ? `Balance ${formatPrice(balance)}` : `Balance ${formatPrice(balance)} — not enough for this order`}</Text>
          </View>
          <View style={[styles.radio, payment === 'wallet' && { borderColor: accent }]}>
            {payment === 'wallet' && <View style={[styles.dot, { backgroundColor: accent }]} />}
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.sectionRow}>
        <Ionicons name="time-outline" size={15} color={colors.text.secondary} />
        <Text style={styles.section}>Delivery time</Text>
      </View>
      <View style={styles.chips}>
        <Chip label="ASAP" on={scheduledFor === null} accent={accent} onPress={() => { setScheduledFor(null); setSlotLabel(null); }} />
        {SLOTS.map((s) => (
          <Chip
            key={s.label}
            label={s.label}
            on={slotLabel === s.label}
            accent={accent}
            onPress={() => { setScheduledFor(s.at().toISOString()); setSlotLabel(s.label); }}
          />
        ))}
      </View>
    </View>
  );
};

const Chip: React.FC<{ label: string; on: boolean; accent: string; onPress: () => void }> = ({ label, on, accent, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, on && { borderColor: accent, backgroundColor: accent + '14' }]}>
    <Text style={[styles.chipText, on && { color: accent }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  walletRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, paddingHorizontal: 14, paddingVertical: 12, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.gray[200], backgroundColor: colors.white },
  title: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.gray[800] },
  sub: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.gray[400], marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.gray[300], alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  section: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.gray[700] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1.5, borderColor: colors.gray[200], backgroundColor: colors.white },
  chipText: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.gray[700] },
});
