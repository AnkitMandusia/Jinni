import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { formatPrice } from '@utils/helpers';

export type CartCheckSubstitute = {
  product_id: string;
  name: string;
  unit: string;
  price: number;
  image_url?: string | null;
  available: number;
};

export type CartCheckLine = {
  product_id: string;
  name: string;
  requested: number;
  available: number;
  status: 'ok' | 'partial' | 'out_of_stock';
  unit_price?: number | null;
  price_changed: boolean;
  substitutes: CartCheckSubstitute[];
};

type Props = {
  visible: boolean;
  /** Only lines that still need the customer's attention. */
  lines: CartCheckLine[];
  accent: string;
  onSwap: (line: CartCheckLine, sub: CartCheckSubstitute) => void;
  onReduce: (line: CartCheckLine) => void;
  onRemove: (line: CartCheckLine) => void;
  onClose: () => void;
};

/**
 * Structured out-of-stock handling (Zepto "partial OOS" / Zomato "cart OOS
 * recommendation" pattern). Replaces the old behaviour where the customer only
 * found out at Place Order via a generic "Insufficient stock" error, with the
 * only workaround being a free-text note to the store.
 */
export const CartIssuesSheet: React.FC<Props> = ({ visible, lines, accent, onSwap, onReduce, onRemove, onClose }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose} />
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <Text style={styles.title}>Some items need your attention</Text>
      <Text style={styles.sub}>Update these to continue — nothing has been charged.</Text>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {lines.map((line) => {
          const out = line.status === 'out_of_stock';
          return (
            <View key={line.product_id} style={styles.card}>
              <View style={styles.cardHead}>
                <Ionicons name={out ? 'close-circle' : 'alert-circle'} size={18} color={out ? colors.error.DEFAULT : colors.warning.DEFAULT} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>{line.name}</Text>
                  <Text style={styles.reason}>
                    {out ? 'Out of stock' : `Only ${line.available} left (you have ${line.requested})`}
                  </Text>
                </View>
              </View>

              {line.substitutes.length > 0 && (
                <>
                  <Text style={styles.swapLabel}>Swap with</Text>
                  {line.substitutes.map((sub) => (
                    <TouchableOpacity key={sub.product_id} style={styles.subRow} onPress={() => onSwap(line, sub)} activeOpacity={0.8}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subName} numberOfLines={1}>{sub.name}</Text>
                        <Text style={styles.subMeta}>{sub.unit}</Text>
                      </View>
                      <Text style={styles.subPrice}>{formatPrice(sub.price)}</Text>
                      <View style={[styles.swapBtn, { borderColor: accent }]}>
                        <Text style={[styles.swapBtnText, { color: accent }]}>SWAP</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              <View style={styles.actions}>
                {line.status === 'partial' && (
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: accent }]} onPress={() => onReduce(line)}>
                    <Text style={[styles.actionText, { color: colors.white }]}>Keep {line.available}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.actionBtn} onPress={() => onRemove(line)}>
                  <Text style={[styles.actionText, { color: colors.error.DEFAULT }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.close} onPress={onClose}>
        <Text style={styles.closeText}>Back to cart</Text>
      </TouchableOpacity>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray[200], marginBottom: spacing.md },
  title: { fontSize: 17, fontFamily: fontFamily.bold, color: colors.gray[900] },
  sub: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.gray[500], marginTop: 2, marginBottom: spacing.md },
  list: { flexGrow: 0 },
  card: { borderWidth: 1, borderColor: colors.gray[100], borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.surface.sunken },
  cardHead: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  name: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.gray[900] },
  reason: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.gray[500], marginTop: 2 },
  swapLabel: { fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.gray[500], marginTop: spacing.sm, marginBottom: 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.gray[100] },
  subName: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.gray[800] },
  subMeta: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.gray[400] },
  subPrice: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.gray[800] },
  swapBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  swapBtnText: { fontSize: 11, fontFamily: fontFamily.bold },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: spacing.sm },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionText: { fontSize: 12, fontFamily: fontFamily.bold },
  close: { alignItems: 'center', paddingVertical: spacing.md },
  closeText: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.gray[600] },
});
