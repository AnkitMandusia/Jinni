import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { ImagePickerField } from '@shared/components/ImagePickerField';

const FOOD = colors.food?.primary || '#FF6B6B';

export const AddEditMenuItemScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const itemId: string | undefined = route.params?.itemId;
  const categoryId: string | undefined = route.params?.categoryId;
  const isEdit = !!itemId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [discountedPrice, setDiscountedPrice] = useState('');
  const [isVeg, setIsVeg] = useState(true);
  const [isEgg, setIsEgg] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isBestseller, setIsBestseller] = useState(false);
  const [isRecommended, setIsRecommended] = useState(false);
  const [prepTime, setPrepTime] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const item = await api.get<any>(`/food/menu-items/${itemId}`);
        setName(item.name);
        setDescription(item.description || '');
        setPrice(String(item.price ?? ''));
        setDiscountedPrice(item.discounted_price ? String(item.discounted_price) : '');
        setIsVeg(!!item.is_veg);
        setIsEgg(!!item.is_egg);
        setImageUrl(item.image_url || null);
        setIsBestseller(!!item.is_bestseller);
        setIsRecommended(!!item.is_recommended);
        setPrepTime(item.prep_time_minutes ? String(item.prep_time_minutes) : '');
      } catch (e: any) {
        Alert.alert('Failed to load', e?.response?.data?.detail || 'Could not load this item');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    })();
  }, [itemId]);

  const valid = name.trim().length >= 2 && !!price && parseFloat(price) >= 0;

  const save = async () => {
    if (!valid) {
      Alert.alert('Missing details', 'Please enter a name and a valid price.');
      return;
    }
    setSaving(true);
    const body: any = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: parseFloat(price),
      discounted_price: discountedPrice ? parseFloat(discountedPrice) : undefined,
      is_veg: isVeg,
      is_egg: isEgg,
      image_url: imageUrl || undefined,
      is_bestseller: isBestseller,
      is_recommended: isRecommended,
      prep_time_minutes: prepTime ? parseInt(prepTime, 10) : undefined,
    };
    if (!isEdit && categoryId) body.category_id = categoryId;

    try {
      if (isEdit) {
        await api.patch(`/food/partner/menu-items/${itemId}`, body);
      } else {
        if (!categoryId) {
          Alert.alert('Pick a category', 'Create a category first, then add items to it.');
          setSaving(false);
          return;
        }
        await api.post('/food/partner/menu-items', body);
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={FOOD} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[800]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit item' : 'New item'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ImagePickerField
            value={imageUrl}
            onChange={setImageUrl}
            label="Dish photo"
            uploadUrl="/food/partner/upload-image"
            uploadParams={{ kind: 'menu-item' }}
            height={160}
          />

          <Text style={styles.label}>Dish name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Paneer Butter Masala"
            placeholderTextColor={colors.gray[400]}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Short description of the dish"
            placeholderTextColor={colors.gray[400]}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Price (₹)</Text>
              <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholderTextColor={colors.gray[400]} placeholder="249" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Offer price (optional)</Text>
              <TextInput style={styles.input} value={discountedPrice} onChangeText={setDiscountedPrice} keyboardType="decimal-pad" placeholderTextColor={colors.gray[400]} placeholder="199" />
            </View>
          </View>

          <Text style={styles.label}>Prep time, minutes (optional)</Text>
          <TextInput style={styles.input} value={prepTime} onChangeText={setPrepTime} keyboardType="number-pad" placeholder="15" placeholderTextColor={colors.gray[400]} />

          <Text style={styles.label}>Type</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity style={[styles.typeChip, isVeg && styles.typeChipVegOn]} onPress={() => { setIsVeg(true); setIsEgg(false); }}>
              <View style={[styles.vegSq, { borderColor: colors.success.DEFAULT }]}><View style={[styles.vegDotInner, { backgroundColor: colors.success.DEFAULT }]} /></View>
              <Text style={styles.typeChipText}>Veg</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeChip, isEgg && styles.typeChipEggOn]} onPress={() => { setIsVeg(false); setIsEgg(true); }}>
              <View style={[styles.vegSq, { borderColor: colors.warning.DEFAULT }]}><View style={[styles.vegDotInner, { backgroundColor: colors.warning.DEFAULT }]} /></View>
              <Text style={styles.typeChipText}>Egg</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeChip, !isVeg && !isEgg && styles.typeChipNonVegOn]} onPress={() => { setIsVeg(false); setIsEgg(false); }}>
              <View style={[styles.vegSq, { borderColor: colors.error.DEFAULT }]}><View style={[styles.vegDotInner, { backgroundColor: colors.error.DEFAULT }]} /></View>
              <Text style={styles.typeChipText}>Non-veg</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.checkRow} onPress={() => setIsBestseller((v) => !v)}>
            <View style={[styles.checkBox, isBestseller && styles.checkBoxOn]}>
              {isBestseller && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={styles.checkLabel}>Mark as bestseller</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.checkRow} onPress={() => setIsRecommended((v) => !v)}>
            <View style={[styles.checkBox, isRecommended && styles.checkBoxOn]}>
              {isRecommended && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={styles.checkLabel}>Mark as chef's recommendation</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn, (!valid || saving) && styles.saveBtnDisabled]} onPress={save} disabled={!valid || saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>{isEdit ? 'Save changes' : 'Add item'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  headerTitle: { fontSize: 16, color: colors.gray[900], fontFamily: fontFamily.bold},
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxxl },
  label: { fontSize: 13, color: colors.gray[700], marginBottom: 6, marginTop: spacing.md, fontFamily: fontFamily.bold},
  input: {
    borderWidth: 1.5, borderColor: colors.gray[200], borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 14, color: colors.gray[900], backgroundColor: colors.surface.sunken,
    fontFamily: fontFamily.regular,
  },
  multiline: { minHeight: 70 },
  row2: { flexDirection: 'row', gap: spacing.md },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg, backgroundColor: colors.gray[100], borderWidth: 1, borderColor: colors.gray[200],
  },
  typeChipVegOn: { backgroundColor: colors.success.light, borderColor: colors.success.DEFAULT },
  typeChipEggOn: { backgroundColor: colors.warning.light, borderColor: colors.warning.DEFAULT },
  typeChipNonVegOn: { backgroundColor: colors.error.light, borderColor: colors.error.DEFAULT },
  typeChipText: { fontSize: 12, color: colors.gray[700], fontFamily: fontFamily.bold},
  vegSq: { width: 14, height: 14, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  vegDotInner: { width: 6, height: 6, borderRadius: 3 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.gray[300], alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: FOOD, borderColor: FOOD },
  checkLabel: { fontSize: 13, color: colors.gray[700], fontFamily: fontFamily.semiBold},
  saveBtn: { backgroundColor: FOOD, borderRadius: borderRadius.md, paddingVertical: 15, alignItems: 'center', marginTop: spacing.xxl },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: colors.white, fontSize: 15, fontFamily: fontFamily.bold},
});

export default AddEditMenuItemScreen;
