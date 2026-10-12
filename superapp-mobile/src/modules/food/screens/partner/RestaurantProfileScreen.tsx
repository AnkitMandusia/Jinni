import React, { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { useAuthStore } from '@auth/store/authStore';
import { ImagePickerField } from '@shared/components/ImagePickerField';

const FOOD = colors.food?.primary || '#FF6B6B';

const CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Fast Food',
  'Bakery', 'Desserts', 'Beverages', 'Mughlai', 'Street Food', 'Continental', 'Thali',
];

export const RestaurantProfileScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [costForTwo, setCostForTwo] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [pureVeg, setPureVeg] = useState(false);
  const [gstin, setGstin] = useState('');
  const [fssai, setFssai] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [upiId, setUpiId] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<any>('/food/partner/restaurant');
      setName(r.name || '');
      setDescription(r.description || '');
      setCuisines(r.cuisines || []);
      setLogoUrl(r.logo_url || null);
      setCoverUrl(r.cover_image_url || null);
      setAddress(r.address_line1 || '');
      setCity(r.city || '');
      setState(r.state || '');
      setPincode(r.pincode || '');
      setCostForTwo(r.cost_for_two ? String(r.cost_for_two) : '');
      setDeliveryFee(r.delivery_fee ? String(r.delivery_fee) : '');
      setMinOrder(r.min_order_amount ? String(r.min_order_amount) : '');
      setPureVeg(!!r.pure_veg);
      setGstin(r.gstin || '');
      setFssai(r.fssai_license || '');
      setBankAccount(r.bank_account || '');
      setBankIfsc(r.bank_ifsc || '');
      setUpiId(r.upi_id || '');
    } catch (e) {
      console.error('Failed to load restaurant profile', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleCuisine = (c: string) => {
    setCuisines((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const save = async () => {
    if (name.trim().length < 2 || cuisines.length === 0) {
      Alert.alert('Missing details', 'Please enter a name and at least one cuisine.');
      return;
    }
    if (pincode && !/^\d{6}$/.test(pincode.trim())) {
      Alert.alert('Invalid pincode', 'Pincode must be exactly 6 digits.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/food/partner/restaurant', {
        name: name.trim(),
        description: description.trim() || undefined,
        cuisines,
        logo_url: logoUrl || undefined,
        cover_image_url: coverUrl || undefined,
        address_line1: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        cost_for_two: costForTwo ? parseInt(costForTwo, 10) : undefined,
        delivery_fee: deliveryFee ? parseFloat(deliveryFee) : undefined,
        min_order_amount: minOrder ? parseFloat(minOrder) : undefined,
        pure_veg: pureVeg,
        gstin: gstin.trim() || undefined,
        fssai_license: fssai.trim() || undefined,
        bank_account: bankAccount.trim() || undefined,
        bank_ifsc: bankIfsc.trim() || undefined,
        upi_id: upiId.trim() || undefined,
      });
      Alert.alert('Saved', 'Your restaurant profile has been updated.');
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
        <Text style={styles.title}>Restaurant profile</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <ImagePickerField
                value={logoUrl}
                onChange={setLogoUrl}
                label="Logo"
                uploadUrl="/food/partner/upload-image"
                uploadParams={{ kind: 'logo' }}
                height={100}
              />
            </View>
            <View style={{ flex: 1.6 }}>
              <ImagePickerField
                value={coverUrl}
                onChange={setCoverUrl}
                label="Cover photo"
                uploadUrl="/food/partner/upload-image"
                uploadParams={{ kind: 'cover' }}
                aspect={[16, 9]}
                height={100}
              />
            </View>
          </View>

          <Text style={styles.label}>Restaurant name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.gray[400]} />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            placeholderTextColor={colors.gray[400]}
          />

          <Text style={styles.label}>Cuisines</Text>
          <View style={styles.chipWrap}>
            {CUISINE_OPTIONS.map((c) => (
              <TouchableOpacity key={c} style={[styles.cuisineChip, cuisines.includes(c) && styles.cuisineChipOn]} onPress={() => toggleCuisine(c)}>
                <Text style={[styles.cuisineChipText, cuisines.includes(c) && styles.cuisineChipTextOn]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Address</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholderTextColor={colors.gray[400]} />

          <View style={styles.row3}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>City</Text>
              <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor={colors.gray[400]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>State</Text>
              <TextInput style={styles.input} value={state} onChangeText={setState} placeholderTextColor={colors.gray[400]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Pincode *</Text>
              <TextInput
                style={styles.input}
                value={pincode}
                onChangeText={setPincode}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="6-digit"
                placeholderTextColor={colors.gray[400]}
              />
            </View>
          </View>
          <Text style={styles.fieldHintText}>
            Orders placed near this pincode are what get routed to your restaurant — keep it current if you relocate.
          </Text>

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>GSTIN</Text>
              <TextInput style={styles.input} value={gstin} onChangeText={setGstin} autoCapitalize="characters" placeholderTextColor={colors.gray[400]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>FSSAI License</Text>
              <TextInput style={styles.input} value={fssai} onChangeText={setFssai} placeholderTextColor={colors.gray[400]} />
            </View>
          </View>

          <Text style={[styles.label, styles.sectionLabel]}>Payout details</Text>
          <Text style={styles.label}>Bank Account Number</Text>
          <TextInput style={styles.input} value={bankAccount} onChangeText={setBankAccount} keyboardType="numeric" placeholderTextColor={colors.gray[400]} />

          <Text style={styles.label}>IFSC Code</Text>
          <TextInput style={styles.input} value={bankIfsc} onChangeText={setBankIfsc} autoCapitalize="characters" placeholderTextColor={colors.gray[400]} />

          <Text style={styles.label}>UPI ID</Text>
          <TextInput
            style={styles.input}
            value={upiId}
            onChangeText={setUpiId}
            placeholder="yourname@upi"
            autoCapitalize="none"
            placeholderTextColor={colors.gray[400]}
          />

          <View style={[styles.row3, { marginTop: spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Cost for two</Text>
              <TextInput style={styles.input} value={costForTwo} onChangeText={setCostForTwo} keyboardType="number-pad" placeholderTextColor={colors.gray[400]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Delivery fee</Text>
              <TextInput style={styles.input} value={deliveryFee} onChangeText={setDeliveryFee} keyboardType="decimal-pad" placeholderTextColor={colors.gray[400]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Min order</Text>
              <TextInput style={styles.input} value={minOrder} onChangeText={setMinOrder} keyboardType="decimal-pad" placeholderTextColor={colors.gray[400]} />
            </View>
          </View>

          <TouchableOpacity style={styles.vegRow} onPress={() => setPureVeg((v) => !v)}>
            <View style={[styles.vegBox, pureVeg && styles.vegBoxOn]}>
              {pureVeg && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={styles.vegLabel}>Pure vegetarian restaurant</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Save changes</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color={colors.error.DEFAULT} />
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
          <Text style={styles.accountEmail}>{user?.email}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  title: { fontSize: 20, color: colors.gray[900], fontFamily: fontFamily.bold},
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxxl },
  row2: { flexDirection: 'row', gap: spacing.md },
  row3: { flexDirection: 'row', gap: spacing.md },
  label: { fontSize: 13, color: colors.gray[700], marginBottom: 6, marginTop: spacing.md, fontFamily: fontFamily.bold},
  input: {
    borderWidth: 1.5, borderColor: colors.gray[200], borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 14, color: colors.gray[900], backgroundColor: colors.surface.sunken,
    fontFamily: fontFamily.regular,
  },
  multiline: { minHeight: 70 },
  fieldHintText: { fontSize: 11, color: colors.gray[500], marginTop: spacing.xs, marginBottom: spacing.xs, fontFamily: fontFamily.regular, lineHeight: 15 },
  sectionLabel: { marginTop: spacing.xl, fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[500] },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cuisineChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: borderRadius.lg, backgroundColor: colors.gray[100], borderWidth: 1, borderColor: colors.gray[200] },
  cuisineChipOn: { backgroundColor: FOOD, borderColor: FOOD },
  cuisineChipText: { fontSize: 12, color: colors.gray[600], fontFamily: fontFamily.semiBold},
  cuisineChipTextOn: { color: colors.white },
  vegRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.lg },
  vegBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.success.DEFAULT, alignItems: 'center', justifyContent: 'center' },
  vegBoxOn: { backgroundColor: colors.success.DEFAULT },
  vegLabel: { fontSize: 13, color: colors.gray[700], fontFamily: fontFamily.semiBold},
  saveBtn: { backgroundColor: FOOD, borderRadius: borderRadius.md, paddingVertical: 15, alignItems: 'center', marginTop: spacing.xxl },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: colors.white, fontSize: 15, fontFamily: fontFamily.bold},
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg, marginTop: spacing.lg },
  logoutText: { fontSize: 14, color: colors.error.DEFAULT, fontFamily: fontFamily.bold},
  accountEmail: { textAlign: 'center', fontSize: 11, color: colors.gray[400], fontFamily: fontFamily.regular},
});

export default RestaurantProfileScreen;
