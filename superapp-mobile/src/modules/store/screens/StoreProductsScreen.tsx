import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Switch,
  TextInput,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';

interface Category {
  id: string;
  name: string;
}

interface UniversalProduct {
  product_id: string;
  name: string;
  price: number;
  unit: string;
  image_url: string | null;
  is_available: boolean;
  stock_quantity: number;
  has_custom_price: boolean;
  category_id: string;
}

interface CustomProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  image_url: string | null;
  is_available: boolean;
  stock_quantity: number;
  category_id: string;
}

export const StoreProductsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [universalProducts, setUniversalProducts] = useState<UniversalProduct[]>([]);
  const [customProducts, setCustomProducts] = useState<CustomProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'universal' | 'custom'>('universal');
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  // Set right before navigating to AddProduct, so that when this screen
  // refocuses on goBack() we can jump the owner straight to the "My Products"
  // tab — otherwise a newly added custom product lands in the custom list
  // while the screen is still showing the "Universal Products" tab, and
  // silently looks like the add didn't work.
  const wentToAddProduct = useRef(false);
  
  // New product form
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    category_id: '',
    stock_quantity: '0',
    description: '',
  });

  const fetchCategories = async () => {
    try {
      const response = await api.get<{ items: Category[] }>('/grocery/categories');
      setCategories(response.items || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const params = selectedCategory ? `?category_id=${selectedCategory}` : '';
      const response = await api.get<{ universal: UniversalProduct[]; custom: CustomProduct[] }>(
        `/grocery/store/products${params}`
      );
      setUniversalProducts(response.universal || []);
      setCustomProducts(response.custom || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchCategories();
      fetchProducts();
      if (wentToAddProduct.current) {
        wentToAddProduct.current = false;
        setActiveTab('custom');
      }
    }, [selectedCategory])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const toggleAvailability = async (productId: string, currentStatus: boolean) => {
    setUpdatingProductId(productId);
    try {
      await api.post(`/grocery/store/products/${productId}/toggle`, {
        is_available: !currentStatus
      });
      fetchProducts();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || 'Failed to update availability';
      alert('Error: ' + errorMsg);
      console.error('Toggle error:', error);
    } finally {
      setUpdatingProductId(null);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.name || !newProduct.price || !newProduct.category_id) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await api.post('/grocery/store/custom-products', {
        name: newProduct.name,
        price: parseFloat(newProduct.price),
        category_id: newProduct.category_id,
        unit: 'piece',
        stock_quantity: parseInt(newProduct.stock_quantity) || 0,
        description: newProduct.description || null,
        image_url: null,
      });
      
      setShowAddModal(false);
      setNewProduct({ name: '', price: '', category_id: '', stock_quantity: '0', description: '' });
      fetchProducts();
      alert('Product added successfully!');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail 
        || error?.message 
        || 'Failed to add product';
      alert('Error: ' + errorMsg);
      console.error('Add product error:', error);
    }
  };

  const deleteCustomProduct = async (productId: string) => {
    try {
      await api.delete(`/grocery/store/custom-products/${productId}`);
      fetchProducts();
      alert('Product deleted');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || 'Failed to delete';
      alert('Error: ' + errorMsg);
      console.error('Delete error:', error);
    }
  };

  const renderUniversalProduct = ({ item }: { item: UniversalProduct }) => (
    <View style={styles.productCard}>
      <View style={styles.productHeader}>
        <View style={styles.productInfo}>
          <Text style={styles.productName}>{item.name}</Text>
          <Text style={styles.productPrice}>
            ₹{item.price.toFixed(2)} / {item.unit}
          </Text>
          {item.has_custom_price && (
            <View style={styles.customPriceBadge}>
              <Text style={styles.customPriceText}>Custom Price</Text>
            </View>
          )}
        </View>
        
        <View style={styles.availabilityToggle}>
          {updatingProductId === item.product_id ? (
            <ActivityIndicator size="small" color={colors.primary[500]} />
          ) : (
            <>
              <Text style={[
                styles.availabilityText,
                { color: item.is_available ? colors.success.DEFAULT : colors.gray[500] }
              ]}>
                {item.is_available ? 'Available' : 'Unavailable'}
              </Text>
              <Switch
                value={item.is_available}
                onValueChange={() => toggleAvailability(item.product_id, item.is_available)}
                trackColor={{ false: colors.gray[300], true: colors.success.light }}
                thumbColor={item.is_available ? colors.success.DEFAULT : colors.gray[500]}
              />
            </>
          )}
        </View>
      </View>
      <Text style={styles.stockText}>Stock: {item.stock_quantity} {item.unit}</Text>
    </View>
  );

  const toggleCustomAvailability = async (productId: string, currentStatus: boolean) => {
    setUpdatingProductId(productId);
    try {
      await api.post(`/grocery/store/custom-products/${productId}/toggle`, {
        is_available: !currentStatus
      });
      fetchProducts();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || 'Failed to update availability';
      alert('Error: ' + errorMsg);
      console.error('Toggle custom error:', error);
    } finally {
      setUpdatingProductId(null);
    }
  };

  const renderCustomProduct = ({ item }: { item: CustomProduct }) => (
    <View style={styles.productCard}>
      <View style={styles.productHeader}>
        <View style={styles.productInfo}>
          <View style={styles.customBadge}>
            <Text style={styles.customBadgeText}>CUSTOM</Text>
          </View>
          <Text style={styles.productName}>{item.name}</Text>
          <Text style={styles.productPrice}>
            ₹{item.price.toFixed(2)} / {item.unit}
          </Text>
        </View>
        
        <View style={styles.availabilityToggle}>
          <Switch
            value={item.is_available}
            onValueChange={() => toggleCustomAvailability(item.id, item.is_available)}
            trackColor={{ false: colors.gray[300], true: colors.success.light }}
            thumbColor={item.is_available ? colors.success.DEFAULT : colors.gray[500]}
          />
        </View>
      </View>
      
      <View style={styles.customFooter}>
        <Text style={styles.stockText}>Stock: {item.stock_quantity}</Text>
        <TouchableOpacity 
          style={styles.deleteBtn}
          onPress={() => {
            Alert.alert(
              'Delete Product',
              'Are you sure you want to delete this product?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteCustomProduct(item.id) },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Products</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            wentToAddProduct.current = true;
            navigation.navigate('AddProduct', { adminMode: false });
          }}
        >
          <Ionicons name="add" size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'universal' && styles.activeTab]}
          onPress={() => setActiveTab('universal')}
        >
          <Text style={[styles.tabText, activeTab === 'universal' && styles.activeTabText]}>
            Universal Products
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'custom' && styles.activeTab]}
          onPress={() => setActiveTab('custom')}
        >
          <Text style={[styles.tabText, activeTab === 'custom' && styles.activeTabText]}>
            My Products
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category Filter */}
      {activeTab === 'universal' && (
        <View style={styles.categoryFilter}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.categoryChip, !selectedCategory && styles.activeCategoryChip]}
              onPress={() => setSelectedCategory(null)}
            >
              <Text style={[styles.categoryText, !selectedCategory && styles.activeCategoryText]}>
                All
              </Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, selectedCategory === cat.id && styles.activeCategoryChip]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text style={[styles.categoryText, selectedCategory === cat.id && styles.activeCategoryText]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Products List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={styles.loader} />
      ) : (
        <FlatList
          data={activeTab === 'universal' ? universalProducts : customProducts}
          renderItem={activeTab === 'universal' ? renderUniversalProduct : renderCustomProduct}
          keyExtractor={(item) => activeTab === 'universal' ? item.product_id : item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={64} color={colors.gray[300]} />
              <Text style={styles.emptyText}>No products found</Text>
            </View>
          }
        />
      )}

      {/* Add Product Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Custom Product</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={colors.gray[600]} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Product Name *"
              value={newProduct.name}
              onChangeText={(text) => setNewProduct({ ...newProduct, name: text })}
            />

            <Text style={styles.label}>Category *</Text>
            <View style={styles.categoryList}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categorySelect,
                    newProduct.category_id === cat.id && styles.categorySelectActive
                  ]}
                  onPress={() => setNewProduct({ ...newProduct, category_id: cat.id })}
                >
                  <Text style={newProduct.category_id === cat.id ? styles.categorySelectTextActive : styles.categorySelectText}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Price (₹) *"
                value={newProduct.price}
                onChangeText={(text) => setNewProduct({ ...newProduct, price: text })}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Stock"
                value={newProduct.stock_quantity}
                onChangeText={(text) => setNewProduct({ ...newProduct, stock_quantity: text })}
                keyboardType="number-pad"
              />
            </View>

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description (optional)"
              value={newProduct.description}
              onChangeText={(text) => setNewProduct({ ...newProduct, description: text })}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddProduct}>
              <Text style={styles.submitBtnText}>Add Product</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  title: { fontSize: 24, fontFamily: fontFamily.bold, color: colors.gray[900] },
  addBtn: {
    backgroundColor: colors.primary[500],
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    backgroundColor: colors.gray[100],
  },
  activeTab: { backgroundColor: colors.primary[500] },
  tabText: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.gray[600] },
  activeTabText: { color: colors.white },
  categoryFilter: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray[100],
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  activeCategoryChip: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[500],
  },
  categoryText: { fontSize: 13, color: colors.gray[600], fontFamily: fontFamily.medium },
  activeCategoryText: { color: colors.white, fontFamily: fontFamily.semiBold },
  list: { padding: spacing.md },
  loader: { flex: 1, marginTop: 100 },
  productCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  productInfo: { flex: 1 },
  productName: { fontSize: 16, fontFamily: fontFamily.semiBold, color: colors.gray[900] },
  productPrice: { fontSize: 14, color: colors.gray[600], marginTop: 2 },
  customPriceBadge: {
    backgroundColor: colors.warning.light,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  customPriceText: { fontSize: 10, color: colors.warning.dark, fontFamily: fontFamily.semiBold },
  availabilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  availabilityText: { fontSize: 12, fontFamily: fontFamily.medium },
  stockText: { fontSize: 12, color: colors.gray[500], marginTop: spacing.sm },
  customBadge: {
    backgroundColor: colors.secondary[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
    alignSelf: 'flex-start',
    marginBottom: spacing.xs,
  },
  customBadgeText: { fontSize: 10, color: colors.white, fontFamily: fontFamily.bold },
  customFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  deleteBtn: {
    padding: spacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: { fontSize: 16, fontFamily: fontFamily.semiBold, color: colors.gray[600], marginTop: spacing.md },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 20, fontFamily: fontFamily.bold, color: colors.gray[900] },
  label: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.gray[700], marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    fontSize: 15,
    marginBottom: spacing.md,
    color: colors.gray[900],
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: spacing.md },
  halfInput: { flex: 1 },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  categorySelect: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  categorySelectActive: {
    backgroundColor: colors.primary[500],
    borderColor: colors.primary[500],
  },
  categorySelectText: { fontSize: 13, color: colors.gray[700], fontFamily: fontFamily.medium },
  categorySelectTextActive: { fontSize: 13, color: colors.white, fontFamily: fontFamily.semiBold },
  submitBtn: {
    backgroundColor: colors.primary[500],
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtnText: { color: colors.white, fontSize: 16, fontFamily: fontFamily.semiBold },
});

export default StoreProductsScreen;
