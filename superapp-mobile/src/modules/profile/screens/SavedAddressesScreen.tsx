import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { AppInput } from '@components/AppInput';
import { AppButton } from '@components/AppButton';
import { EmptyState } from '@components/EmptyState';
import { colors } from '@theme/colors';
import { fontFamily, typography } from '@theme/typography';
import { borderRadius, shadows, spacing } from '@theme/spacing';
import { api } from '@services/api';

interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  is_default: boolean;
}

const LABELS = ['Home', 'Work', 'Other'];

const emptyForm = { label: 'Home', line1: '', line2: '', city: '', state: '', pincode: '', landmark: '' };

export const SavedAddressesScreen: React.FC = () => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadAddresses = useCallback(async () => {
    try {
      const data: any = await api.get('/users/addresses');
      setAddresses(Array.isArray(data) ? data : data?.addresses || []);
    } catch {
      // ignore — show empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAddresses(); }, [loadAddresses]));

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
    setModalVisible(true);
  };

  const openEdit = (addr: Address) => {
    setEditingId(addr.id);
    setForm({
      label: addr.label, line1: addr.line1, line2: addr.line2 || '',
      city: addr.city, state: addr.state, pincode: addr.pincode, landmark: addr.landmark || '',
    });
    setErrors({});
    setModalVisible(true);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.line1.trim() || form.line1.trim().length < 3) next.line1 = 'Enter the house/flat & street.';
    if (!form.city.trim()) next.city = 'Enter a city.';
    if (!form.state.trim()) next.state = 'Enter a state.';
    if (!/^\d{6}$/.test(form.pincode.trim())) next.pincode = 'Enter a valid 6-digit pincode.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        label: form.label, line1: form.line1.trim(), line2: form.line2.trim() || undefined,
        city: form.city.trim(), state: form.state.trim(), pincode: form.pincode.trim(),
        landmark: form.landmark.trim() || undefined,
      };
      if (editingId) {
        await api.patch(`/users/addresses/${editingId}`, payload);
      } else {
        await api.post('/users/addresses', { ...payload, is_default: addresses.length === 0 });
      }
      setModalVisible(false);
      await loadAddresses();
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      Alert.alert('Could not save address', typeof detail === 'string' ? detail : 'Please check the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (addr: Address) => {
    Alert.alert('Remove address', `Remove "${addr.label}" address?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/users/addresses/${addr.id}`);
            await loadAddresses();
          } catch {
            Alert.alert('Could not remove address', 'Please try again.');
          }
        },
      },
    ]);
  };

  const handleSetDefault = async (addr: Address) => {
    if (addr.is_default) return;
    try {
      await api.patch(`/users/addresses/${addr.id}`, { is_default: true });
      await loadAddresses();
    } catch {
      Alert.alert('Could not update', 'Please try again.');
    }
  };

  const labelIcon = (label: string) => (label === 'Home' ? 'home-outline' : label === 'Work' ? 'briefcase-outline' : 'location-outline');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={<Ionicons name="location-outline" size={36} color={colors.gray[300]} />}
              title="No saved addresses"
              description="Add an address to speed up checkout next time."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.labelIconWrap}>
                <Ionicons name={labelIcon(item.label) as any} size={16} color={colors.primary[600]} />
              </View>
              <Text style={styles.labelText}>{item.label}</Text>
              {item.is_default && (
                <View style={styles.defaultPill}>
                  <Text style={styles.defaultPillText}>Default</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => openEdit(item)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={18} color={colors.gray[500]} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />
              </TouchableOpacity>
            </View>
            <Text style={styles.addrText}>
              {item.line1}{item.line2 ? `, ${item.line2}` : ''}, {item.city}, {item.state} - {item.pincode}
            </Text>
            {!!item.landmark && <Text style={styles.landmarkText}>Landmark: {item.landmark}</Text>}
            {!item.is_default && (
              <TouchableOpacity onPress={() => handleSetDefault(item)} style={{ marginTop: spacing.sm }}>
                <Text style={styles.setDefaultText}>Set as default</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <View style={styles.fabWrap}>
        <AppButton title="Add new address" leftIcon={<Ionicons name="add" size={18} color={colors.white} />} onPress={openAdd} fullWidth />
      </View>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <SafeAreaView style={styles.container}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit address' : 'Add new address'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.gray[700]} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: spacing.lg }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldGroupLabel}>Save as</Text>
              <View style={styles.labelRow}>
                {LABELS.map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.labelChip, form.label === l && styles.labelChipActive]}
                    onPress={() => setForm((f) => ({ ...f, label: l }))}
                  >
                    <Text style={[styles.labelChipText, form.label === l && styles.labelChipTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <AppInput
                label="House / Flat / Street"
                placeholder="e.g. 12B, Sunrise Apartments, MG Road"
                value={form.line1}
                onChangeText={(v) => setForm((f) => ({ ...f, line1: v }))}
                error={errors.line1}
                containerStyle={{ marginTop: spacing.lg }}
              />
              <AppInput
                label="Area / Locality (optional)"
                value={form.line2}
                onChangeText={(v) => setForm((f) => ({ ...f, line2: v }))}
              />
              <View style={styles.row2}>
                <AppInput
                  label="City"
                  value={form.city}
                  onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                  error={errors.city}
                  containerStyle={{ flex: 1, marginRight: spacing.sm }}
                />
                <AppInput
                  label="State"
                  value={form.state}
                  onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                  error={errors.state}
                  containerStyle={{ flex: 1 }}
                />
              </View>
              <AppInput
                label="Pincode"
                value={form.pincode}
                onChangeText={(v) => setForm((f) => ({ ...f, pincode: v.replace(/[^0-9]/g, '').slice(0, 6) }))}
                error={errors.pincode}
                keyboardType="number-pad"
              />
              <AppInput
                label="Landmark (optional)"
                value={form.landmark}
                onChangeText={(v) => setForm((f) => ({ ...f, landmark: v }))}
              />

              <AppButton
                title={editingId ? 'Save changes' : 'Save address'}
                onPress={handleSave}
                loading={saving}
                disabled={saving}
                fullWidth
                style={{ marginTop: spacing.xl }}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  labelIconWrap: {
    width: 28, height: 28, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center',
  },
  labelText: { ...typography.body1, fontFamily: fontFamily.semiBold, color: colors.gray[900], marginLeft: spacing.sm },
  defaultPill: { backgroundColor: colors.primary[50], borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2, marginLeft: spacing.sm },
  defaultPillText: { ...typography.caption, color: colors.primary[600], fontFamily: fontFamily.semiBold },
  iconBtn: { marginLeft: spacing.sm, flexShrink: 0 },
  addrText: { ...typography.body2, color: colors.gray[600], marginTop: spacing.sm },
  landmarkText: { ...typography.caption, color: colors.gray[400], marginTop: 2 },
  setDefaultText: { ...typography.caption, color: colors.primary[600], fontFamily: fontFamily.semiBold },
  fabWrap: {
    position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.gray[100],
  },
  modalTitle: { ...typography.h4, color: colors.gray[900] },
  fieldGroupLabel: { ...typography.caption, color: colors.gray[500], marginBottom: spacing.sm },
  labelRow: { flexDirection: 'row', gap: spacing.sm },
  labelChip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: 999,
    borderWidth: 1, borderColor: colors.gray[200],
  },
  labelChipActive: { backgroundColor: colors.primary[500], borderColor: colors.primary[500] },
  labelChipText: { ...typography.body2, color: colors.gray[700] },
  labelChipTextActive: { color: colors.white, fontFamily: fontFamily.semiBold },
  row2: { flexDirection: 'row' },
});

export default SavedAddressesScreen;
