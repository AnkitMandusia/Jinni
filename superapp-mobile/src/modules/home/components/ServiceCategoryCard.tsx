import React from 'react';
import { View, Text, Image, ImageSourcePropType, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';

export interface ServiceCategoryConfig {
  id: string;
  title: string;
  subtitle: string;
  tint: string;
  /** A real bundled photo (richer treatment) — mutually exclusive with `icon`. */
  image?: ImageSourcePropType;
  /** Vector-icon fallback for categories with no asset yet. */
  icon?: keyof typeof Ionicons.glyphMap;
  comingSoon?: boolean;
  onPress?: () => void;
}

/**
 * "Explore services" grid card. Categories with a real photo asset
 * (Food/Mart/Rides/Local Stores) read visually richer than icon-only ones
 * (Salon/Services), which is the intended hierarchy per the asset set.
 */
export const ServiceCategoryCard: React.FC<ServiceCategoryConfig> = ({
  title,
  subtitle,
  tint,
  image,
  icon,
  comingSoon,
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={[styles.card, comingSoon && styles.cardDisabled]}
      onPress={comingSoon ? undefined : onPress}
      disabled={comingSoon}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={comingSoon ? `${title}, coming soon` : title}
      accessibilityState={{ disabled: !!comingSoon }}
    >
      <View style={[styles.media, { backgroundColor: tint }]}>
        {image ? (
          <Image source={image} style={styles.image} resizeMode="cover" />
        ) : icon ? (
          <Ionicons name={icon} size={26} color={colors.gray[700]} />
        ) : null}
      </View>
      <View style={styles.textRow}>
        <View style={styles.titleCol}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {comingSoon ? 'Coming soon' : subtitle}
          </Text>
        </View>
        {!comingSoon && (
          <Ionicons name="chevron-forward" size={16} color={colors.gray[400]} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const CARD_WIDTH = '47%';

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.gray[200],
    overflow: 'hidden',
  },
  cardDisabled: { opacity: 0.55 },
  media: {
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  titleCol: { flexShrink: 1 },
  title: { ...typography.h6, color: colors.gray[900] },
  subtitle: { ...typography.caption, color: colors.gray[500], marginTop: 1 },
});

export default ServiceCategoryCard;
