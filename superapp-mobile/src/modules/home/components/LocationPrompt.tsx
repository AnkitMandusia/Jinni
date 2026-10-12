import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';

interface LocationPromptProps {
  onPress: () => void;
}

/** Compact CTA shown when no pincode is set yet — gateway to all discovery. */
export const LocationPrompt: React.FC<LocationPromptProps> = ({ onPress }) => (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
    <View style={styles.iconWrap}>
      <Ionicons name="location" size={20} color={colors.primary[600]} />
    </View>
    <View style={styles.textCol}>
      <Text style={styles.title}>Set your location</Text>
      <Text style={styles.subtitle}>See food, groceries and local stores available near you</Text>
    </View>
    <View style={styles.cta}>
      <Text style={styles.ctaText}>Set</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.primary[700]} />
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[50],
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1 },
  title: { ...typography.h6, color: colors.gray[900] },
  subtitle: { ...typography.caption, color: colors.gray[600], marginTop: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ctaText: { ...typography.label, color: colors.primary[700] },
});

export default LocationPrompt;
