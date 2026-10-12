import React, { useState } from 'react';
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
import { AuthStackParamList } from '@navigation/stacks/AuthStack';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { AppInput } from '@components/AppInput';
import { useAuthStore } from '@auth/store/authStore';
import { JinniLogo } from '@modules/jinni/components/JinniLogo';
type LoginNavProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginNavProp>();
  const { loginWithPassword, error, clearError, isLoading } = useAuthStore();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleLogin = async () => {
    clearError();
    setLocalError('');
    if (!identifier.trim()) { setLocalError('Enter your phone number or email'); return; }
    if (!password) { setLocalError('Enter your password'); return; }
    await loginWithPassword(identifier.trim(), password);
    // On success RootNavigator switches automatically via auth state
  };

  const displayError = error || localError;

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
          {/* Header */}
          <View style={styles.header}>
            <JinniLogo variant="header" showTagline />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          {/* Error */}
          {displayError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          ) : null}

          {/* Login form */}
          <View style={styles.form}>
            <AppInput
              label="Phone Number or Email"
              placeholder="e.g. 9876543210 or you@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={identifier}
              onChangeText={setIdentifier}
            />
            <AppInput
              label="Password"
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              }
            />
            <AppButton
              title="Login"
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              size="large"
            />
          </View>

          {/* Sign up link */}
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => { clearError(); navigation.navigate('PhoneEntry'); }}>
              <Text style={styles.signupLink}>Create Account</Text>
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
  header: { marginTop: spacing.xxxl, marginBottom: spacing.xxl },
  appName: { fontSize: 13, fontWeight: '700', color: colors.primary[500], letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: colors.gray[900], marginBottom: spacing.xs },
  subtitle: { fontSize: 15, color: colors.gray[500] },
  errorBox: {
    backgroundColor: colors.error.light,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { fontSize: 13, color: colors.error.dark },
  form: { gap: spacing.sm, marginBottom: spacing.xl },
  eyeIcon: { fontSize: 18, paddingHorizontal: 4 },
  signupRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xl },
  signupText: { fontSize: 14, color: colors.gray[500] },
  signupLink: { fontSize: 14, color: colors.primary[600], fontWeight: '700' },
  footer: { marginTop: 'auto', paddingTop: spacing.xl, alignItems: 'center' },
  termsText: { fontSize: 12, color: colors.gray[400], textAlign: 'center' },
  termsLink: { color: colors.primary[500], fontWeight: '600' },
});

export default LoginScreen;
