import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { FoodStackParamList } from '@navigation/stacks/FoodStack';
import { useCartStore } from '@modules/cart/store/cartStore';
import { useFoodStore } from '../store/foodStore';
import { api } from '@services/api';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';
import { formatPrice } from '@utils/helpers';

type Option = { id: string; name: string; price_delta?: number; is_available?: boolean; is_default?: boolean; is_veg?: boolean };
type OptionGroup = { id: string; name: string; min_select: number; max_select: number; is_required: boolean; options: Option[] };
type Item = { id: string; restaurant_id: string; name: string; description?: string; price: number; effective_price?: number; discounted_price?: number; image_url?: string; is_veg: boolean; is_available: boolean; is_bestseller?: boolean; option_groups?: OptionGroup[] };

export const MenuItemDetailScreen: React.FC = () => {
  const route = useRoute<RouteProp<FoodStackParamList, 'MenuItemDetail'>>();
  const navigation = useNavigation<any>();
  const { restaurantId, itemId } = route.params;
  const restaurant = useFoodStore((s) => s.selectedRestaurant);
  const addItem = useCartStore((s) => s.addItem);
  const forceAddItem = useCartStore((s) => s.forceAddItem);
  const [item, setItem] = useState<Item | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Item>(`/food/menu-items/${itemId}`);
        setItem(data);
        const defaults: Record<string, string[]> = {};
        (data.option_groups || []).forEach((g) => {
          const ids = (g.options || []).filter((o) => o.is_available !== false && o.is_default).map((o) => o.id);
          if (ids.length) defaults[g.id] = ids;
        });
        setSelected(defaults);
      } catch (e: any) {
        Alert.alert('Item unavailable', e?.response?.data?.detail || 'This item could not be loaded.', [{ text: 'Go back', onPress: () => navigation.goBack() }]);
      } finally {
        setLoading(false);
      }
    })();
  }, [itemId, navigation]);

  const optionPrice = useMemo(() => (item?.option_groups || []).reduce((sum, g) => sum + (g.options || []).filter((o) => selected[g.id]?.includes(o.id)).reduce((s, o) => s + Number(o.price_delta || 0), 0), 0), [item, selected]);
  const unitPrice = Number(item?.effective_price ?? item?.price ?? 0) + optionPrice;

  const toggleOption = (group: OptionGroup, option: Option) => {
    if (option.is_available === false) return;
    const current = selected[group.id] || [];
    if (current.includes(option.id)) {
      setSelected((prev) => ({ ...prev, [group.id]: current.filter((id) => id !== option.id) }));
      return;
    }
    if (group.max_select <= 1) {
      setSelected((prev) => ({ ...prev, [group.id]: [option.id] }));
      return;
    }
    if (current.length >= group.max_select) return;
    setSelected((prev) => ({ ...prev, [group.id]: [...current, option.id] }));
  };

  const addToCart = () => {
    if (!item || !item.is_available) return;
    for (const group of item.option_groups || []) {
      const count = selected[group.id]?.length || 0;
      if (group.is_required && count < group.min_select) {
        Alert.alert('Choose an option', `Please select at least ${group.min_select} option${group.min_select > 1 ? 's' : ''} for ${group.name}.`);
        return;
      }
    }
    const optionIds = Object.values(selected).flat();
    const optionLabels = (item.option_groups || []).flatMap((g) => (g.options || []).filter((o) => optionIds.includes(o.id)).map((o) => o.name));
    const cartItem = { id: item.id, name: item.name, price: unitPrice, quantity: qty, imageUrl: item.image_url, isVeg: item.is_veg, optionIds, optionLabels };
    setAdding(true);
    const result = addItem(cartItem, 'food' as any, { restaurantId, restaurantName: restaurant?.name });
    if (result?.needsConfirm) {
      Alert.alert('Replace cart?', `Your cart has items from ${result.currentRestaurantName}. Clear it and add this item?`, [
        { text: 'Cancel', style: 'cancel', onPress: () => setAdding(false) },
        { text: 'Clear & add', onPress: () => { forceAddItem(cartItem, 'food' as any, { restaurantId, restaurantName: restaurant?.name }); navigation.goBack(); } },
      ]);
    } else {
      setAdding(false);
      navigation.goBack();
    }
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={colors.food.primary} style={{ marginTop: 80 }} /></SafeAreaView>;
  if (!item) return null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.image} /> : <View style={[styles.image, styles.imagePlaceholder]}><Ionicons name="restaurant-outline" size={48} color={colors.gray[300]} /></View>}
        <View style={styles.content}>
          <View style={styles.nameRow}><View style={[styles.vegMark, { borderColor: item.is_veg ? colors.success.DEFAULT : colors.error.DEFAULT }]}><View style={[styles.vegDot, { backgroundColor: item.is_veg ? colors.success.DEFAULT : colors.error.DEFAULT }]} /></View><Text style={styles.name}>{item.name}</Text></View>
          {item.is_bestseller ? <View style={styles.bestseller}><Ionicons name="star" size={12} color={colors.warning.dark} /><Text style={styles.bestsellerText}>Bestseller</Text></View> : null}
          <Text style={styles.price}>{formatPrice(unitPrice)}</Text>
          {!!item.description && <Text style={styles.description}>{item.description}</Text>}

          {(item.option_groups || []).map((group) => (
            <View key={group.id} style={styles.group}>
              <View style={styles.groupHeader}><View><Text style={styles.groupTitle}>{group.name}</Text><Text style={styles.groupHint}>{group.is_required ? 'Required' : 'Optional'} · {group.max_select > 1 ? `Choose up to ${group.max_select}` : 'Choose one'}</Text></View></View>
              {(group.options || []).filter((o) => o.is_available !== false).map((option) => {
                const on = selected[group.id]?.includes(option.id);
                return <TouchableOpacity key={option.id} style={styles.optionRow} onPress={() => toggleOption(group, option)} activeOpacity={0.8}>
                  <View style={[styles.radio, group.max_select > 1 && styles.checkbox, on && styles.radioOn]}>{on ? <Ionicons name="checkmark" size={13} color={colors.white} /> : null}</View>
                  <Text style={styles.optionName}>{option.name}</Text>
                  {Number(option.price_delta || 0) > 0 ? <Text style={styles.optionPrice}>+ {formatPrice(Number(option.price_delta))}</Text> : <Text style={styles.optionPrice}>Included</Text>}
                </TouchableOpacity>;
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.stepper}><TouchableOpacity style={styles.stepTouch} onPress={() => setQty((q) => Math.max(1, q - 1))}><Ionicons name="remove" size={18} color={colors.food.primary} /></TouchableOpacity><Text style={styles.qty}>{qty}</Text><TouchableOpacity style={styles.stepTouch} onPress={() => setQty((q) => q + 1)}><Ionicons name="add" size={18} color={colors.food.primary} /></TouchableOpacity></View>
        <TouchableOpacity style={styles.addButton} disabled={adding || !item.is_available} onPress={addToCart}><Text style={styles.addButtonText}>{adding ? 'Adding…' : `Add · ${formatPrice(unitPrice * qty)}`}</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  image: { width: '100%', height: 250, backgroundColor: colors.gray[100] },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  name: { ...typography.h4, color: colors.gray[900], flex: 1 },
  vegMark: { width: 15, height: 15, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  bestseller: { alignSelf: 'flex-start', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.warning.light, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  bestsellerText: { ...typography.caption, color: colors.warning.dark },
  price: { ...typography.h5, color: colors.gray[900], marginTop: 10 },
  description: { ...typography.body2, color: colors.gray[500], marginTop: 7, lineHeight: 21 },
  group: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.gray[100], paddingTop: spacing.lg },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  groupTitle: { ...typography.h6, color: colors.gray[900] },
  groupHint: { ...typography.caption, color: colors.gray[500], marginTop: 2 },
  optionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.gray[300], alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  checkbox: { borderRadius: 5 },
  radioOn: { backgroundColor: colors.food.primary, borderColor: colors.food.primary },
  optionName: { ...typography.body2, color: colors.gray[800], flex: 1 },
  optionPrice: { ...typography.caption, color: colors.gray[500] },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray[200], flexDirection: 'row', gap: spacing.md },
  stepper: { height: 48, borderWidth: 1.5, borderColor: colors.food.primary, borderRadius: borderRadius.md, flexDirection: 'row', alignItems: 'center' },
  stepTouch: { paddingHorizontal: 14, height: '100%', alignItems: 'center', justifyContent: 'center' },
  qty: { ...typography.h6, color: colors.gray[900], minWidth: 22, textAlign: 'center' },
  addButton: { flex: 1, height: 48, borderRadius: borderRadius.md, backgroundColor: colors.food.primary, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { ...typography.button, color: colors.white },
});

export default MenuItemDetailScreen;
