import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { ProposedItem } from '../types';

interface Props {
  items: ProposedItem[];
  onQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onAddToCart: () => void;
}

export const ProposedItemsPanel: React.FC<Props> = ({
  items,
  onQty,
  onRemove,
  onAddToCart,
}) => {
  const available = items.filter((i) => i.available);
  const total = available.reduce((s, i) => s + i.price * i.quantity, 0);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Yeh items mil gaye:</Text>
      <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {items.map((item) => (
          <View
            key={item.id}
            style={[styles.row, !item.available && styles.rowMuted]}
          >
            <View style={styles.thumb}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.thumbImg} />
              ) : (
                <Ionicons
                  name={item.moduleType === 'food' ? 'restaurant' : 'basket'}
                  size={22}
                  color={jinniColors.gold[500]}
                />
              )}
            </View>
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.sub}>
                {item.unit || ''}
                {item.restaurantName ? ` · ${item.restaurantName}` : ''}
              </Text>
              {item.available ? (
                <Text style={styles.price}>₹{item.price}</Text>
              ) : (
                <Text style={styles.na}>{item.unavailableReason || 'Available nahi'}</Text>
              )}
            </View>
            {item.available ? (
              <View style={styles.qtyBox}>
                <Pressable
                  onPress={() => onQty(item.id, item.quantity - 1)}
                  style={styles.qtyBtn}
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={16} color={jinniColors.purple[700]} />
                </Pressable>
                <Text style={styles.qty}>{item.quantity}</Text>
                <Pressable
                  onPress={() => onQty(item.id, item.quantity + 1)}
                  style={styles.qtyBtn}
                  hitSlop={8}
                >
                  <Ionicons name="add" size={16} color={jinniColors.purple[700]} />
                </Pressable>
              </View>
            ) : null}
            <Pressable onPress={() => onRemove(item.id)} hitSlop={10} style={styles.remove}>
              <Ionicons name="close-circle" size={20} color={jinniColors.purple[300]} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {available.length > 0 && (
        <View style={styles.footer}>
          <View>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>₹{total}</Text>
          </View>
          <Pressable style={styles.cta} onPress={onAddToCart}>
            <Text style={styles.ctaText}>Add to Cart</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: jinniColors.purple[100],
    overflow: 'hidden',
  },
  heading: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: jinniColors.purple[800],
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  list: {
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: jinniColors.purple[50],
  },
  rowMuted: {
    opacity: 0.55,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: jinniColors.gold[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  thumbImg: { width: 44, height: 44, borderRadius: 10 },
  meta: { flex: 1 },
  name: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: jinniColors.purple[900],
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: jinniColors.purple[400],
    marginTop: 1,
  },
  price: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: jinniColors.purple[700],
    marginTop: 2,
  },
  na: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: jinniColors.purple[50],
    borderRadius: 20,
    paddingHorizontal: 4,
    marginRight: 4,
  },
  qtyBtn: { padding: 6 },
  qty: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    minWidth: 18,
    textAlign: 'center',
    color: jinniColors.purple[800],
  },
  remove: { padding: 4 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: jinniColors.purple[100],
    backgroundColor: jinniColors.cream,
  },
  totalLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: jinniColors.purple[400],
  },
  total: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: jinniColors.purple[900],
  },
  cta: {
    backgroundColor: jinniColors.purple[600],
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFF',
  },
});

export default ProposedItemsPanel;
