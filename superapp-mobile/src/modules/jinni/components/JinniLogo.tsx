import React from 'react';
import { View, Text, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import { MagicLampIcon } from './MagicLampIcon';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { jinniAssets } from '@theme/jinniAssets';

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

  const lampSize = isSplash ? 78 : isHero ? 58 : isInline ? 24 : 34;

  return (
    <View style={[styles.row, isHero && styles.heroCol]}>
      {useImageLamp && isSplash ? (
        <Image
          source={jinniAssets.splashLampGlow as ImageSourcePropType}
          style={{ width: lampSize, height: lampSize }}
          resizeMode="contain"
        />
      ) : (
        <MagicLampIcon size={lampSize} animated={isHero || variant === 'header'} />
      )}
      <View style={isHero ? styles.heroTextWrap : styles.textWrap}>
        <Text
          style={[
            styles.wordmark,
            isHero && styles.wordmarkHero,
            isInline && styles.wordmarkInline,
            isSplash && styles.wordmarkSplash,
          ]}
        >
          Jinni
        </Text>
        {showTagline && (
          <Text style={[styles.tagline, isHero && styles.taglineHero]}>{tagline}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
