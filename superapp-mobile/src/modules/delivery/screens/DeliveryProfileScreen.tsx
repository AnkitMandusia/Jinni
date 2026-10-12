import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { useAuthStore } from '@auth/store/authStore';
import { api } from '@services/api';

interface DeliveryProfile {
  id: string;
  name: string;
  vehicle_type: string;
  license_no: string;
  pincode: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  is_available: boolean;
}

export const DeliveryProfileScreen: React.FC = () => {
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<DeliveryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pincode, setPincode] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [upiId, setUpiId] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const data: any = await api.get('/delivery/profile');
      setProfile(data);
      setPincode(data.pincode ?? '');
      setVehicleType(data.vehicle_type ?? '');
      setBankAccount(data.bank_account ?? '');
      setBankIfsc(data.bank_ifsc ?? '');
      setUpiId(data.upi_id ?? '');
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (pincode && pincode.length !== 6) {
      Alert.alert('Invalid Pincode', 'Pincode must be exactly 6 digits.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/delivery/profile', {
        pincode: pincode || null,
        vehicle_type: vehicleType || null,
        bank_account: bankAccount || null,
        bank_ifsc: bankIfsc || null,
        upi_id: upiId || null,
      });
      Alert.alert('Saved', 'Profile updated successfully.\nYou will now see orders from pincode ' + pincode);
      fetchProfile();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail ?? 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.name?.[0] ?? user?.name?.[0] ?? '?'}</Text>
          </View>
          <Text style={styles.name}>{profile?.name ?? user?.name}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          <View style={[styles.badge, profile?.is_available ? styles.onlineBadge : styles.offlineBadge]}>
            <Text style={[styles.badgeText, profile?.is_available ? styles.onlineText : styles.offlineText]}>
              {profile?.is_available ? '● Online' : '● Offline'}
            </Text>
          </View>
        </View>

        {/* Read-only info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agent Details</Text>
          <View style={styles.infoRow}>
            <Ionicons name="bicycle-outline" size={18} color={colors.gray[500]} />
            <Text style={styles.infoLabel}>Vehicle</Text>
            <Text style={styles.infoValue}>{profile?.vehicle_type ?? '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card-outline" size={18} color={colors.gray[500]} />
            <Text style={styles.infoLabel}>License No.</Text>
            <Text style={styles.infoValue}>{profile?.license_no ?? '—'}</Text>
          </View>
        </View>

        {/* Editable fields */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Settings</Text>

          <Text style={styles.fieldLabel}>Service Pincode *</Text>
          <Text style={styles.fieldHint}>
            You will only receive orders placed from this pincode. Update when you change location.
          </Text>
          <View style={styles.inputRow}>
            <Ionicons name="location-outline" size={18} color={colors.primary[500]} />
            <TextInput
              style={styles.input}
              value={pincode}
              onChangeText={setPincode}
              placeholder="Enter 6-digit pincode"
              keyboardType="number-pad"
              maxLength={6}
              placeholderTextColor={colors.gray[400]}
            />
            {pincode.length === 6 && (
              <Ionicons name="checkmark-circle" size={18} color={colors.success.DEFAULT} />
            )}
          </View>

          <Text style={styles.fieldLabel}>Vehicle Type</Text>
          <View style={styles.inputRow}>
            <Ionicons name="bicycle-outline" size={18} color={colors.gray[500]} />
            <TextInput
              style={styles.input}
              value={vehicleType}
              onChangeText={setVehicleType}
              placeholder="e.g. Bike, Scooter, Cycle"
              placeholderTextColor={colors.gray[400]}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bank Details</Text>

          <Text style={styles.fieldLabel}>Account Number</Text>
          <View style={styles.inputRow}>
            <Ionicons name="wallet-outline" size={18} color={colors.gray[500]} />
            <TextInput
              style={styles.input}
              value={bankAccount}
              onChangeText={setBankAccount}
              placeholder="Bank account number"
              keyboardType="numeric"
              placeholderTextColor={colors.gray[400]}
            />
          </View>

          <Text style={styles.fieldLabel}>IFSC Code</Text>
          <View style={styles.inputRow}>
            <Ionicons name="business-outline" size={18} color={colors.gray[500]} />
            <TextInput
              style={styles.input}
              value={bankIfsc}
              onChangeText={setBankIfsc}
              placeholder="IFSC code"
              autoCapitalize="characters"
              placeholderTextColor={colors.gray[400]}
            />
          </View>

          <Text style={styles.fieldLabel}>UPI ID</Text>
          <View style={styles.inputRow}>
            <Ionicons name="qr-code-outline" size={18} color={colors.gray[500]} />
            <TextInput
              style={styles.input}
              value={upiId}
              onChangeText={setUpiId}
              placeholder="yourname@upi"
              autoCapitalize="none"
              placeholderTextColor={colors.gray[400]}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.error.DEFAULT} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxxl },
  avatarSection: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#10B981',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  avatarText: { fontSize: 32, color: colors.white, fontFamily: fontFamily.bold },
  name: { fontSize: 22, color: colors.gray[900], fontFamily: fontFamily.bold },
  phone: { fontSize: 14, color: colors.gray[500], marginTop: spacing.xs, fontFamily: fontFamily.regular },
  badge: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.xl },
  onlineBadge: { backgroundColor: '#D1FAE5' },
  offlineBadge: { backgroundColor: colors.gray[200] },
  badgeText: { fontSize: 13, fontFamily: fontFamily.bold },
  onlineText: { color: '#065F46' },
  offlineText: { color: colors.gray[600] },
  section: {
    backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.lg,
    marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.gray[200],
  },
  sectionTitle: {
    fontSize: 16, color: colors.gray[900], marginBottom: spacing.lg, fontFamily: fontFamily.bold,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  infoLabel: { flex: 1, fontSize: 14, color: colors.gray[600], fontFamily: fontFamily.regular },
  infoValue: { fontSize: 14, color: colors.gray[900], fontFamily: fontFamily.semiBold },
  fieldLabel: { fontSize: 13, color: colors.gray[700], marginBottom: spacing.xs, marginTop: spacing.md, fontFamily: fontFamily.semiBold },
  fieldHint: { fontSize: 12, color: colors.gray[500], marginBottom: spacing.sm, lineHeight: 17, fontFamily: fontFamily.regular },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.gray[50], borderWidth: 1, borderColor: colors.gray[200],
    borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: { flex: 1, fontSize: 15, color: colors.gray[900], fontFamily: fontFamily.regular },
  saveBtn: {
    backgroundColor: '#10B981', padding: spacing.lg, borderRadius: 14,
    alignItems: 'center', marginBottom: spacing.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontSize: 16, fontFamily: fontFamily.bold },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.lg,
  },
  logoutText: { fontSize: 15, color: colors.error.DEFAULT, fontFamily: fontFamily.semiBold },
});

export default DeliveryProfileScreen;
