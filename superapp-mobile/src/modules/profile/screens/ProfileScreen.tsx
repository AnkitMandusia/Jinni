import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily, typography } from '@theme/typography';
import { borderRadius, shadows, spacing } from '@theme/spacing';
import { useAuthStore } from '@auth/store/authStore';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
};

const MenuRow: React.FC<Row> = ({ icon, label, sub, onPress, danger }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.6}>
    <View style={[styles.menuIconWrap, danger && styles.menuIconWrapDanger]}>
      <Ionicons name={icon} size={18} color={danger ? colors.error.DEFAULT : colors.primary[600]} />
    </View>
    <View style={styles.menuTextWrap}>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      {!!sub && <Text style={styles.menuSub}>{sub}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={18} color={colors.gray[300]} />
  </TouchableOpacity>
);

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const initial = (user?.name?.[0] || user?.phone?.[0] || '?').toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.name} numberOfLines={1}>{user?.name || 'Add your name'}</Text>
            <Text style={styles.phone}>+91 {user?.phone}</Text>
            {!!user?.email && <Text style={styles.email} numberOfLines={1}>{user.email}</Text>}
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditProfile')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="create-outline" size={18} color={colors.primary[600]} />
          </TouchableOpacity>
        </View>

        {!user?.profile_complete && (
          <TouchableOpacity style={styles.completeBanner} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.8}>
            <Ionicons name="alert-circle" size={18} color={colors.warning.dark} />
            <Text style={styles.completeBannerText}>Your profile is incomplete. Tap to finish setting it up.</Text>
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <MenuRow icon="person-outline" label="Edit Profile" sub="Name, email" onPress={() => navigation.navigate('EditProfile')} />
            <View style={styles.divider} />
            <MenuRow icon="location-outline" label="Saved Addresses" sub="Home, work & more" onPress={() => navigation.navigate('SavedAddresses')} />
            <View style={styles.divider} />
            <MenuRow icon="card-outline" label="Payment Methods" sub="UPI, saved cards" onPress={() => Alert.alert('Coming soon', 'Saved payment methods are coming soon. You can still pay via UPI/COD at checkout.')} />
            <View style={styles.divider} />
            <MenuRow icon="receipt-outline" label="My Orders" onPress={() => navigation.getParent()?.navigate('Orders')} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.card}>
            <MenuRow icon="help-buoy-outline" label="Help & Support" sub="Report an issue, FAQs" onPress={() => navigation.navigate('HelpSupport')} />
            <View style={styles.divider} />
            <MenuRow icon="chatbubble-ellipses-outline" label="Report a Problem" onPress={() => navigation.navigate('HelpSupport', { openReport: true })} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences & Legal</Text>
          <View style={styles.card}>
            <MenuRow icon="settings-outline" label="Settings" sub="Notifications, language" onPress={() => navigation.navigate('Settings')} />
            <View style={styles.divider} />
            <MenuRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => navigation.navigate('Legal', { doc: 'privacy' })} />
            <View style={styles.divider} />
            <MenuRow icon="document-text-outline" label="Terms & Conditions" onPress={() => navigation.navigate('Legal', { doc: 'terms' })} />
            <View style={styles.divider} />
            <MenuRow icon="cash-outline" label="Refund Policy" onPress={() => navigation.navigate('Legal', { doc: 'refund' })} />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={colors.error.DEFAULT} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>App version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 26, color: colors.white, fontFamily: fontFamily.bold },
  headerTextWrap: { flex: 1, marginLeft: spacing.lg },
  name: { ...typography.h4, color: colors.gray[900] },
  phone: { ...typography.body2, color: colors.gray[500], marginTop: 2 },
  email: { ...typography.caption, color: colors.gray[400], marginTop: 2 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warning.light,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  completeBannerText: { ...typography.caption, color: colors.warning.dark, flex: 1 },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    ...typography.overline,
    color: colors.gray[500],
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  divider: { height: 1, backgroundColor: colors.gray[100] },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  menuIconWrap: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIconWrapDanger: { backgroundColor: colors.error.light },
  menuTextWrap: { flex: 1, marginLeft: spacing.md },
  menuLabel: { ...typography.body1, color: colors.gray[900], fontFamily: fontFamily.medium },
  menuLabelDanger: { color: colors.error.DEFAULT },
  menuSub: { ...typography.caption, color: colors.gray[500], marginTop: 1 },
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  logoutText: { ...typography.button, color: colors.error.DEFAULT },
  versionText: {
    ...typography.caption,
    color: colors.gray[300],
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});

export default ProfileScreen;
