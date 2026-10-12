import React, { useState } from 'react';
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
import * as Location from 'expo-location';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { useAuthStore } from '@auth/store/authStore';
import { useLocationStore } from '@store/locationStore';

const FOOD = colors.food?.primary || '#FF6B6B';

const CUISINE_OPTIONS = [
  'North Indian', 'South Indian', 'Chinese', 'Italian', 'Fast Food',
  'Bakery', 'Desserts', 'Beverages', 'Mughlai', 'Street Food', 'Continental', 'Thali',
];

interface Props {
  onCreated: () => void;
}

export const RestaurantSetupScreen: React.FC<Props> = ({ onCreated }) => {
  const { user, logout } = useAuthStore();
  const { pincode: savedPincode, city: savedCity } = useLocationStore();

  const [name, setName] = useState(user?.name ? `${user.name}'s Kitchen` : '');
  const [description, setDescription] = useState('');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState(savedCity || 'Jaipur');
  const [stateName, setStateName] = useState('Rajasthan');
  const [pincode, setPincode] = useState(savedPincode || '302001');
  const [costForTwo, setCostForTwo] = useState('400');
  const [pureVeg, setPureVeg] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleCuisine = (c: string) => {
    setCuisines((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const valid =
    name.trim().length >= 2 &&
    cuisines.length > 0 &&
    address.trim().length > 3 &&
    city.trim().length > 1 &&
    stateName.trim().length > 1 &&
    /^\d{6}$/.test(pincode);

  const submit = async () => {
    if (!valid) {
      Alert.alert('Missing details', 'Please fill in restaurant name, at least one cuisine, address and a valid 6-digit pincode.');
      return;
    }
    setSubmitting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Location required', 'Allow location access so customers and riders can find your restaurant accurately.');
        setSubmitting(false);
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/food/partner/restaurant', {
        name: name.trim(),
        description: description.trim() || undefined,
        cuisines,
        tags: [],
        address_line1: address.trim(),
        city: city.trim(),
        state: stateName.trim(),
        pincode,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        pure_veg: pureVeg,
        cost_for_two: costForTwo ? parseInt(costForTwo, 10) : undefined,
      });
      onCreated();
    } catch (e: any) {
      Alert.alert('Could not create restaurant', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="restaurant" size={32} color={FOOD} />
            </View>
            <Text style={styles.heroTitle}>Set up your restaurant</Text>
            <Text style={styles.heroSub}>
              Tell us about your restaurant to start receiving orders. You can edit everything later from Profile.
            </Text>
          </View>

          <Text style={styles.label}>Restaurant name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Spice Garden"
            placeholderTextColor={colors.gray[400]}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Short description (optional)</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What makes your food special?"
            placeholderTextColor={colors.gray[400]}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Cuisines</Text>
          <View style={styles.chipWrap}>
            {CUISINE_OPTIONS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.cuisineChip, cuisines.includes(c) && styles.cuisineChipOn]}
                onPress={() => toggleCuisine(c)}
              >
                <Text style={[styles.cuisineChipText, cuisines.includes(c) && styles.cuisineChipTextOn]}>
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Shop no, street, landmark"
            placeholderTextColor={colors.gray[400]}
            value={address}
            onChangeText={setAddress}
          />

          <View style={styles.row3}>
            <View style={{ flex: 1.3 }}>
              <Text style={styles.label}>City</Text>
              <TextInput style={styles.input} value={city} onChangeText={setCity} placeholderTextColor={colors.gray[400]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>State</Text>
              <TextInput style={styles.input} value={stateName} onChangeText={setStateName} placeholderTextColor={colors.gray[400]} />
            </View>
          </View>

          <View style={styles.row3}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Pincode</Text>
              <TextInput
                style={styles.input}
                value={pincode}
                onChangeText={setPincode}
                keyboardType="number-pad"
                maxLength={6}
                placeholderTextColor={colors.gray[400]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Cost for two (₹)</Text>
              <TextInput
                style={styles.input}
                value={costForTwo}
                onChangeText={setCostForTwo}
                keyboardType="number-pad"
                placeholderTextColor={colors.gray[400]}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.vegRow} onPress={() => setPureVeg((v) => !v)}>
            <View style={[styles.vegBox, pureVeg && styles.vegBoxOn]}>
              {pureVeg && <Ionicons name="checkmark" size={14} color={colors.white} />}
            </View>
            <Text style={styles.vegLabel}>This is a pure vegetarian restaurant</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitBtn, (!valid || submitting) && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={!valid || submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitText}>Create restaurant</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxxxl },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  heroIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.secondary[50],
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 20, color: colors.gray[900], fontFamily: fontFamily.bold},
  heroSub: { fontSize: 13, color: colors.gray[500], textAlign: 'center', marginTop: 6, lineHeight: 19, paddingHorizontal: spacing.md, fontFamily: fontFamily.regular},
  label: { fontSize: 13, color: colors.gray[700], marginBottom: 6, marginTop: spacing.md, fontFamily: fontFamily.bold},
  input: {
    borderWidth: 1.5, borderColor: colors.gray[200], borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 14, color: colors.gray[900],
    fontFamily: fontFamily.regular,
    backgroundColor: colors.surface.sunken,
  },
  multiline: { minHeight: 70 },
  row3: { flexDirection: 'row', gap: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cuisineChip: {
    paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: borderRadius.lg,
    backgroundColor: colors.gray[100], borderWidth: 1, borderColor: colors.gray[200],
  },
  cuisineChipOn: { backgroundColor: FOOD, borderColor: FOOD },
  cuisineChipText: { fontSize: 12, color: colors.gray[600], fontFamily: fontFamily.semiBold},
  cuisineChipTextOn: { color: colors.white },
  vegRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.lg },
  vegBox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: colors.success.DEFAULT,
    alignItems: 'center', justifyContent: 'center',
  },
  vegBoxOn: { backgroundColor: colors.success.DEFAULT },
  vegLabel: { fontSize: 13, color: colors.gray[700], fontFamily: fontFamily.semiBold},
  submitBtn: {
    backgroundColor: FOOD, borderRadius: borderRadius.md, paddingVertical: 15,
    alignItems: 'center', marginTop: spacing.xxl,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.white, fontSize: 15, fontFamily: fontFamily.bold},
  logoutBtn: { alignItems: 'center', marginTop: spacing.lg },
  logoutText: { color: colors.gray[500], fontSize: 13, fontFamily: fontFamily.semiBold},
});

export default RestaurantSetupScreen;
