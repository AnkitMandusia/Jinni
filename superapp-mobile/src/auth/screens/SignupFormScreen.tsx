import React, { useState } from 'react';
import {
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@components/AppButton';
import { AppInput } from '@components/AppInput';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { useAuthStore, UserRole } from '@auth/store/authStore';
import { AuthStackParamList } from '@navigation/stacks/AuthStack';

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
  required: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}

const PASSWORD_FIELDS: FieldConfig[] = [
  { key: 'password', label: 'Set Password', placeholder: 'Min 8 characters', required: true, secureTextEntry: true, autoCapitalize: 'none' },
  { key: 'confirm_password', label: 'Confirm Password', placeholder: 'Re-enter your password', required: true, secureTextEntry: true, autoCapitalize: 'none' },
];

const ROLE_FIELDS: Record<UserRole, FieldConfig[]> = {
  customer: [
    { key: 'first_name', label: 'First Name', placeholder: 'Enter first name', required: true, autoCapitalize: 'words' },
    { key: 'last_name', label: 'Last Name', placeholder: 'Enter last name', required: true, autoCapitalize: 'words' },
    { key: 'email', label: 'Email (Optional)', placeholder: 'Enter email address', keyboardType: 'email-address', required: false, autoCapitalize: 'none' },
    // address removed — collected at checkout per order
  ],
  store: [
    { key: 'owner_name', label: 'Owner Name', placeholder: 'Enter owner full name', required: true, autoCapitalize: 'words' },
    { key: 'store_name', label: 'Store Name', placeholder: 'Enter store name', required: true, autoCapitalize: 'words' },
    { key: 'gstin', label: 'GSTIN (Optional)', placeholder: 'Enter GST number', required: false, autoCapitalize: 'characters' },
    { key: 'fssai', label: 'FSSAI License (Optional)', placeholder: 'Enter FSSAI number', required: false },
    { key: 'address', label: 'Store Address', placeholder: 'Enter store address', required: true },
    { key: 'bank_account', label: 'Bank Account No.', placeholder: 'Enter account number', keyboardType: 'numeric', required: true },
    { key: 'bank_ifsc', label: 'IFSC Code', placeholder: 'Enter IFSC code', required: true, autoCapitalize: 'characters' },
  ],
  restaurant: [
    { key: 'owner_name', label: 'Owner Name', placeholder: 'Enter owner full name', required: true, autoCapitalize: 'words' },
    { key: 'restaurant_name', label: 'Restaurant Name', placeholder: 'Enter restaurant name', required: true, autoCapitalize: 'words' },
    { key: 'gstin', label: 'GSTIN (Optional)', placeholder: 'Enter GST number', required: false, autoCapitalize: 'characters' },
    { key: 'fssai', label: 'FSSAI License', placeholder: 'Enter FSSAI number', required: true },
    { key: 'cuisine_type', label: 'Cuisine Type', placeholder: 'e.g. Indian, Chinese, Fast Food', required: true, autoCapitalize: 'words' },
    { key: 'address', label: 'Restaurant Address', placeholder: 'Enter restaurant address', required: true },
    { key: 'bank_ifsc', label: 'IFSC Code', placeholder: 'Enter IFSC code', required: true, autoCapitalize: 'characters' },
  ],
  delivery: [
    { key: 'name', label: 'Full Name', placeholder: 'Enter your full name', required: true, autoCapitalize: 'words' },
    { key: 'vehicle_type', label: 'Vehicle Type', placeholder: 'e.g. Bike, Scooter, Cycle', required: true, autoCapitalize: 'words' },
    { key: 'license_no', label: 'Driving License No.', placeholder: 'Enter license number', required: true, autoCapitalize: 'characters' },
    { key: 'aadhaar', label: 'Aadhaar Number', placeholder: 'Enter 12-digit Aadhaar number', keyboardType: 'numeric', required: true },
    { key: 'bank_account', label: 'Bank Account No.', placeholder: 'Enter account number', keyboardType: 'numeric', required: true },
    { key: 'bank_ifsc', label: 'IFSC Code', placeholder: 'Enter IFSC code', required: true, autoCapitalize: 'characters' },
  ],
  cab_driver: [
    { key: 'name', label: 'Full Name', placeholder: 'Enter your full name', required: true, autoCapitalize: 'words' },
    { key: 'license_no', label: 'Driving License No.', placeholder: 'Enter license number', required: true, autoCapitalize: 'characters' },
    { key: 'vehicle_rc', label: 'Vehicle RC Number', placeholder: 'Enter RC number', required: true, autoCapitalize: 'characters' },
    { key: 'insurance_no', label: 'Insurance Number', placeholder: 'Enter insurance number', required: true },
    { key: 'aadhaar', label: 'Aadhaar Number', placeholder: 'Enter 12-digit Aadhaar number', keyboardType: 'numeric', required: true },
  ],
  salon: [
    { key: 'owner_name', label: 'Owner Name', placeholder: 'Enter owner name', required: true, autoCapitalize: 'words' },
    { key: 'shop_name', label: 'Shop Name', placeholder: 'Enter shop name', required: true, autoCapitalize: 'words' },
    { key: 'address', label: 'Shop Address', placeholder: 'Enter shop address', required: true },
    { key: 'bank_ifsc', label: 'IFSC Code', placeholder: 'Enter IFSC code', required: true, autoCapitalize: 'characters' },
  ],
  admin: [],
};

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Customer',
  store: 'Store Owner',
  restaurant: 'Restaurant Owner',
  delivery: 'Delivery Agent',
  cab_driver: 'Cab Driver',
  salon: 'Salon Owner',
  admin: 'Admin',
};

