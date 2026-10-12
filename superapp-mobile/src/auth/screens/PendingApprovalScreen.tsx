import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@components/AppButton';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { useAuthStore, UserRole } from '@auth/store/authStore';

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Customer',
  store: 'Store Owner',
  restaurant: 'Restaurant Owner',
  delivery: 'Delivery Agent',
  cab_driver: 'Cab Driver',
  salon: 'Salon Owner',
  admin: 'Admin',
};

const POLL_INTERVAL_MS = 30_000;

export const PendingApprovalScreen: React.FC = () => {
  const { user, checkStatus, logout } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const roleLabel = user?.role ? ROLE_LABELS[user.role] : 'Partner';

  const handleCheckStatus = async () => {
    setChecking(true);
    await checkStatus();
    setChecking(false);
  };

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      checkStatus();
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>⏳</Text>
        </View>

        <Text style={styles.title}>Approval Pending</Text>
        <Text style={styles.subtitle}>
          Your <Text style={styles.roleText}>{roleLabel}</Text> account is under review.
          Our team will verify your documents and approve your account soon.
        </Text>

        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>What happens next?</Text>

          <View style={styles.step}>
            <View style={[styles.stepDot, styles.stepDotDone]} />
            <Text style={styles.stepText}>Registration submitted</Text>
          </View>
          <View style={styles.step}>
            <View style={[styles.stepDot, styles.stepDotActive]} />
            <Text style={styles.stepText}>Admin review (1–2 business days)</Text>
          </View>
          <View style={styles.step}>
            <View style={[styles.stepDot, styles.stepDotPending]} />
            <Text style={styles.stepText}>Account activated — you can start using the app</Text>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            📲 You'll receive an SMS and push notification once your account is approved or if we need more information.
          </Text>
        </View>

        <AppButton
          title={checking ? 'Checking…' : 'Check Approval Status'}
          onPress={handleCheckStatus}
          disabled={checking}
          size="large"
          style={styles.checkBtn}
        />

        {checking && (
          <ActivityIndicator
            size="small"
            color={colors.primary[500]}
            style={styles.spinner}
          />
        )}

        <AppButton
          title="Logout"
          variant="ghost"
          onPress={logout}
          size="medium"
          style={styles.logoutBtn}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.warning.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  roleText: {
    color: colors.primary[500],
    fontWeight: '600',
  },
  stepsCard: {
    width: '100%',
    backgroundColor: colors.gray[50],
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  stepsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray[700],
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  stepDotDone: {
    backgroundColor: colors.success.DEFAULT,
  },
  stepDotActive: {
    backgroundColor: colors.warning.DEFAULT,
  },
  stepDotPending: {
    backgroundColor: colors.gray[300],
  },
  stepText: {
    fontSize: 13,
    color: colors.gray[600],
    flex: 1,
  },
  infoBox: {
    width: '100%',
    backgroundColor: colors.info.light,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xxl,
  },
  infoText: {
    fontSize: 13,
    color: colors.info.dark,
    lineHeight: 20,
  },
  checkBtn: {
    width: '100%',
    marginBottom: spacing.md,
  },
  spinner: {
    marginBottom: spacing.md,
  },
  logoutBtn: {
    width: '100%',
  },
});

export default PendingApprovalScreen;
