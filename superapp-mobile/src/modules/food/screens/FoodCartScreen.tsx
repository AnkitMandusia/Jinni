import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '@modules/cart/store/cartStore';
import { useFoodStore } from '../store/foodStore';
import { AppButton } from '@components/AppButton';
import { EmptyState } from '@components';
import { formatPrice } from '@utils/helpers';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

const FOOD = colors.food?.primary || '#FF6B6B';

export const FoodCartScreen: React.FC = () => {
  const navigation = useNavigation();
  const {
    items,
    restaurantId,
    restaurantName,
    getTotalPrice,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCartStore();
  const selectedRestaurant = useFoodStore((s) => s.selectedRestaurant);

  // Only food lines — tab cart is unified across modules
  const displayItems = items.filter((i) => i.moduleType === 'food');

  const subtotal = displayItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = Number(selectedRestaurant?.delivery_fee ?? selectedRestaurant?.deliveryFee ?? 30);
  const freeAbove = selectedRestaurant?.free_delivery_above as number | undefined;
  const packaging = Number((selectedRestaurant as any)?.packaging_fee ?? 0);
  const effectiveDelivery =
    freeAbove != null && subtotal >= Number(freeAbove) ? 0 : deliveryFee;
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const total = subtotal + effectiveDelivery + packaging + tax;
  const minOrder = Number(selectedRestaurant?.min_order_amount ?? selectedRestaurant?.minOrder ?? 0);
  const meetsMin = subtotal >= minOrder;

  const handleCheckout = () => {
    if (!meetsMin) {
      Alert.alert('Minimum order', `Add ${formatPrice(minOrder - subtotal)} more to proceed.`);
      return;
    }
    if ((!restaurantId && !displayItems[0]?.sourceId) || displayItems.length === 0) {
      Alert.alert('Empty cart', 'Add items from a restaurant first.');
      return;
    }
    const rid = restaurantId || displayItems[0]?.sourceId || '';
    navigation.navigate(
      'Checkout' as never,
      {
        restaurantId: rid,
        items: displayItems.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          optionIds: (i as any).optionIds,
        })),
      } as never
    );
  };

  if (displayItems.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon={<Ionicons name="cart-outline" size={40} color={colors.gray[300]} />}
          title="Your cart is empty"
          description="Browse restaurants and add something delicious"
        />
        <View style={{ padding: spacing.lg }}>
          <AppButton
            title="Browse restaurants"
            onPress={() => navigation.navigate('RestaurantList' as never)}
            size="large"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.banner}>
        <Text style={styles.bannerLabel}>Ordering from</Text>
        <Text style={styles.bannerName}>
          {restaurantName || selectedRestaurant?.name || 'Restaurant'}
        </Text>
        <Text style={styles.bannerNote}>
          Sealed bag · Dedicated rider (separate from grocery)
        </Text>
      </View>

      <FlatList
        data={displayItems}
        keyExtractor={(item, idx) => `${item.id}-${idx}`}
        contentContainerStyle={{ padding: spacing.lg }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View
              style={[
                styles.vegBox,
                {
                  borderColor: item.isVeg !== false ? colors.success.DEFAULT : colors.error.DEFAULT,
                },
              ]}
            >
              <View
                style={[
                  styles.vegDot,
                  {
                    backgroundColor:
                      item.isVeg !== false ? colors.success.DEFAULT : colors.error.DEFAULT,
                  },
                ]}
              />
            </View>
            <View style={styles.info}>
              <Text style={styles.itemName}>{item.name}</Text>
              {(item as any).optionLabels?.length ? (
                <Text style={styles.opts}>{(item as any).optionLabels.join(', ')}</Text>
              ) : null}
              <Text style={styles.itemPrice}>{formatPrice(item.price)}</Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtnTouch} onPress={() => updateQuantity(item.id, item.quantity - 1)}>
                <Ionicons name="remove" size={15} color={FOOD} />
              </TouchableOpacity>
              <Text style={styles.qty}>{item.quantity}</Text>
              <TouchableOpacity style={styles.stepBtnTouch} onPress={() => updateQuantity(item.id, item.quantity + 1)}>
                <Ionicons name="add" size={15} color={FOOD} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={10}>
              <Ionicons name="trash-outline" size={17} color={colors.gray[400]} />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.bill}>
            <Text style={styles.billTitle}>Bill details</Text>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Item total</Text>
              <Text style={styles.billVal}>{formatPrice(subtotal)}</Text>
            </View>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Delivery fee</Text>
              <Text style={styles.billVal}>
                {effectiveDelivery === 0 ? 'FREE' : formatPrice(effectiveDelivery)}
              </Text>
            </View>
            {packaging > 0 && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Packaging</Text>
                <Text style={styles.billVal}>{formatPrice(packaging)}</Text>
              </View>
            )}
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>GST (5%)</Text>
              <Text style={styles.billVal}>{formatPrice(tax)}</Text>
            </View>
            <View style={[styles.billRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>To pay</Text>
              <Text style={styles.totalVal}>{formatPrice(total)}</Text>
            </View>
            <TouchableOpacity onPress={() => clearCart()} style={styles.clearBtn}>
              <Text style={styles.clearText}>Clear cart</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.footer}>
        {!meetsMin && minOrder > 0 && (
          <Text style={styles.minWarn}>
            Add {formatPrice(minOrder - subtotal)} more for minimum order
          </Text>
        )}
        <AppButton
          title={`Checkout · ${formatPrice(total)}`}
          onPress={handleCheckout}
          size="large"
          disabled={!meetsMin}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  banner: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  bannerLabel: { fontSize: 12, color: colors.gray[500], fontFamily: fontFamily.regular},
  bannerName: { fontSize: 18, color: colors.gray[900], marginTop: 2, fontFamily: fontFamily.bold},
  bannerNote: { fontSize: 12, color: colors.gray[500], marginTop: 6, fontFamily: fontFamily.regular},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: 10,
  },
  vegBox: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegDot: { width: 6, height: 6, borderRadius: 3 },
  info: { flex: 1 },
  itemName: { fontSize: 15, color: colors.gray[900], fontFamily: fontFamily.semiBold},
  opts: { fontSize: 12, color: colors.gray[500], marginTop: 2, fontFamily: fontFamily.regular},
  itemPrice: { fontSize: 13, color: colors.gray[700], marginTop: 2, fontFamily: fontFamily.regular},
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: FOOD,
    borderRadius: 8,
    overflow: 'hidden',
  },
  stepBtnTouch: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { minWidth: 24, textAlign: 'center', fontFamily: fontFamily.bold},
  bill: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  billTitle: { fontSize: 15, marginBottom: spacing.sm, color: colors.gray[900], fontFamily: fontFamily.bold},
  billRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  billLabel: { fontSize: 14, color: colors.gray[600], fontFamily: fontFamily.regular},
  billVal: { fontSize: 14, color: colors.gray[800], fontFamily: fontFamily.regular},
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: { fontSize: 16, color: colors.gray[900], fontFamily: fontFamily.bold},
  totalVal: { fontSize: 16, color: colors.gray[900], fontFamily: fontFamily.bold},
  clearBtn: { marginTop: 12, alignItems: 'center' },
  clearText: { color: colors.error.DEFAULT, fontFamily: fontFamily.semiBold},
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
  minWarn: {
    color: colors.warning.DEFAULT,
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
  },
});

export default FoodCartScreen;
