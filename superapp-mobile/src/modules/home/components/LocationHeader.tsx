import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { JinniLogo } from '@modules/jinni/components/JinniLogo';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';

interface LocationHeaderProps {
  /** 'loading' while we don't yet know if a location is set (first paint). */
  state: 'loading' | 'set' | 'unset';
  city?: string;
  pincode?: string;
  notificationCount?: number;
  onChangeLocation: () => void;
  onNotifications: () => void;
  onProfile: () => void;
}

/**
 * Delivery-context header. Deliberately dumb about *how* location is
 * resolved (GPS vs manual pincode) — that lives in locationStore / a future
 * useLocation() — this just renders the three states cleanly.
 */
export const LocationHeader: React.FC<LocationHeaderProps> = ({
  state,
  city,
  pincode,
  notificationCount = 0,
  onChangeLocation,
  onNotifications,
  onProfile,
}) => {
  return (
    <View style={styles.headerBlock}>
      <View style={styles.brandRow}>
        <JinniLogo variant="header" />
      </View>
      <View style={styles.row}>
      <TouchableOpacity
        style={styles.locationTap}
        onPress={onChangeLocation}
        accessibilityRole="button"
        accessibilityLabel={
          state === 'set' ? `Delivering to ${city}, ${pincode}. Change location` : 'Set delivery location'
        }
        activeOpacity={0.7}
      >
        <Text style={styles.eyebrow}>DELIVERING TO</Text>
        <View style={styles.valueRow}>
          {state === 'loading' ? (
            <Text style={styles.value} numberOfLines={1}>Finding your area…</Text>
          ) : state === 'set' ? (
            <Text style={styles.value} numberOfLines={1}>
              {city ? `${city} · ` : ''}{pincode}
            </Text>
          ) : (
            <Text style={[styles.value, styles.valueMuted]} numberOfLines={1}>Set your location</Text>
          )}
          <Ionicons name="chevron-down" size={14} color={colors.gray[500]} style={styles.chevron} />
        </View>
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onNotifications}
          accessibilityRole="button"
          accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} new` : 'Notifications'}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.gray[800]} />
          {notificationCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onProfile}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          <Ionicons name="person-circle-outline" size={24} color={colors.gray[800]} />
        </TouchableOpacity>
      </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerBlock: {
    paddingTop: spacing.sm,
  },
  brandRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  locationTap: { flex: 1, paddingRight: spacing.md },
  eyebrow: {
    ...typography.overline,
    color: colors.gray[400],
    marginBottom: 2,
  },
  valueRow: { flexDirection: 'row', alignItems: 'center' },
  value: { ...typography.h5, color: colors.gray[900], flexShrink: 1 },
  valueMuted: { color: colors.gray[500] },
  chevron: { marginLeft: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[50],
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error.DEFAULT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: colors.white, fontSize: 9, fontWeight: '700' },
});

export default LocationHeader;
