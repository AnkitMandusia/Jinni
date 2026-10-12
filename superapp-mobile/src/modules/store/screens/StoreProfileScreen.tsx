import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Switch,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { useAuthStore } from '@auth/store/authStore';

interface StoreProfile {
  user_id: string;
  email: string;
  phone: string;
  store_name: string;
  owner_name: string;
  gstin: string | null;
  fssai: string | null;
  address: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  is_open: boolean;
  delivery_radius_km: number;
  bank_account: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  created_at: string;
}

export const StoreProfileScreen: React.FC = () => {
  const { logout } = useAuthStore();
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [gstin, setGstin] = useState('');
  const [fssai, setFssai] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [upiId, setUpiId] = useState('');

  const hydrateForm = (p: StoreProfile) => {
    setAddress(p.address ?? '');
    setPincode(p.pincode ?? '');
    setCity(p.city ?? '');
    setState(p.state ?? '');
    setGstin(p.gstin ?? '');
    setFssai(p.fssai ?? '');
    setBankAccount(p.bank_account ?? '');
    setBankIfsc(p.bank_ifsc ?? '');
    setUpiId(p.upi_id ?? '');
  };

  const fetchProfile = async () => {
    try {
      const response = await api.get<StoreProfile>('/store/profile');
      setProfile(response);
      hydrateForm(response);
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || 'Unknown error';
      console.error('Profile error details:', errorMsg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const toggleOpenStatus = async () => {
    if (!profile) return;

    setUpdating(true);
    try {
      await api.patch('/store/profile', {
        is_open: !profile.is_open,
      });
      setProfile({ ...profile, is_open: !profile.is_open });
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || 'Failed to update status';
      Alert.alert('Error', errorMsg);
    } finally {
      setUpdating(false);
    }
  };

  const saveDetails = async () => {
    if (pincode && !/^\d{6}$/.test(pincode)) {
      Alert.alert('Invalid pincode', 'Pincode must be exactly 6 digits.');
      return;
    }
    setSaving(true);
    try {
      const updated: any = await api.patch('/store/profile', {
        address: address.trim() || null,
        pincode: pincode || null,
        city: city.trim() || null,
        state: state.trim() || null,
        gstin: gstin.trim() || null,
        fssai: fssai.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_ifsc: bankIfsc.trim() || null,
        upi_id: upiId.trim() || null,
      });
      setProfile((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditing(false);
      Alert.alert(
        'Saved',
        pincode
          ? `Store details updated. You will now receive orders placed from pincode ${pincode}.`
          : 'Store details updated.'
      );
    } catch (error: any) {
      Alert.alert('Could not save', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    if (profile) hydrateForm(profile);
    setEditing(false);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error.DEFAULT} />
        <Text style={styles.errorText}>Failed to load profile</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchProfile}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Store Profile</Text>
            {!editing ? (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Ionicons name="create-outline" size={16} color={colors.primary[600]} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.editBtn} onPress={cancelEdit}>
                <Text style={[styles.editBtnText, { color: colors.gray[500] }]}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Store Status Card */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View>
                <Text style={styles.statusLabel}>Store Status</Text>
                <Text
                  style={[
                    styles.statusValue,
                    { color: profile.is_open ? colors.success.DEFAULT : colors.error.DEFAULT },
                  ]}
                >
                  {profile.is_open ? 'Open for Business' : 'Currently Closed'}
                </Text>
              </View>
              {updating ? (
                <ActivityIndicator size="small" color={colors.primary[500]} />
              ) : (
                <Switch
                  value={profile.is_open}
                  onValueChange={toggleOpenStatus}
                  trackColor={{ false: colors.gray[300], true: colors.success.light }}
                  thumbColor={profile.is_open ? colors.success.DEFAULT : colors.error.DEFAULT}
                />
              )}
            </View>
            <Text style={styles.statusHint}>
              {profile.is_open
                ? 'Customers can place orders to your store'
                : 'Your store is not accepting new orders'}
            </Text>
          </View>

          {/* Store Info Section (read-only identity) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Store Information</Text>
            <View style={styles.infoCard}>
              <InfoRow icon="storefront" label="Store Name" value={profile.store_name} />
              <InfoRow icon="person" label="Owner Name" value={profile.owner_name} />
              <InfoRow icon="mail" label="Email" value={profile.email} />
              <InfoRow icon="call" label="Phone" value={profile.phone} />
            </View>
          </View>

          {/* Business Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Business Details</Text>
            {!editing ? (
              <View style={styles.infoCard}>
                <InfoRow icon="document-text" label="GSTIN" value={profile.gstin || 'Not provided'} />
                <InfoRow icon="shield-checkmark" label="FSSAI License" value={profile.fssai || 'Not provided'} />
                <InfoRow icon="location" label="Address" value={profile.address || 'Not provided'} />
                <InfoRow icon="navigate" label="Pincode" value={profile.pincode || 'Not set'} />
                <InfoRow icon="business" label="City/State" value={`${profile.city || '-'}, ${profile.state || '-'}`} />
              </View>
            ) : (
              <View style={styles.editCard}>
                <Field label="Address" value={address} onChangeText={setAddress} multiline />
                <Field
                  label="Pincode *"
                  value={pincode}
                  onChangeText={setPincode}
                  keyboardType="number-pad"
                  maxLength={6}
                  hint="Orders near this pincode will be routed to your store."
                />
                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Field label="City" value={city} onChangeText={setCity} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="State" value={state} onChangeText={setState} />
                  </View>
                </View>
                <Field label="GSTIN" value={gstin} onChangeText={setGstin} autoCapitalize="characters" />
                <Field label="FSSAI License" value={fssai} onChangeText={setFssai} />
              </View>
            )}
          </View>

          {/* Bank / UPI Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payout Details</Text>
            {!editing ? (
              <View style={styles.infoCard}>
                <InfoRow icon="card" label="Account Number" value={profile.bank_account || 'Not provided'} />
                <InfoRow icon="code" label="IFSC Code" value={profile.bank_ifsc || 'Not provided'} />
                <InfoRow icon="qr-code" label="UPI ID" value={profile.upi_id || 'Not provided'} />
              </View>
            ) : (
              <View style={styles.editCard}>
                <Field label="Bank Account Number" value={bankAccount} onChangeText={setBankAccount} keyboardType="numeric" />
                <Field label="IFSC Code" value={bankIfsc} onChangeText={setBankIfsc} autoCapitalize="characters" />
                <Field label="UPI ID" value={upiId} onChangeText={setUpiId} placeholder="yourname@upi" autoCapitalize="none" />
              </View>
            )}
          </View>

          {editing && (
            <View style={styles.section}>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={saveDetails} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Delivery Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delivery Settings</Text>
            <View style={styles.infoCard}>
              <InfoRow icon="bicycle" label="Delivery Radius" value={`${profile.delivery_radius_km} km`} />
            </View>
          </View>

          {/* Account Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.infoCard}>
              <InfoRow
                icon="time"
                label="Member Since"
                value={new Date(profile.created_at).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              />
            </View>
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={colors.error.DEFAULT} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  hint?: string;
  multiline?: boolean;
  keyboardType?: any;
  maxLength?: number;
  autoCapitalize?: any;
  placeholder?: string;
}> = ({ label, value, onChangeText, hint, multiline, keyboardType, maxLength, autoCapitalize, placeholder }) => (
  <View style={{ marginBottom: spacing.md }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    <TextInput
      style={[styles.input, multiline && styles.multiline]}
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      placeholder={placeholder}
      placeholderTextColor={colors.gray[400]}
    />
  </View>
);

const InfoRow: React.FC<{
  icon: string;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <View style={styles.infoRow}>
    <View style={styles.iconContainer}>
      <Ionicons name={icon as any} size={18} color={colors.primary[500]} />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  title: { fontSize: 24, color: colors.gray[900], fontFamily: fontFamily.bold },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  editBtnText: { fontSize: 14, color: colors.primary[600], fontFamily: fontFamily.semiBold },
  statusCard: {
    backgroundColor: colors.white,
    margin: spacing.xl,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusLabel: { fontSize: 12, color: colors.gray[500], fontFamily: fontFamily.medium },
  statusValue: { fontSize: 16, marginTop: 2, fontFamily: fontFamily.bold },
  statusHint: { fontSize: 12, color: colors.gray[500], fontFamily: fontFamily.regular },
  section: { paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: 14,
    color: colors.gray[700],
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: fontFamily.bold,
  },
  infoCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: 'hidden',
  },
  editCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    padding: spacing.md,
  },
  row2: { flexDirection: 'row', gap: spacing.md },
  fieldLabel: { fontSize: 12, color: colors.gray[700], marginBottom: spacing.xs, fontFamily: fontFamily.semiBold },
  fieldHint: { fontSize: 11, color: colors.gray[500], marginBottom: 6, fontFamily: fontFamily.regular },
  input: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.gray[900],
    backgroundColor: colors.gray[50],
    fontFamily: fontFamily.regular,
  },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.white, fontSize: 15, fontFamily: fontFamily.bold },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: colors.gray[500], marginBottom: 2, fontFamily: fontFamily.regular },
  infoValue: { fontSize: 15, color: colors.gray[900], fontFamily: fontFamily.semiBold },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error.DEFAULT,
    gap: spacing.sm,
  },
  logoutText: { fontSize: 16, color: colors.error.DEFAULT, fontFamily: fontFamily.semiBold },
  errorText: { fontSize: 16, color: colors.gray[600], marginTop: spacing.md, fontFamily: fontFamily.regular },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.sm,
  },
  retryText: { color: colors.white, fontFamily: fontFamily.semiBold },
  bottomPadding: { height: 40 },
});

export default StoreProfileScreen;
