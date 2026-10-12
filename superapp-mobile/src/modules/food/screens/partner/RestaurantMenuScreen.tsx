import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Switch,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';

const FOOD = colors.food?.primary || '#FF6B6B';

interface MenuItem {
  id: string;
  name: string;
  price: string | number;
  discounted_price?: string | number | null;
  is_veg: boolean;
  image_url?: string | null;
  is_available: boolean;
  is_bestseller: boolean;
  category_id?: string | null;
}

interface Category {
  id: string;
  name: string;
  is_active: boolean;
  items: MenuItem[];
}

export const RestaurantMenuScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [newCatModal, setNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const load = useCallback(async () => {
    try {
      const cats = await api.get<Category[]>('/food/partner/categories');
      setCategories(cats);
    } catch (e) {
      console.error('Failed to load menu', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleAvailability = async (item: MenuItem) => {
    setTogglingId(item.id);
    try {
      await api.post(`/food/partner/menu-items/${item.id}/availability`, { is_available: !item.is_available });
      setCategories((prev) =>
        prev.map((c) => ({
          ...c,
          items: c.items.map((i) => (i.id === item.id ? { ...i, is_available: !i.is_available } : i)),
        }))
      );
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || 'Could not update item');
    } finally {
      setTogglingId(null);
    }
  };

  const deleteItem = (item: MenuItem) => {
    Alert.alert(`Remove "${item.name}"?`, 'This item will be removed from your menu.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/food/partner/menu-items/${item.id}`);
            load();
          } catch (e: any) {
            Alert.alert('Failed', e?.response?.data?.detail || 'Could not remove item');
          }
        },
      },
    ]);
  };

  const createCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      await api.post('/food/partner/categories', { name: newCatName.trim() });
      setNewCatModal(false);
      setNewCatName('');
      load();
    } catch (e: any) {
      Alert.alert('Failed', e?.response?.data?.detail || 'Could not create category');
    } finally {
      setSavingCat(false);
    }
  };

  const sections = categories.map((c) => ({ title: c.name, categoryId: c.id, data: c.items }));
  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Menu</Text>
          <Text style={styles.sub}>{totalItems} item{totalItems !== 1 ? 's' : ''} · {categories.length} categories</Text>
        </View>
        <TouchableOpacity style={styles.addCatBtn} onPress={() => setNewCatModal(true)}>
          <Ionicons name="add" size={16} color={FOOD} />
          <Text style={styles.addCatText}>Category</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={FOOD} style={{ marginTop: 80 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FOOD} />}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('AddEditMenuItem', { categoryId: (section as any).categoryId })}
              >
                <Ionicons name="add-circle" size={22} color={FOOD} />
              </TouchableOpacity>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.itemCard}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('AddEditMenuItem', { itemId: item.id })}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.itemImg} />
              ) : (
                <View style={[styles.itemImg, styles.itemImgPh]}>
                  <Ionicons name="restaurant-outline" size={20} color={colors.secondary[300]} />
                </View>
              )}
              <View style={styles.itemBody}>
                <View style={styles.itemNameRow}>
                  <View style={[styles.vegDot, { borderColor: item.is_veg ? colors.success.DEFAULT : colors.error.DEFAULT }]}>
                    <View style={[styles.vegDotInner, { backgroundColor: item.is_veg ? colors.success.DEFAULT : colors.error.DEFAULT }]} />
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  {item.is_bestseller && (
                    <View style={styles.bestsellerTag}>
                      <Ionicons name="star" size={9} color={colors.warning.dark} />
                      <Text style={styles.bestsellerTagText}>Bestseller</Text>
                    </View>
                  )}
                </View>
                <View style={styles.priceRow}>
                  {item.discounted_price ? (
                    <>
                      <Text style={styles.price}>{formatPrice(item.discounted_price)}</Text>
                      <Text style={styles.strikePrice}>{formatPrice(item.price)}</Text>
                    </>
                  ) : (
                    <Text style={styles.price}>{formatPrice(item.price)}</Text>
                  )}
                </View>
              </View>
              <View style={styles.itemActions}>
                {togglingId === item.id ? (
                  <ActivityIndicator size="small" color={FOOD} />
                ) : (
                  <Switch
                    value={item.is_available}
                    onValueChange={() => toggleAvailability(item)}
                    trackColor={{ true: FOOD, false: colors.gray[300] }}
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                  />
                )}
                <TouchableOpacity onPress={() => deleteItem(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.gray[400]} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="fast-food-outline" size={56} color={colors.gray[300]} />
              <Text style={styles.emptyTitle}>No menu items yet</Text>
              <Text style={styles.emptySub}>Add a category, then add dishes to it.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setNewCatModal(true)}>
                <Text style={styles.emptyBtnText}>Add your first category</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <Modal visible={newCatModal} transparent animationType="slide" onRequestClose={() => setNewCatModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>New category</Text>
            <TextInput
              style={styles.catInput}
              placeholder="e.g. Starters, Main Course, Desserts"
              placeholderTextColor={colors.gray[400]}
              value={newCatName}
              onChangeText={setNewCatName}
              autoFocus
            />
            <View style={styles.sheetBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setNewCatModal(false); setNewCatName(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!newCatName.trim() || savingCat) && styles.saveBtnDisabled]}
                onPress={createCategory}
                disabled={!newCatName.trim() || savingCat}
              >
                {savingCat ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.xl, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  title: { fontSize: 22, color: colors.gray[900], fontFamily: fontFamily.bold},
  sub: { fontSize: 12, color: colors.gray[500], marginTop: 2, fontFamily: fontFamily.regular},
  addCatBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1.5, borderColor: FOOD, borderRadius: borderRadius.xl, paddingHorizontal: spacing.md, paddingVertical: 7 },
  addCatText: { color: FOOD, fontSize: 12, fontFamily: fontFamily.bold},
  list: { padding: spacing.md, paddingBottom: spacing.xxxl },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  sectionTitle: { fontSize: 15, color: colors.gray[800], fontFamily: fontFamily.bold},
  itemCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: borderRadius.md,
    padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.gray[100], gap: spacing.sm,
  },
  itemImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.gray[100] },
  itemImgPh: { alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vegDot: { width: 13, height: 13, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  vegDotInner: { width: 6, height: 6, borderRadius: 3 },
  itemName: { fontSize: 14, color: colors.gray[900], flexShrink: 1, fontFamily: fontFamily.bold},
  bestsellerTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bestsellerTagText: { fontSize: 10, color: colors.warning.dark, fontFamily: fontFamily.bold},
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  price: { fontSize: 13, color: colors.gray[900], fontFamily: fontFamily.bold},
  strikePrice: { fontSize: 11, color: colors.gray[400], textDecorationLine: 'line-through', fontFamily: fontFamily.regular},
  itemActions: { alignItems: 'center', gap: spacing.sm },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 15, color: colors.gray[600], marginTop: spacing.md, fontFamily: fontFamily.bold},
  emptySub: { fontSize: 12, color: colors.gray[500], marginTop: spacing.xs, textAlign: 'center', fontFamily: fontFamily.regular},
  emptyBtn: { marginTop: spacing.lg, backgroundColor: FOOD, borderRadius: borderRadius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  emptyBtnText: { color: colors.white, fontSize: 13, fontFamily: fontFamily.bold},
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 36 },
  sheetTitle: { fontSize: 17, color: colors.gray[900], marginBottom: spacing.lg, fontFamily: fontFamily.bold},
  catInput: {
    borderWidth: 1.5, borderColor: colors.gray[200], borderRadius: borderRadius.md, padding: spacing.md,
    fontSize: 14, color: colors.gray[900], backgroundColor: colors.surface.sunken, marginBottom: spacing.lg,
    fontFamily: fontFamily.regular,
  },
  sheetBtns: { flexDirection: 'row', gap: spacing.md },
  cancelBtn: { flex: 0.4, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1.5, borderColor: colors.gray[200] },
  cancelText: { color: colors.gray[600], fontSize: 15, fontFamily: fontFamily.bold},
  saveBtn: { flex: 1, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center', backgroundColor: FOOD },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: colors.white, fontSize: 15, fontFamily: fontFamily.bold},
});

export default RestaurantMenuScreen;
