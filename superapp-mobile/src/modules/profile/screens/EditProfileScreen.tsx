import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AppInput } from '@components/AppInput';
import { AppButton } from '@components/AppButton';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing } from '@theme/spacing';
import { useAuthStore } from '@auth/store/authStore';
import { api } from '@services/api';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, updateUser } = useAuthStore();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const next: { name?: string; email?: string } = {};
    if (!name.trim() || name.trim().length < 2) {
      next.name = 'Enter a name with at least 2 characters.';
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = { name: name.trim() };
      if (email.trim()) payload.email = email.trim();
      const updated: any = await api.patch('/auth/me', payload);
      updateUser({ name: updated.name, email: updated.email, profile_complete: updated.profile_complete });
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      let msg = 'Could not update profile. Please try again.';
      if (typeof detail === 'string') msg = detail;
      else if (Array.isArray(detail)) msg = detail.map((d: any) => d.msg || d).join('\n');
      Alert.alert('Update failed', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.readonlyRow}>
            <Ionicons name="call-outline" size={16} color={colors.gray[500]} />
            <Text style={styles.readonlyText}>+91 {user?.phone}</Text>
            <View style={styles.verifiedPill}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success.DEFAULT} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
          </View>
          <Text style={styles.readonlyHint}>Your mobile number can't be changed here. Contact support if you need to update it.</Text>

          <AppInput
            label="Full name"
            placeholder="Enter your full name"
            value={name}
            onChangeText={(v) => { setName(v); if (errors.name) setErrors((e) => ({ ...e, name: undefined })); }}
            error={errors.name}
            autoCapitalize="words"
            containerStyle={{ marginTop: spacing.xl }}
          />

          <AppInput
            label="Email (optional)"
            placeholder="you@example.com"
            value={email}
            onChangeText={(v) => { setEmail(v); if (errors.email) setErrors((e) => ({ ...e, email: undefined })); }}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <AppButton
            title="Save changes"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            fullWidth
            style={{ marginTop: spacing.xl }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg },
  readonlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gray[50],
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  readonlyText: { ...typography.body1, color: colors.gray[700], flex: 1 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.success.light,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
  },
  verifiedText: { ...typography.caption, color: colors.success.dark },
  readonlyHint: { ...typography.caption, color: colors.gray[400], marginTop: spacing.xs, marginLeft: spacing.xs },
});

export default EditProfileScreen;
