import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { JinniWordmark } from './JinniWordmark';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';

export type JinniLogoVariant = 'header' | 'hero' | 'inline' | 'splash';

interface JinniLogoProps {
  variant?: JinniLogoVariant;
  showTagline?: boolean;
  tagline?: string;
  /** Prefer image logo when available (splash_lamp_glow) */
  useImageLamp?: boolean;
}

/**
 * Central Jinni brand mark — import this everywhere (Home, Splash, Auth).
 * Wordmark uses loaded Inter fonts; lamp is code SVG or optional splash PNG.
 */
export const JinniLogo: React.FC<JinniLogoProps> = ({
  variant = 'header',
  showTagline = false,
  tagline = 'Har Zaroorat, Ek Jinn Se.',
  useImageLamp = false,
}) => {
  const isHero = variant === 'hero' || variant === 'splash';
  const isInline = variant === 'inline';
  const isSplash = variant === 'splash';

  // Official logo badge replaces the old lamp icon + text wordmark everywhere.
  const logoWidth = isSplash ? 260 : isHero ? 220 : isInline ? 84 : 118;
  void useImageLamp; // kept for API compatibility with existing callers

  return (
    <View style={[styles.row, isHero && styles.heroCol, !isHero && showTagline && styles.stackLeft]}>
      <JinniWordmark width={logoWidth} />
      {showTagline && (
        <Text style={[styles.tagline, isHero && styles.taglineHero]}>{tagline}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stackLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  heroCol: {
    flexDirection: 'column',
    gap: 14,
  },
  textWrap: {
    justifyContent: 'center',
  },
  heroTextWrap: {
    alignItems: 'center',
  },
  wordmark: {
    fontSize: 24,
    fontFamily: fontFamily.bold,
    color: jinniColors.purple[700],
    letterSpacing: 1.5,
    textShadowColor: 'rgba(198, 143, 47, 0.16)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  wordmarkHero: {
    fontSize: 44,
    color: jinniColors.gold[500],
    letterSpacing: 2,
  },
  wordmarkSplash: {
    fontSize: 48,
    color: jinniColors.gold[500],
    letterSpacing: 2.5,
  },
  wordmarkInline: {
    fontSize: 16,
    letterSpacing: 0.8,
  },
  tagline: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: jinniColors.purple[400],
    marginTop: 2,
    letterSpacing: 0.4,
  },
  taglineHero: {
    fontSize: 14,
    color: jinniColors.gold[600],
    marginTop: 6,
    letterSpacing: 0.6,
  },
});

export default JinniLogo;
