import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore, CartItem } from '../store/cartStore';
import { AppButton } from '@components/AppButton';
import { EmptyState } from '@components';
import { formatPrice } from '@utils/helpers';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

const FOOD_COLOR = colors.food?.primary || '#FF6B6B';
const GROC_COLOR = colors.grocery?.primary || '#0D9488';

/**
 * Tab Cart — same quality as FoodCartScreen:
 * vertical rows, "Ordering from" banner, bill details,
 * separate proceed for Food (restaurant + rider) and Grocery (store).
 * Checkout still routes into Food/Grocery stacks so order APIs + tracking stay wired.
 */
export const UnifiedCartScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
    getTotalPrice,
  } = useCartStore();

  const foodItems = useMemo(
    () => items.filter((i) => i.moduleType === 'food'),
    [items]
  );
  const groceryItems = useMemo(
    () =>
      items.filter(
        (i) => i.moduleType === 'grocery' || (i.moduleType == null && i.moduleType !== 'food')
      ),
    [items]
  );
  // Only true grocery + unlabeled (legacy) as grocery
  const groceryOnly = useMemo(
    () => items.filter((i) => i.moduleType === 'grocery' || !i.moduleType),
    [items]
  );

  const foodSourceName = foodItems[0]?.sourceName || foodItems[0]?.sourceId;
  const foodSourceId = foodItems[0]?.sourceId;
  const grocerySourceName = groceryOnly[0]?.sourceName || 'Store';

  const foodSub = foodItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const grocSub = groceryOnly.reduce((s, i) => s + i.price * i.quantity, 0);
  const foodDelivery = foodItems.length ? 30 : 0;
  const foodTax = Math.round(foodSub * 0.05 * 100) / 100;
  const foodPay = foodSub + foodDelivery + foodTax;
  const grocDelivery = groceryOnly.length ? 20 : 0;
  const grocPay = grocSub + grocDelivery;

  const goFoodCheckout = () => {
    if (!foodItems.length) return;
    if (!foodSourceId) {
      Alert.alert(
        'Restaurant missing',
        'Food items need a restaurant. Add again from a restaurant menu or Jinni.'
      );
      return;
    }
    // Nested stack: Main → Food → Checkout (keeps order + rider wiring)
    navigation.navigate('Food', {
      screen: 'Checkout',
      params: {
        restaurantId: foodSourceId,
        items: foodItems.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          optionIds: i.optionIds,
        })),
      },
    });
  };

  const goGroceryCheckout = () => {
    if (!groceryOnly.length) return;
    navigation.navigate('Grocery', {
      screen: 'GroceryCheckout',
      params: {
        items: groceryOnly.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          unit: i.unit,
        })),
      },
    });
  };

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <EmptyState
          icon={<Ionicons name="cart-outline" size={40} color={colors.gray[300]} />}
          title="Your cart is empty"
          description="Food (restaurant + rider) aur grocery yahin dikhenge"
        />
        <View style={{ padding: spacing.lg }}>
          <AppButton
            title="Browse Home"
            onPress={() => navigation.navigate('Home')}
            size="large"
          />
        </View>
      </SafeAreaView>
    );
  }

  const renderRow = (item: CartItem) => (
    <View style={styles.row} key={item.id}>
      <View
        style={[
          styles.vegBox,
          {
            borderColor:
              item.isVeg !== false ? colors.success.DEFAULT : colors.error.DEFAULT,
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
        {!!item.sourceName && (
          <Text style={styles.sourceLine}>{item.sourceName}</Text>
        )}
        {!!item.optionLabels?.length && (
          <Text style={styles.opts}>{item.optionLabels.join(', ')}</Text>
        )}
        <Text style={styles.itemPrice}>
          {formatPrice(item.price)}
          {item.unit ? ` · ${item.unit}` : ''}
        </Text>
      </View>
      <View style={styles.qtyBox}>
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, item.quantity - 1)}
          style={styles.qtyBtn}
        >
          <Ionicons name="remove" size={16} color={colors.gray[800]} />
        </TouchableOpacity>
        <Text style={styles.qty}>{item.quantity}</Text>
        <TouchableOpacity
          onPress={() => updateQuantity(item.id, item.quantity + 1)}
          style={styles.qtyBtn}
        >
          <Ionicons name="add" size={16} color={colors.gray[800]} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color={colors.gray[400]} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* FOOD — restaurant + dedicated rider */}
        {foodItems.length > 0 && (
          <View>
            <View style={styles.banner}>
              <Text style={styles.bannerLabel}>Ordering food from</Text>
              <Text style={styles.bannerName}>{foodSourceName || 'Restaurant'}</Text>
              <Text style={styles.bannerNote}>
                Sealed bag · Dedicated rider (restaurant order tracking in Orders)
              </Text>
            </View>
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              {foodItems.map(renderRow)}
            </View>
            <View style={styles.bill}>
              <Text style={styles.billTitle}>Food bill</Text>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Item total</Text>
                <Text style={styles.billVal}>{formatPrice(foodSub)}</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery fee</Text>
                <Text style={styles.billVal}>{formatPrice(foodDelivery)}</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>GST (5%)</Text>
                <Text style={styles.billVal}>{formatPrice(foodTax)}</Text>
              </View>
              <View style={[styles.billRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Food to pay</Text>
                <Text style={styles.totalVal}>{formatPrice(foodPay)}</Text>
              </View>
            </View>
            <View style={styles.sectionFooter}>
              <AppButton
                title={`Proceed food · ${formatPrice(foodPay)}`}
                onPress={goFoodCheckout}
                size="large"
              />
            </View>
          </View>
        )}

        {/* GROCERY — store delivery */}
        {groceryOnly.length > 0 && (
          <View style={{ marginTop: foodItems.length ? spacing.md : 0 }}>
            <View style={[styles.banner, styles.bannerGroc]}>
              <Text style={styles.bannerLabel}>Ordering grocery from</Text>
              <Text style={styles.bannerName}>{grocerySourceName}</Text>
              <Text style={styles.bannerNote}>
                Store packing · Delivery agent (track in Orders)
              </Text>
            </View>
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              {groceryOnly.map(renderRow)}
            </View>
            <View style={styles.bill}>
              <Text style={styles.billTitle}>Grocery bill</Text>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Item total</Text>
                <Text style={styles.billVal}>{formatPrice(grocSub)}</Text>
              </View>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery fee</Text>
                <Text style={styles.billVal}>{formatPrice(grocDelivery)}</Text>
              </View>
              <View style={[styles.billRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Grocery to pay</Text>
                <Text style={styles.totalVal}>{formatPrice(grocPay)}</Text>
              </View>
            </View>
            <View style={styles.sectionFooter}>
              <AppButton
                title={`Proceed grocery · ${formatPrice(grocPay)}`}
                onPress={goGroceryCheckout}
                size="large"
              />
            </View>
          </View>
        )}

        <TouchableOpacity onPress={() => clearCart()} style={styles.clearBtn}>
          <Text style={styles.clearText}>Clear entire cart</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface?.background || colors.gray[50] },
  banner: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  bannerGroc: {
    borderTopWidth: 8,
    borderTopColor: colors.gray[100],
  },
  bannerLabel: {
    fontSize: 12,
    color: colors.gray[500],
    fontFamily: fontFamily.regular,
  },
  bannerName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.gray[900],
    marginTop: 2,
    fontFamily: fontFamily.bold,
  },
  bannerNote: {
    fontSize: 12,
    color: colors.gray[500],
    marginTop: 6,
    fontFamily: fontFamily.regular,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 10,
  },
  vegBox: {
    width: 16,
    height: 16,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  info: { flex: 1 },
  itemName: {
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    color: colors.gray[900],
  },
  sourceLine: {
    fontSize: 11,
    color: FOOD_COLOR,
    marginTop: 2,
    fontFamily: fontFamily.medium,
  },
  opts: { fontSize: 11, color: colors.gray[500], marginTop: 2 },
  itemPrice: {
    fontSize: 13,
    color: colors.gray[700],
    marginTop: 4,
    fontFamily: fontFamily.medium,
  },
  qtyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: 20,
    paddingHorizontal: 4,
  },
  qtyBtn: { padding: 6 },
  qty: {
    minWidth: 20,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  bill: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  billTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: spacing.sm,
    color: colors.gray[900],
    fontFamily: fontFamily.bold,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  billLabel: { fontSize: 14, color: colors.gray[600], fontFamily: fontFamily.regular },
  billVal: { fontSize: 14, color: colors.gray[800], fontFamily: fontFamily.regular },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.gray[900],
    fontFamily: fontFamily.bold,
  },
  totalVal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.gray[900],
    fontFamily: fontFamily.bold,
  },
  sectionFooter: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  clearBtn: { marginTop: 8, marginBottom: 16, alignItems: 'center' },
  clearText: {
    color: colors.error.DEFAULT,
    fontWeight: '600',
    fontFamily: fontFamily.semiBold,
  },
});

export default UnifiedCartScreen;
