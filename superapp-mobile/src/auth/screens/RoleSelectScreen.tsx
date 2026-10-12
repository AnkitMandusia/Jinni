import React from 'react';
import { ScrollView, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { UserRole } from '@auth/store/authStore';
import { AuthStackParamList } from '@navigation/stacks/AuthStack';

type RoleSelectNavProp = NativeStackNavigationProp<AuthStackParamList, 'RoleSelect'>;

interface RoleOption {
  role: UserRole;
  label: string;
  description: string;
  icon: string;
  badge: 'MVP' | 'Phase 2' | 'Phase 3';
  enabled: boolean;
}

const ROLES: RoleOption[] = [
  {
    role: 'customer',
    label: 'Customer',
    description: 'Order food, groceries, cabs and salon services',
    icon: '🛒',
    badge: 'MVP',
    enabled: true,
  },
  {
    role: 'store',
    label: 'Store / Grocery',
    description: 'List your store, manage orders and inventory',
    icon: '🏪',
    badge: 'MVP',
    enabled: true,
  },
  {
    role: 'restaurant',
    label: 'Restaurant',
    description: 'Manage your restaurant menu and food orders',
    icon: '🍽️',
    badge: 'MVP',
    enabled: true,
  },
  {
    role: 'delivery',
    label: 'Delivery Agent',
    description: 'Deliver orders and earn per delivery',
    icon: '🚴',
    badge: 'MVP',
    enabled: true,
  },
  {
    role: 'cab_driver',
    label: 'Cab Driver',
    description: 'Accept ride requests in your area',
    icon: '🚗',
    badge: 'Phase 2',
    enabled: false,
  },
  {
    role: 'salon',
    label: 'Salon / Barber',
    description: 'Manage salon bookings and services',
    icon: '✂️',
    badge: 'Phase 3',
    enabled: false,
  },
];

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  MVP: { bg: colors.success.light, text: colors.success.dark },
  'Phase 2': { bg: colors.warning.light, text: colors.warning.dark },
  'Phase 3': { bg: colors.secondary[50], text: colors.secondary[700] },
};

export const RoleSelectScreen: React.FC = () => {
  const navigation = useNavigation<RoleSelectNavProp>();

  const handleRoleSelect = (role: UserRole) => {
    navigation.navigate('SignupForm', { role });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Who are you?</Text>
          <Text style={styles.subtitle}>Select your role to get started</Text>
        </View>

        <View style={styles.grid}>
          {ROLES.map((item) => {
            const badgeColors = BADGE_COLORS[item.badge];
            return (
              <TouchableOpacity
                key={item.role}
                style={[
                  styles.card,
                  !item.enabled && styles.cardDisabled,
                ]}
                onPress={() => item.enabled && handleRoleSelect(item.role)}
                activeOpacity={item.enabled ? 0.7 : 1}
              >
                {!item.enabled && <View style={styles.disabledOverlay} />}
                <Text style={styles.cardIcon}>{item.icon}</Text>
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardLabel}>{item.label}</Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: badgeColors.bg },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: badgeColors.text }]}>
                        {item.badge}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardDescription}>{item.description}</Text>
                  {!item.enabled && (
                    <Text style={styles.comingSoon}>Coming Soon</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxxl,
  },
  header: {
    marginBottom: spacing.xxl,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray[500],
  },
  grid: {
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 16,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  cardDisabled: {
    borderColor: colors.gray[100],
    backgroundColor: colors.gray[50],
  },
  disabledOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.5)',
    zIndex: 1,
  },
  cardIcon: {
    fontSize: 32,
    marginRight: spacing.md,
    marginTop: 2,
  },
  cardBody: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray[900],
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardDescription: {
    fontSize: 13,
    color: colors.gray[500],
    lineHeight: 19,
  },
  comingSoon: {
    fontSize: 12,
    color: colors.gray[400],
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});

export default RoleSelectScreen;
