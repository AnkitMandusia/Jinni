import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing } from '@theme/spacing';
import { api } from '@services/api';
import { ImagePickerField } from '@shared/components/ImagePickerField';

interface Category {
  id: string;
  name: string;
}

interface BarcodeData {
  name: string;
  brand: string;
  weight: string;
  barcode: string;
  image_url: string | null;
  ingredients: string;
  nutrition: { energy_kcal?: number; proteins_g?: number; carbs_g?: number; fat_g?: number } | null;
}

const INITIAL_FORM = {
  name: '',
  price: '',
  mrp: '',
  unit: 'piece',
  category_id: '',
  description: '',
  barcode: '',
  brand: '',
  ingredients: '',
  image_url: '',
  stock_quantity: '0',
};

export const AddProductScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const isAdminMode: boolean = route.params?.adminMode === true;

  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await api.get<{ items: Category[] }>('/grocery/categories');
      setCategories(res.items ?? []);
    } catch {
      // silently ignore
    }
  };

  const set = (key: keyof typeof INITIAL_FORM) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const startScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Camera access is required to scan barcodes.');
        return;
      }
    }
    scannedRef.current = false;
    setScanning(true);
  };

  const handleBarcodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanning(false);
    setForm(prev => ({ ...prev, barcode: data }));
    await lookupBarcode(data);
  };

  const lookupBarcode = async (code: string) => {
    setLookingUp(true);
    try {
      const res = await api.get<BarcodeData & { found: boolean }>(`/grocery/barcode/${code}`);
      if (!res.found) {
        Alert.alert('Not found', `No product info found for barcode ${code}. Fill in details manually.`);
        return;
      }
      setForm(prev => ({
        ...prev,
        name: res.name || prev.name,
        brand: res.brand || prev.brand,
        unit: res.weight || prev.unit,
        ingredients: res.ingredients || prev.ingredients,
        image_url: res.image_url || prev.image_url,
        barcode: code,
      }));
      Alert.alert('✅ Product found!', `Loaded info for "${res.name}". Review and adjust before saving.`);
    } catch {
      Alert.alert('Lookup error', 'Could not fetch product info. Fill in details manually.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Product name is required'); return; }
    if (!form.price || isNaN(parseFloat(form.price))) { Alert.alert('Required', 'Valid price is required'); return; }
    if (!form.category_id) { Alert.alert('Required', 'Please select a category'); return; }

    setLoading(true);
    try {
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const payload: Record<string, any> = {
        name: form.name.trim(),
        slug: `${slug}-${Date.now()}`,
        price: parseFloat(form.price),
        mrp: form.mrp ? parseFloat(form.mrp) : undefined,
        unit: form.unit.trim() || 'piece',
        category_id: form.category_id,
        description: form.description.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        brand: form.brand.trim() || undefined,
        ingredients: form.ingredients.trim() || undefined,
        stock_quantity: parseInt(form.stock_quantity, 10) || 0,
        primary_image_url: form.image_url || undefined,
        image_urls: form.image_url ? [form.image_url] : [],
      };

      if (isAdminMode) {
        await api.post('/grocery/admin/products', payload);
      } else {
        // Store-owned product
        payload.owner_type = 'store';
        await api.post('/grocery/admin/products', payload);
      }

      Alert.alert('✅ Product added!', `"${form.name}" has been created successfully.`, [
        { text: 'Add another', onPress: () => setForm({ ...INITIAL_FORM }) },
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to add product');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === form.category_id);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Product</Text>
        <TouchableOpacity
          style={[styles.scanBtn, lookingUp && styles.disabledBtn]}
          onPress={() => form.barcode ? lookupBarcode(form.barcode) : startScan()}
          disabled={lookingUp}
        >
          {lookingUp ? (
            <ActivityIndicator size="small" color={colors.primary[500]} />
          ) : (
            <Ionicons name="barcode-outline" size={22} color={colors.primary[500]} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Barcode row */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Barcode</Text>
              <TextInput
                style={styles.input}
                value={form.barcode}
                onChangeText={set('barcode')}
                placeholder="Scan or type EAN / UPC"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => form.barcode && lookupBarcode(form.barcode)}
              />
            </View>
            <TouchableOpacity style={styles.scanIconBtn} onPress={startScan}>
              <Ionicons name="scan-outline" size={22} color={colors.primary[500]} />
            </TouchableOpacity>
          </View>

          {/* Name */}
          <Text style={styles.fieldLabel}>Product Name *</Text>
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={set('name')}
            placeholder="e.g. Amul Butter 500g"
            placeholderTextColor="#9CA3AF"
          />

          {/* Brand */}
          <Text style={styles.fieldLabel}>Brand</Text>
          <TextInput
            style={styles.input}
            value={form.brand}
            onChangeText={set('brand')}
            placeholder="e.g. Amul"
            placeholderTextColor="#9CA3AF"
          />

          {/* Price / MRP row */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Selling Price (₹) *</Text>
              <TextInput
                style={styles.input}
                value={form.price}
                onChangeText={set('price')}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={{ width: spacing.md }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>MRP (₹)</Text>
              <TextInput
                style={styles.input}
                value={form.mrp}
                onChangeText={set('mrp')}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          {/* Unit / Stock row */}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Unit</Text>
              <TextInput
                style={styles.input}
                value={form.unit}
                onChangeText={set('unit')}
                placeholder="e.g. 500g, 1L, piece"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={{ width: spacing.md }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Stock Qty</Text>
              <TextInput
                style={styles.input}
                value={form.stock_quantity}
                onChangeText={set('stock_quantity')}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>

          {/* Category picker */}
          <Text style={styles.fieldLabel}>Category *</Text>
          <TouchableOpacity
            style={[styles.input, styles.pickerRow]}
            onPress={() => setShowCategoryPicker(true)}
          >
            <Text style={selectedCategory ? styles.pickerText : styles.pickerPlaceholder}>
              {selectedCategory ? selectedCategory.name : 'Select a category'}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Description */}
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.description}
            onChangeText={set('description')}
            placeholder="Optional product description"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />

          {/* Ingredients */}
          <Text style={styles.fieldLabel}>Ingredients</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.ingredients}
            onChangeText={set('ingredients')}
            placeholder="Ingredient list (auto-filled from barcode)"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={3}
          />

          {/* Image */}
          <ImagePickerField
            value={form.image_url || null}
            onChange={(url) => setForm(prev => ({ ...prev, image_url: url }))}
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.disabledBtn]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>Add Product</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category picker modal */}
      <Modal visible={showCategoryPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                <Ionicons name="close" size={22} color="#374151" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryRow,
                    form.category_id === cat.id && styles.categoryRowSelected,
                  ]}
                  onPress={() => {
                    setForm(prev => ({ ...prev, category_id: cat.id }));
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text style={[
                    styles.categoryRowText,
                    form.category_id === cat.id && styles.categoryRowTextSelected,
                  ]}>
                    {cat.name}
                  </Text>
                  {form.category_id === cat.id && (
                    <Ionicons name="checkmark" size={18} color={colors.primary[500]} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Barcode scanner modal */}
      <Modal visible={scanning} animationType="slide">
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'qr'] }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>Align barcode within the frame</Text>
          </View>
          <TouchableOpacity
            style={styles.scannerCloseBtn}
            onPress={() => setScanning(false)}
          >
            <Ionicons name="close-circle" size={44} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: '#111827' },
  scanBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 0 },
  fieldLabel: { fontSize: 13, fontFamily: fontFamily.semiBold, color: '#374151', marginBottom: 6, marginTop: spacing.md },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 15,
    color: '#111827',
    marginBottom: spacing.sm,
  },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: spacing.sm },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: { fontSize: 15, color: '#111827' },
  pickerPlaceholder: { fontSize: 15, color: '#9CA3AF' },
  scanIconBtn: {
    marginLeft: spacing.sm,
    marginBottom: spacing.sm,
    width: 44,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#DBEAFE',
  },
  submitBtn: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary[500],
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontFamily: fontFamily.bold },
  disabledBtn: { opacity: 0.6 },
  // Category modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: '#111827' },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  categoryRowSelected: { backgroundColor: '#EFF6FF' },
  categoryRowText: { fontSize: 15, color: '#374151' },
  categoryRowTextSelected: { color: colors.primary[500], fontFamily: fontFamily.bold },
  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerFrame: {
    width: 240,
    height: 180,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scannerHint: {
    color: '#fff',
    marginTop: 16,
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    textAlign: 'center',
  },
  scannerCloseBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
  },
});

export default AddProductScreen;
