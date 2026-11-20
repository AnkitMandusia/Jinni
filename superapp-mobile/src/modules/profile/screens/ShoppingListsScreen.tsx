import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';
import { useCartStore } from '@modules/cart/store/cartStore';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

type ListSummary = { id: string; name: string; items: { product_id: string; quantity: number }[] };
type Line = { product_id: string; name: string; unit: string; price: number; image_url?: string | null; quantity: number; in_stock: boolean };

/** Saved grocery lists (Zepto SHOPPING_LIST_PAGE): save the current cart, re-add later in one tap. */
export const ShoppingListsScreen: React.FC = () => {
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);

  const load = useCallback(async () => {
    try {
      setLists(await api.get<ListSummary[]>('/shopping-lists'));
    } catch (e: any) {
      Alert.alert('Could not load lists', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const groceryLines = cartItems.filter((i) => i.moduleType === 'grocery');

  const createFromCart = async () => {
    const n = name.trim();
    if (!n) return Alert.alert('Name your list', 'e.g. “Monthly staples”');
    try {
      const list: ListSummary = await api.post('/shopping-lists', { name: n });
      for (const i of groceryLines) {
        await api.put(`/shopping-lists/${list.id}/items`, { product_id: i.id, quantity: Math.min(99, i.quantity) });
      }
      setName('');
      await load();
    } catch (e: any) {
      Alert.alert('Could not save list', e?.response?.data?.detail || 'Please try again.');
    }
  };

  const toggle = async (id: string) => {
    if (openId === id) return setOpenId(null);
    try {
      const res: any = await api.get(`/shopping-lists/${id}/products`);
      setLines(res.items);
      setOpenId(id);
    } catch {
      Alert.alert('Could not open list');
    }
  };

  const addAllToCart = () => {
    const ok = lines.filter((l) => l.in_stock);
    ok.forEach((l) =>
      addItem({ id: l.product_id, name: l.name, price: l.price, quantity: l.quantity, unit: l.unit, imageUrl: l.image_url || undefined }, 'grocery'),
    );
    const skipped = lines.length - ok.length;
    Alert.alert('Added to cart', `${ok.length} item(s) added${skipped ? `, ${skipped} out of stock skipped` : ''}.`);
  };

  const remove = (id: string) =>
    Alert.alert('Delete list?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.delete(`/shopping-lists/${id}`); setOpenId(null); void load(); } },
    ]);

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary[600]} />;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <Text style={styles.title}>Save current grocery cart</Text>
        <Text style={styles.muted}>{groceryLines.length} item(s) in cart</Text>
        <View style={styles.row}>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="List name" placeholderTextColor={colors.gray[400]} maxLength={80} />
          <TouchableOpacity style={[styles.btn, !groceryLines.length && { opacity: 0.4 }]} disabled={!groceryLines.length} onPress={createFromCart}>
            <Text style={styles.btnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {lists.length === 0 && <Text style={styles.muted}>No saved lists yet.</Text>}
      {lists.map((l) => (
        <View key={l.id} style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => toggle(l.id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{l.name}</Text>
              <Text style={styles.muted}>{l.items.length} item(s)</Text>
            </View>
            <Ionicons name={openId === l.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray[400]} />
          </TouchableOpacity>
          {openId === l.id && (
            <>
              {lines.map((x) => (
                <View key={x.product_id} style={styles.line}>
                  <Text style={[styles.lineName, !x.in_stock && { color: colors.gray[400] }]} numberOfLines={1}>
                    {x.quantity}× {x.name} ({x.unit})
                  </Text>
                  <Text style={styles.muted}>{x.in_stock ? formatPrice(x.price * x.quantity) : 'Out of stock'}</Text>
                </View>
              ))}
              <View style={styles.row}>
                <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={addAllToCart}><Text style={styles.btnText}>Add all to cart</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => remove(l.id)} style={{ padding: 10 }}><Ionicons name="trash-outline" size={20} color={colors.error.DEFAULT} /></TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  title: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.gray[900] },
  muted: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.gray[500] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderColor: colors.gray[200], borderRadius: borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fontFamily.regular, color: colors.gray[900] },
  btn: { backgroundColor: colors.primary[600], paddingHorizontal: 18, paddingVertical: 11, borderRadius: borderRadius.md, alignItems: 'center' },
  btnText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 13 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  lineName: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, color: colors.gray[800], marginRight: 8 },
});

export default ShoppingListsScreen;
