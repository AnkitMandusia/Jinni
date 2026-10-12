import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';

interface HomeSearchBarProps {
  placeholder?: string;
  onPress: () => void;
}

/**
 * Entry point into unified search. Deliberately a button (not a live
 * TextInput) on Home — typing happens on the dedicated Search screen, this
 * just advertises the gateway: "search food, groceries, stores, rides…".
 */
export const HomeSearchBar: React.FC<HomeSearchBarProps> = ({
  placeholder = 'Search food, groceries, stores, rides…',
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={styles.bar}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="search"
      accessibilityLabel="Search Nearbuy"
    >
      <Ionicons name="search" size={18} color={colors.gray[400]} />
      <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
      <View style={styles.voiceDot} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    height: 52,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  placeholder: { ...typography.body1, color: colors.gray[500], flex: 1 },
  voiceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary[300] },
});

export default HomeSearchBar;