export const SignupFormScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<AuthStackParamList, 'SignupForm'>>();
  const { role } = route.params;

  const { completeProfile, error, clearError, isLoading, accessToken } = useAuthStore();
  const allFields = [...ROLE_FIELDS[role] ?? [], ...PASSWORD_FIELDS];

  const [formData, setFormData] = useState<Record<string, string>>(
    Object.fromEntries(allFields.map((f) => [f.key, '']))
  );
  const [showSecure, setShowSecure] = useState<Record<string, boolean>>({});
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    allFields.forEach((field) => {
      if (field.required && !formData[field.key]?.trim()) {
        errors[field.key] = `${field.label.replace(' (Optional)', '')} is required`;
      }
    });
    if (formData.password && formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirm_password) {
      errors.confirm_password = 'Passwords do not match';
    }
    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    clearError();

    // Guard: if no token, the OTP session was lost — send back to phone entry
    if (!accessToken) {
      Alert.alert(
        'Session Expired',
        'Your verification session has expired. Please verify your phone number again.',
        [{ text: 'OK', onPress: () => navigation.navigate('PhoneEntry' as never) }]
      );
      return;
    }

    if (!validate()) return;

    // strip confirm_password before sending to API
    const { confirm_password, ...payload } = formData;
    const success = await completeProfile(role, payload);
    if (success) {
      // RootNavigator will automatically switch view based on user.status
      // customer → MainNavigator, store/restaurant/delivery → PendingApproval
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>{ROLE_LABELS[role]} Details</Text>
            <Text style={styles.subtitle}>
              Fill in your details to complete registration
            </Text>
          </View>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          {allFields.map((field) => (
            <AppInput
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              value={formData[field.key]}
              onChangeText={(text) => {
                setFormData((prev) => ({ ...prev, [field.key]: text }));
                if (localErrors[field.key]) {
                  setLocalErrors((prev) => ({ ...prev, [field.key]: '' }));
                }
              }}
              keyboardType={field.keyboardType ?? 'default'}
              autoCapitalize={field.autoCapitalize ?? 'sentences'}
              secureTextEntry={field.secureTextEntry && !showSecure[field.key]}
              error={localErrors[field.key]}
              rightIcon={
                field.secureTextEntry ? (
                  <TouchableOpacity
                    onPress={() =>
                      setShowSecure((prev) => ({ ...prev, [field.key]: !prev[field.key] }))
                    }
                  >
                    <Text style={{ fontSize: 18 }}>
                      {showSecure[field.key] ? '🙈' : '👁️'}
                    </Text>
                  </TouchableOpacity>
                ) : undefined
              }
            />
          ))}

          {(role === 'store' || role === 'restaurant' || role === 'delivery') && (
            <View style={styles.approvalNote}>
              <Text style={styles.approvalNoteText}>
                ℹ️  Your account will require admin approval before you can start using the app.
                You'll be notified once approved.
              </Text>
            </View>
          )}

          <AppButton
            title="Complete Registration"
            onPress={handleSubmit}
            loading={isLoading}
            disabled={isLoading}
            size="large"
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxxl,
  },
  backBtn: {
    marginBottom: spacing.lg,
  },
  backText: {
    fontSize: 16,
    color: colors.primary[500],
    fontWeight: '600',
  },
  header: {
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    color: colors.gray[500],
  },
  errorBanner: {
    backgroundColor: colors.error.light,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: {
    fontSize: 13,
    color: colors.error.dark,
    lineHeight: 19,
  },
  approvalNote: {
    backgroundColor: colors.info.light,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  approvalNoteText: {
    fontSize: 13,
    color: colors.info.dark,
    lineHeight: 19,
  },
  submitBtn: {
    marginTop: spacing.md,
  },
});

export default SignupFormScreen;
