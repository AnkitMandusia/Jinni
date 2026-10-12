import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { typography, fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { useAuthStore } from '@auth/store/authStore';
import { adminService, AdminStats } from '@services/admin.service';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  onPress?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color, bg, onPress }) => (
  <TouchableOpacity
    style={styles.statCard}
    onPress={onPress}
    activeOpacity={onPress ? 0.75 : 1}
    disabled={!onPress}
  >
    <View style={[styles.statIconWrap, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    {onPress && <Ionicons name="chevron-forward" size={14} color={colors.gray[300]} style={styles.statChevron} />}
  </TouchableOpacity>
);

const QuickAction: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
  onPress: () => void;
}> = ({ icon, label, badge, onPress }) => (
  <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.actionIconWrap}>
      <Ionicons name={icon} size={22} color={colors.primary[600]} />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
    {!!badge && badge > 0 && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
      </View>
    )}
  </TouchableOpacity>
);

export const AdminDashboardScreen: React.FC = () => {
  const navigation = useNavigation();
  const { user, logout } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setError(null);
      const data = await adminService.getStats();
      setStats(data);
    } catch {
      setError('Failed to load stats. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ADMIN CONSOLE</Text>
            <Text style={styles.name}>Welcome, {user?.name ?? 'Admin'}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={14} color={colors.error.dark} />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error.dark} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Stats */}
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary[500]} style={styles.loader} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.statsGrid}>
              <StatCard
                label="Pending approvals"
                value={stats?.pending_approvals ?? 0}
                icon="time-outline"
                color={colors.warning.dark}
                bg={colors.warning.light}
                onPress={() => navigation.navigate('Users' as never)}
              />
              <StatCard
                label="Total users"
                value={stats?.total_users ?? 0}
                icon="people-outline"
                color={colors.primary[700]}
                bg={colors.primary[50]}
              />
              <StatCard
                label="Active partners"
                value={stats?.active_partners ?? 0}
                icon="checkmark-done-outline"
                color={colors.success.dark}
                bg={colors.success.light}
              />
              <StatCard
                label="Suspended"
                value={stats?.suspended_users ?? 0}
                icon="ban-outline"
                color={colors.error.DEFAULT}
                bg={colors.error.light}
              />
              <StatCard
                label="Stores"
                value={stats?.stores ?? 0}
                icon="storefront-outline"
                color={colors.secondary[700]}
                bg={colors.secondary[50]}
              />
              <StatCard
                label="Restaurants"
                value={stats?.restaurants ?? 0}
                icon="restaurant-outline"
                color={colors.info.dark}
                bg={colors.info.light}
                onPress={() => navigation.navigate('AdminOrders' as never)}
              />
            </View>

            {/* Quick Actions */}
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <View style={styles.actionsGrid}>
              <QuickAction
                icon="checkmark-circle-outline"
                label="Review partners"
                badge={stats?.pending_approvals ?? 0}
                onPress={() => navigation.navigate('Users' as never)}
              />
              <QuickAction
                icon="receipt-outline"
                label="View orders"
                onPress={() => navigation.navigate('AdminOrders' as never)}
              />
              <QuickAction icon="refresh-outline" label="Refresh stats" onPress={onRefresh} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xxl,
  },
  eyebrow: {
    ...typography.overline,
    color: colors.primary[600],
  },
  name: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: 4,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.error.light,
    borderRadius: borderRadius.sm,
  },
  logoutText: {
    ...typography.label,
    color: colors.error.dark,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.body2,
    color: colors.error.dark,
    flex: 1,
  },
  loader: {
    marginTop: spacing.xxxxl,
  },
  sectionTitle: {
    ...typography.overline,
    color: colors.text.muted,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  statCard: {
    width: '47%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: colors.gray[100],
    position: 'relative',
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  statValue: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: 2,
  },
  statLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    fontFamily: fontFamily.medium,
  },
  statChevron: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.gray[100],
    position: 'relative',
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    fontFamily: fontFamily.semiBold,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.error.DEFAULT,
    borderRadius: borderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.white,
    fontFamily: fontFamily.bold,
  },
});

export default AdminDashboardScreen;
