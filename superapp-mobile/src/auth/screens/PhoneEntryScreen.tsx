import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { AuthStackParamList } from '@navigation/stacks/AuthStack';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { AppInput } from '@components/AppInput';
import { useAuthStore } from '@auth/store/authStore';
import { sendFirebaseOTP } from '@services/firebaseAuth.service';
import { FIREBASE_CONFIG } from '@services/firebase.config';

type PhoneEntryNavProp = NativeStackNavigationProp<AuthStackParamList, 'PhoneEntry'>;

export const PhoneEntryScreen: React.FC = () => {
  const navigation = useNavigation<PhoneEntryNavProp>();
  const { clearError } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  const [phone, setPhone] = useState('');
  const [localError, setLocalError] = useState('');
  const [sending, setSending] = useState(false);

  const validatePhone = (n: string) => /^[6-9]\d{9}$/.test(n.replace(/\s/g, ''));

  const handleSendOTP = async () => {
    clearError();
    setLocalError('');
    const clean = phone.replace(/\s/g, '');
    if (!clean) { setLocalError('Please enter your phone number'); return; }
    if (!validatePhone(clean)) { setLocalError('Enter a valid 10-digit Indian mobile number'); return; }

    setSending(true);
    try {
      await sendFirebaseOTP(clean, recaptchaRef.current);
      navigation.navigate('OTPVerify', { phone: clean });
    } catch (e: any) {
      setLocalError(e?.message ?? 'Failed to send OTP. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const displayError = localError;

  return (
    <SafeAreaView style={styles.container}>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaRef}
        firebaseConfig={FIREBASE_CONFIG}
        attemptInvisibleVerification={true}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back to Login</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Enter your mobile number to get started.{'\n'}
              We'll send you a verification code.
            </Text>
          </View>

          {/* Error */}
          {displayError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          ) : null}

          {/* Phone input */}
          <View style={styles.form}>
            <AppInput
              label="Phone Number"
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              maxLength={10}
              value={phone}
              onChangeText={setPhone}
            />
            <Text style={styles.hint}>🇮🇳 +91 prefix will be added automatically</Text>

            <AppButton
              title="Send Verification Code"
              onPress={handleSendOTP}
              loading={sending}
              disabled={sending}
              size="large"
            />
          </View>

          {/* Login link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => { clearError(); navigation.navigate('Login'); }}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.termsText}>
              By continuing you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.xl, paddingBottom: spacing.xxxxl },
  backBtn: { marginBottom: spacing.lg },
  backText: { fontSize: 15, color: colors.primary[500], fontWeight: '600' },
  header: { marginBottom: spacing.xxl },
  title: { fontSize: 28, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.sm },
  subtitle: { fontSize: 15, color: colors.gray[500], lineHeight: 22 },
  errorBox: {
    backgroundColor: colors.error.light,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { fontSize: 13, color: colors.error.dark },
  form: { gap: spacing.sm, marginBottom: spacing.xl },
  hint: { fontSize: 12, color: colors.gray[400], marginTop: -spacing.xs },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xl },
  loginText: { fontSize: 14, color: colors.gray[500] },
  loginLink: { fontSize: 14, color: colors.primary[600], fontWeight: '700' },
  footer: { marginTop: 'auto', paddingTop: spacing.xl, alignItems: 'center' },
  termsText: { fontSize: 12, color: colors.gray[400], textAlign: 'center' },
  termsLink: { color: colors.primary[500], fontWeight: '600' },
});

export default PhoneEntryScreen;
