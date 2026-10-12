import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
  Switch,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { typography, fontFamily } from '@theme/typography';
import { spacing } from '@theme/spacing';
import { api } from '@services/api';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  mrp: number | null;
  unit: string;
  primary_image_url: string | null;
  is_in_stock: boolean;
  is_active: boolean;
  category_id: string;
  category_name: string | null;
  stock_quantity: number;
  owner_type: string;
  barcode: string | null;
  brand: string | null;
  sku: string | null;
  ingredients: string | null;
  description: string | null;
}

export const AdminProductsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get<{ items: Category[] }>('/grocery/categories');
      setCategories(res.items ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchProducts = useCallback(async (p = 1, reset = false) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    try {
      const params: Record<string, any> = { page: p, page_size: 20 };
      if (search.trim()) params.search = search.trim();
      if (categoryFilter) params.category_id = categoryFilter;
      const res = await api.get<{ items: Product[]; total_pages: number }>('/grocery/products', { params });
      const items = res.items ?? [];
      setProducts(prev => (p === 1 || reset) ? items : [...prev, ...items]);
      setTotalPages(res.total_pages ?? 1);
      setPage(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  useFocusEffect(useCallback(() => { fetchProducts(1, true); }, [fetchProducts]));

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      brand: product.brand ?? '',
      price: String(product.price),
      mrp: product.mrp ? String(product.mrp) : '',
      unit: product.unit,
      category_id: product.category_id,
      stock_quantity: String(product.stock_quantity),
      barcode: product.barcode ?? '',
      sku: product.sku ?? '',
      ingredients: product.ingredients ?? '',
      description: product.description ?? '',
      is_active: product.is_active,
    });
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editingProduct) return;
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        price: parseFloat(editForm.price) || 0,
        mrp: editForm.mrp ? parseFloat(editForm.mrp) : undefined,
        stock_quantity: parseInt(editForm.stock_quantity, 10) || 0,
      };
      await api.put(`/grocery/products/${editingProduct.id}`, payload);
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...payload } : p));
      setShowEditModal(false);
      Alert.alert('Success', 'Product updated');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts(1, true);
  };

  const loadMore = () => {
    if (!loadingMore && page < totalPages) fetchProducts(page + 1);
  };

  const toggleActive = async (product: Product) => {
    try {
      await api.put(`/grocery/products/${product.id}`, { is_active: !product.is_active });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_active: !p.is_active } : p));
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to update product');
    }
  };

  const deleteProduct = async (product: Product) => {
    Alert.alert(
      'Delete Product',
      `Delete "${product.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/grocery/products/${product.id}`);
              setProducts(prev => prev.filter(p => p.id !== product.id));
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to delete product');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Product }) => (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        {item.primary_image_url ? (
          <Image source={{ uri: item.primary_image_url }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="cube-outline" size={26} color={colors.gray[300]} />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          {item.brand ? <Text style={styles.brand}>{item.brand}</Text> : null}
          <Text style={styles.category}>{item.category_name ?? 'Uncategorized'}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{Number(item.price).toFixed(2)}</Text>
            {item.mrp && Number(item.mrp) > Number(item.price) ? (
              <Text style={styles.mrp}>₹{Number(item.mrp).toFixed(2)}</Text>
            ) : null}
            <Text style={styles.unit}>{item.unit}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.badge, item.owner_type === 'platform' ? styles.badgePlatform : styles.badgeStore]}>
              <Text style={styles.badgeText}>{item.owner_type === 'platform' ? 'PLATFORM' : 'STORE'}</Text>
            </View>
            <Text style={styles.stock}>Stock: {item.stock_quantity}</Text>
            {item.barcode ? <Text style={styles.barcode}>#{item.barcode}</Text> : null}
          </View>
        </View>
        <View style={styles.actions}>
          <Switch
            value={item.is_active}
            onValueChange={() => toggleActive(item)}
            trackColor={{ false: colors.gray[300], true: colors.success.light }}
            thumbColor={item.is_active ? colors.success.DEFAULT : colors.gray[400]}
          />
          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
            <Ionicons name="pencil-outline" size={18} color={colors.primary[500]} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteProduct(item)}>
            <Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Products</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddProduct', { adminMode: true })}
        >
          <Ionicons name="add" size={22} color={colors.white} />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Search & Filter */}
      <View style={styles.filterRow}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.text.muted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search products…"
            placeholderTextColor={colors.gray[400]}
            returnKeyType="search"
            onSubmitEditing={() => fetchProducts(1, true)}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(''); fetchProducts(1, true); }}>
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity 
          style={[styles.categoryBtn, categoryFilter && styles.categoryBtnActive]} 
          onPress={() => {
            Alert.alert('Filter by Category', '', [
              { text: 'All Categories', onPress: () => setCategoryFilter('') },
              ...categories.map(c => ({ text: c.name, onPress: () => setCategoryFilter(c.id) })),
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
        >
          <Ionicons name="filter-outline" size={16} color={categoryFilter ? colors.primary[500] : colors.text.secondary} />
          <Text style={[styles.categoryBtnText, categoryFilter && styles.categoryBtnTextActive]}>
            {categoryFilter ? categories.find(c => c.id === categoryFilter)?.name ?? 'Filter' : 'Filter'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary[500]} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 }}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary[500]} /> : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={44} color={colors.gray[300]} />
              <Text style={styles.emptyTitle}>No products yet</Text>
              <Text style={styles.emptyHint}>Tap + Add to create the first platform product</Text>
            </View>
          }
        />
      )}

      {/* Edit Modal */}
      {showEditModal && editingProduct && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={showEditModal}
          onRequestClose={() => setShowEditModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Product</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={24} color={colors.gray[700]} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.name}
                  onChangeText={(v) => setEditForm({ ...editForm, name: v })}
                  placeholder="Product name"
                />

                <Text style={styles.fieldLabel}>Brand</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.brand}
                  onChangeText={(v) => setEditForm({ ...editForm, brand: v })}
                  placeholder="Brand"
                />

                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Price (₹) *</Text>
                    <TextInput
                      style={styles.input}
                      value={editForm.price}
                      onChangeText={(v) => setEditForm({ ...editForm, price: v })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                  </View>
                  <View style={{ width: spacing.sm }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>MRP (₹)</Text>
                    <TextInput
                      style={styles.input}
                      value={editForm.mrp}
                      onChangeText={(v) => setEditForm({ ...editForm, mrp: v })}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                    />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Unit *</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.unit}
                  onChangeText={(v) => setEditForm({ ...editForm, unit: v })}
                  placeholder="e.g. 500g, 1L, piece"
                />

                <Text style={styles.fieldLabel}>Category *</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => {
                    Alert.alert('Select Category', '', [
                      ...categories.map(c => ({ 
                        text: c.name, 
                        onPress: () => setEditForm({ ...editForm, category_id: c.id }),
                        style: editForm.category_id === c.id ? 'destructive' : 'default'
                      })),
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                >
                  <Text style={editForm.category_id ? styles.pickerText : styles.pickerPlaceholder}>
                    {categories.find(c => c.id === editForm.category_id)?.name ?? 'Select category'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Stock Quantity</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.stock_quantity}
                  onChangeText={(v) => setEditForm({ ...editForm, stock_quantity: v })}
                  keyboardType="number-pad"
                  placeholder="0"
                />

                <Text style={styles.fieldLabel}>Barcode</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.barcode}
                  onChangeText={(v) => setEditForm({ ...editForm, barcode: v })}
                  placeholder="EAN-13 / UPC-A"
                />

                <Text style={styles.fieldLabel}>SKU</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.sku}
                  onChangeText={(v) => setEditForm({ ...editForm, sku: v })}
                  placeholder="Internal SKU"
                />

                <Text style={styles.fieldLabel}>Ingredients</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editForm.ingredients}
                  onChangeText={(v) => setEditForm({ ...editForm, ingredients: v })}
                  placeholder="Ingredients list"
                  multiline
                  numberOfLines={3}
                />

                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editForm.description}
                  onChangeText={(v) => setEditForm({ ...editForm, description: v })}
                  placeholder="Product description"
                  multiline
                  numberOfLines={3}
                />

                <View style={styles.row}>
                  <Text style={styles.fieldLabel}>Active</Text>
                  <Switch
                    value={editForm.is_active}
                    onValueChange={(v) => setEditForm({ ...editForm, is_active: v })}
                    trackColor={{ false: colors.gray[300], true: colors.success.light }}
                    thumbColor={editForm.is_active ? colors.success.DEFAULT : colors.gray[400]}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.disabledBtn]}
                  onPress={saveEdit}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>

                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
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
  headerTitle: { ...typography.h4, color: colors.text.primary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary[500],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
  },
  addBtnText: { ...typography.label, color: colors.white },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    height: 44,
    marginRight: spacing.sm,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    height: 44,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  categoryBtnActive: { borderColor: colors.primary[500], backgroundColor: colors.primary[50] },
  categoryBtnText: { ...typography.caption, color: colors.text.secondary, fontFamily: fontFamily.semiBold },
  categoryBtnTextActive: { color: colors.primary[500] },
  searchInput: { flex: 1, ...typography.body1, color: colors.text.primary },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    marginBottom: spacing.md,
    padding: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  thumb: { width: 72, height: 72, borderRadius: 10 },
  thumbPlaceholder: {
    backgroundColor: colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  cardBody: { flex: 1 },
  productName: { ...typography.label, fontSize: 14, color: colors.text.primary, marginBottom: 2 },
  brand: { ...typography.caption, color: colors.text.secondary, marginBottom: 1 },
  category: { ...typography.caption, fontSize: 11, color: colors.text.muted, marginBottom: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  price: { ...typography.label, fontSize: 15, color: colors.success.dark },
  mrp: { ...typography.caption, color: colors.text.muted, textDecorationLine: 'line-through' },
  unit: { ...typography.caption, fontSize: 11, color: colors.text.secondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  badge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  badgePlatform: { backgroundColor: colors.primary[50] },
  badgeStore: { backgroundColor: colors.warning.light },
  badgeText: { fontSize: 9, fontFamily: fontFamily.bold, color: colors.gray[700] },
  stock: { ...typography.caption, fontSize: 11, color: colors.text.secondary },
  barcode: { ...typography.caption, fontSize: 11, color: colors.text.muted },
  actions: { alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, gap: 4 },
  editBtn: { padding: 6 },
  deleteBtn: { padding: 6 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  
  emptyTitle: { ...typography.h5, color: colors.text.secondary },
  emptyHint: { ...typography.body2, color: colors.text.muted, textAlign: 'center', paddingHorizontal: 32 },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: colors.surface.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.h5, color: colors.text.primary },
  modalScroll: { maxHeight: '100%' },
  fieldLabel: { ...typography.label, fontSize: 13, color: colors.gray[700], marginBottom: 6, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface.sunken,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...typography.body1,
    color: colors.text.primary,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  pickerText: { ...typography.body1, color: colors.text.primary },
  pickerPlaceholder: { ...typography.body1, color: colors.text.muted },
  row: { flexDirection: 'row', alignItems: 'center' },
  saveBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary[500],
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: { ...typography.button, fontSize: 16, color: colors.white },
  disabledBtn: { opacity: 0.6 },
});

export default AdminProductsScreen;
