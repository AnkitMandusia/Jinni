import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily, typography } from '@theme/typography';
import { borderRadius, shadows, spacing } from '@theme/spacing';
import { api } from '@services/api';
import { useAuthStore } from '@auth/store/authStore';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { logout } = useAuthStore();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [promoNotifications, setPromoNotifications] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request deletion', style: 'destructive', onPress: async () => {
            try {
              await api.post('/support/tickets', {
                category: 'account',
                subcategory: 'delete_account',
                reason: 'Account deletion request',
                description: 'User requested account deletion from Settings.',
              });
              Alert.alert('Request received', 'Our team will process your account deletion request and contact you to confirm.');
            } catch {
              Alert.alert('Could not submit request', 'Please try again, or contact support directly.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Push notifications</Text>
              <Text style={styles.rowSub}>Allow this app to send you notifications</Text>
            </View>
            <Switch value={pushEnabled} onValueChange={setPushEnabled} trackColor={{ false: colors.gray[200], true: colors.primary[400] }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Order updates</Text>
              <Text style={styles.rowSub}>Status changes for your orders</Text>
            </View>
            <Switch value={orderUpdates} onValueChange={setOrderUpdates} disabled={!pushEnabled} trackColor={{ false: colors.gray[200], true: colors.primary[400] }} />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Offers & promotions</Text>
              <Text style={styles.rowSub}>Deals, discounts and new features</Text>
            </View>
            <Switch value={promoNotifications} onValueChange={setPromoNotifications} disabled={!pushEnabled} trackColor={{ false: colors.gray[200], true: colors.primary[400] }} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>General</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Language', 'English (default). More languages coming soon.')}>
            <Text style={styles.rowLabel}>Language</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={styles.rowValue}>English</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
            </View>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}>
            <Text style={styles.rowLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Legal', { doc: 'terms' })}>
            <Text style={styles.rowLabel}>Terms & Conditions</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
            <Text style={[styles.rowLabel, { color: colors.error.DEFAULT }]}>Delete my account</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  sectionTitle: { ...typography.overline, color: colors.gray[500], marginBottom: spacing.sm, marginLeft: spacing.xs, marginTop: spacing.lg },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, ...shadows.sm },
  divider: { height: 1, backgroundColor: colors.gray[100] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  rowLabel: { ...typography.body1, color: colors.gray[900], fontFamily: fontFamily.medium },
  rowSub: { ...typography.caption, color: colors.gray[500], marginTop: 2 },
  rowValue: { ...typography.body2, color: colors.gray[500] },
});

export default SettingsScreen;
