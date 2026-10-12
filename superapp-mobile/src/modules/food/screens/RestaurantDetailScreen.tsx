import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { FoodStackParamList } from '@navigation/stacks/FoodStack';
import { useFoodStore, MenuItem } from '../store/foodStore';
import { useCartStore } from '@modules/cart/store/cartStore';
import { EmptyState, ListSkeleton } from '@components';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { formatPrice } from '@utils/helpers';
import { OrderWithJinniButton } from '../components/OrderWithJinniButton';

const FOOD = colors.food?.primary || '#FF6B6B';

const VegMark: React.FC<{ veg: boolean }> = ({ veg }) => (
  <View style={[styles.vegMark, { borderColor: veg ? colors.success.DEFAULT : colors.error.DEFAULT }]}>
    <View style={[styles.vegDot, { backgroundColor: veg ? colors.success.DEFAULT : colors.error.DEFAULT }]} />
  </View>
);

export const RestaurantDetailScreen: React.FC = () => {
  const route = useRoute<RouteProp<FoodStackParamList, 'RestaurantDetail'>>();
  const navigation = useNavigation();
  const { restaurantId } = route.params;
  const {
    categories,
    menuItems,
    selectedRestaurant,
    isLoading,
    fetchMenu,
    fetchRestaurant,
  } = useFoodStore();
  const {
    items: cartItems,
    restaurantId: cartRestaurantId,
    addItem,
    forceAddItem,
    updateQuantity,
    getTotalItems,
    getTotalPrice,
  } = useCartStore();
  const [vegOnly, setVegOnly] = useState(false);

  useEffect(() => {
    fetchRestaurant?.(restaurantId);
    fetchMenu(restaurantId, { veg_only: vegOnly });
  }, [restaurantId, vegOnly]);

  const sections = useMemo(() => {
    if (categories?.length) {
      return categories
        .filter((c) => c.items?.length)
        .map((c) => ({ title: c.name, data: c.items }));
    }
    // flat menuItems fallback
    const filtered = vegOnly ? menuItems.filter((i) => i.isVeg || i.is_veg) : menuItems;
    return filtered.length ? [{ title: 'Menu', data: filtered }] : [];
  }, [categories, menuItems, vegOnly]);

  const qtyInCart = useCallback(
    (id: string) => {
      if (cartRestaurantId && cartRestaurantId !== restaurantId) return 0;
      const row = cartItems.find((i) => i.id === id);
      return row?.quantity || 0;
    },
    [cartItems, cartRestaurantId, restaurantId]
  );

  const meta = useMemo(
    () => ({
      restaurantId,
      restaurantName: selectedRestaurant?.name,
    }),
    [restaurantId, selectedRestaurant?.name]
  );

  const doAdd = useCallback(
    (item: MenuItem, qty = 1) => {
      if (!item.isAvailable && item.is_available === false) {
        Alert.alert('Unavailable', 'This item is not available right now.');
        return;
      }
      if (item.option_groups?.some((g: any) => g.is_required)) {
        navigation.navigate(
          'MenuItemDetail' as never,
          { itemId: item.id, restaurantId } as never
        );
        return;
      }
      const price = Number(item.effective_price ?? item.price);
      const cartItem = {
        id: item.id,
        name: item.name,
        price,
        quantity: qty,
        imageUrl: item.imageUrl || item.image_url,
        isVeg: item.isVeg ?? item.is_veg,
      };
      const result = addItem(cartItem, 'food' as any, meta);
      if (result?.needsConfirm) {
        Alert.alert(
          'Replace cart?',
          `Your cart has items from ${result.currentRestaurantName}. Clear it to add from ${result.newRestaurantName}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear & add',
              style: 'destructive',
              onPress: () => forceAddItem(cartItem, 'food' as any, meta),
            },
          ]
        );
      }
    },
    [addItem, forceAddItem, meta, navigation, restaurantId]
  );

  const cartCount = getTotalItems();
  const cartTotal = getTotalPrice();
  const showCartBar = cartCount > 0 && (!cartRestaurantId || cartRestaurantId === restaurantId);

  const r = selectedRestaurant;

  if (isLoading && sections.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ListSkeleton count={8} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: showCartBar ? 100 : 24 }}
        ListHeaderComponent={
          <View>
            {r?.cover_image_url || r?.imageUrl ? (
              <Image
                source={{ uri: r.cover_image_url || r.imageUrl }}
                style={styles.cover}
              />
            ) : (
              <View style={[styles.cover, styles.coverPh]}>
                <Ionicons name="restaurant-outline" size={48} color={colors.secondary[300]} />
              </View>
            )}
            <View style={styles.headerCard}>
              <Text style={styles.restName}>{r?.name || 'Restaurant'}</Text>
              <Text style={styles.cuisine}>
                {(r?.cuisines || r?.cuisine || []).join(' · ')}
              </Text>
              <View style={styles.metaRow}>
                {(r?.rating_count || 0) > 0 ? (
                  <View
                    style={[
                      styles.ratingChip,
                      {
                        backgroundColor:
                          (r?.rating || r?.rating_avg || 0) >= 4
                            ? colors.success.DEFAULT
                            : colors.warning.DEFAULT,
                      },
                    ]}
                  >
                    <Ionicons name="star" size={11} color={colors.white} />
                    <Text style={[styles.ratingText, { marginLeft: 3 }]}>
                      {(r?.rating || r?.rating_avg || 0).toFixed(1)}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.ratingChip, { backgroundColor: colors.gray[300] }]}>
                    <Text style={styles.ratingText}>NEW</Text>
                  </View>
                )}
                <Text style={styles.meta}>
                  {r?.deliveryTime || r?.delivery_time_estimate || '30 min'}
                </Text>
                {r?.rating_count ? (
                  <Text style={styles.meta}>{r.rating_count} ratings</Text>
                ) : null}
              </View>
              <Text style={styles.feeLine}>
                Delivery {formatPrice(r?.deliveryFee ?? r?.delivery_fee ?? 0)}
                {(r?.minOrder ?? r?.min_order_amount)
                  ? ` · Min ${formatPrice(r?.minOrder ?? r?.min_order_amount ?? 0)}`
                  : ''}
                {' · '}
                Sealed bag · Dedicated rider
              </Text>
              {r?.pure_veg ? (
                <View style={styles.pureVegTag}>
                  <Text style={styles.pureVegText}>PURE VEG</Text>
                </View>
              ) : null}
              <View style={styles.jinniRow}>
                <OrderWithJinniButton restaurantId={r?.id} restaurantName={r?.name} compact />
              </View>
              <View style={styles.vegToggle}>
                <VegMark veg />
                <Text style={styles.vegLabel}>Veg only</Text>
                <Switch
                  value={vegOnly}
                  onValueChange={setVegOnly}
                  trackColor={{ true: colors.success.DEFAULT, false: colors.gray[300] }}
                />
              </View>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const qty = qtyInCart(item.id);
          const available = item.isAvailable !== false && item.is_available !== false;
          const img = item.imageUrl || item.image_url;
          return (
            <View style={[styles.dishRow, !available && styles.dishDisabled]}>
              <View style={styles.dishInfo}>
                <View style={styles.nameRow}>
                  <VegMark veg={Boolean(item.isVeg ?? item.is_veg)} />
                  <Text style={styles.dishName} numberOfLines={2}>
                    {item.name}
                  </Text>
                </View>
                <Text style={styles.price}>
                  {formatPrice(item.effective_price ?? item.price)}
                </Text>
                {item.description ? (
                  <Text style={styles.desc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                {item.is_bestseller ? (
                  <Text style={styles.bestseller}>Bestseller</Text>
                ) : null}
              </View>
              <View style={styles.dishRight}>
                {img ? (
                  <Image source={{ uri: img }} style={styles.dishImg} />
                ) : (
                  <View style={[styles.dishImg, styles.dishImgPh]} />
                )}
                {available ? (
                  qty > 0 ? (
                    <View style={styles.stepper}>
                      <TouchableOpacity
                        onPress={() => updateQuantity(item.id, qty - 1)}
                        hitSlop={8}
                        style={styles.stepBtnTouch}
                      >
                        <Ionicons name="remove" size={16} color={FOOD} />
                      </TouchableOpacity>
                      <Text style={styles.stepQty}>{qty}</Text>
                      <TouchableOpacity onPress={() => doAdd(item, 1)} hitSlop={8} style={styles.stepBtnTouch}>
                        <Ionicons name="add" size={16} color={FOOD} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => doAdd(item, 1)}>
                      <Text style={styles.addBtnText}>ADD</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <View style={[styles.addBtn, styles.addDisabled]}>
                    <Text style={[styles.addBtnText, { color: colors.gray[400] }]}>N/A</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<Ionicons name="restaurant-outline" size={36} color={colors.gray[300]} />}
            title="No menu items"
            description="This restaurant has no items right now"
          />
        }
      />

      {showCartBar && (
        <TouchableOpacity
          style={styles.cartBar}
          activeOpacity={0.92}
          onPress={() => navigation.navigate('FoodCart' as never)}
        >
          <View>
            <Text style={styles.cartBarLeft}>
              {cartCount} item{cartCount > 1 ? 's' : ''}
            </Text>
            <Text style={styles.cartBarPrice}>{formatPrice(cartTotal)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.cartBarCta}>VIEW CART</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.white} style={{ marginLeft: 2 }} />
          </View>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  cover: { width: '100%', height: 168, backgroundColor: colors.gray[200] },
  coverPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary[50] },
  headerCard: {
    marginTop: -18,
    marginHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[100],
    ...colors.shadows?.md,
  },
  restName: { fontSize: 22, color: colors.gray[900], fontFamily: fontFamily.bold},
  cuisine: { fontSize: 13, color: colors.gray[500], marginTop: 4, fontFamily: fontFamily.regular},
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  ratingChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  ratingText: { color: colors.white, fontSize: 12, fontFamily: fontFamily.bold},
  meta: { fontSize: 13, color: colors.gray[600], fontFamily: fontFamily.medium},
  feeLine: { fontSize: 12, color: colors.gray[500], marginTop: 8, fontFamily: fontFamily.regular},
  pureVegTag: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.success.light,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pureVegText: { fontSize: 11, color: colors.success.dark, fontFamily: fontFamily.bold},
  jinniRow: { marginTop: 10 },
  vegToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  vegLabel: { flex: 1, fontSize: 14, color: colors.gray[700], fontFamily: fontFamily.semiBold},
  vegMark: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegDot: { width: 6, height: 6, borderRadius: 3 },
  sectionHeader: {
    backgroundColor: colors.surface.background,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  sectionTitle: { fontSize: 16, color: colors.gray[800], fontFamily: fontFamily.bold},
  dishRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[100],
  },
  dishDisabled: { opacity: 0.5 },
  dishInfo: { flex: 1, paddingRight: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  dishName: { flex: 1, fontSize: 15, color: colors.gray[900], fontFamily: fontFamily.bold},
  price: { fontSize: 14, color: colors.gray[800], marginTop: 4, fontFamily: fontFamily.semiBold},
  desc: { fontSize: 12, color: colors.gray[500], marginTop: 4, lineHeight: 17, fontFamily: fontFamily.regular},
  bestseller: { marginTop: 6, fontSize: 11, color: FOOD, fontFamily: fontFamily.bold},
  dishRight: { width: 100, alignItems: 'center' },
  dishImg: {
    width: 96,
    height: 72,
    borderRadius: borderRadius.md,
    backgroundColor: colors.gray[100],
  },
  dishImgPh: { backgroundColor: colors.gray[200] },
  addBtn: {
    marginTop: -14,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: FOOD,
    paddingHorizontal: 22,
    paddingVertical: 6,
    borderRadius: 8,
    ...colors.shadows?.sm,
  },
  addDisabled: { borderColor: colors.gray[300] },
  addBtnText: { color: FOOD, fontSize: 13, letterSpacing: 0.5, fontFamily: fontFamily.bold},
  stepper: {
    marginTop: -14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: FOOD,
    borderRadius: 8,
    overflow: 'hidden',
    ...colors.shadows?.sm,
  },
  stepBtnTouch: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepQty: { minWidth: 22, textAlign: 'center', fontSize: 14, fontFamily: fontFamily.bold},
  cartBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: FOOD,
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...colors.shadows?.lg,
  },
  cartBarLeft: { color: colors.white, fontSize: 13, opacity: 0.95, fontFamily: fontFamily.semiBold},
  cartBarPrice: { color: colors.white, fontSize: 16, marginTop: 2, fontFamily: fontFamily.bold},
  cartBarCta: { color: colors.white, fontSize: 15, letterSpacing: 0.3, fontFamily: fontFamily.bold},
});

export default RestaurantDetailScreen;
