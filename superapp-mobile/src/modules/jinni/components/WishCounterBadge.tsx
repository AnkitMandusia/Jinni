import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';

interface WishCounterBadgeProps {
  used: number;
  limit: number;
  exhausted?: boolean;
}

/**
 * Small "3/3" / "x/3" indicator shown on the exhausted lamp state
 * (spec section 4.2) — no glow, calm, informational only.
 */
export const WishCounterBadge: React.FC<WishCounterBadgeProps> = ({ used, limit, exhausted }) => (
  <View style={[styles.badge, exhausted && styles.badgeExhausted]}>
    <Text style={[styles.text, exhausted && styles.textExhausted]}>
      {used}/{limit}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 22,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: jinniColors.purple[700],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: jinniColors.cream,
  },
  badgeExhausted: {
    backgroundColor: '#9A958C',
  },
  text: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: fontFamily.bold,
    color: jinniColors.cream,
  },
  textExhausted: {
    color: '#FFFFFF',
  },
});

export default WishCounterBadge;
