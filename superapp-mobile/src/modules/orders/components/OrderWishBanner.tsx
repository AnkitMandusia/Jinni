import React from 'react';
import { View, Text, StyleSheet, Pressable, ImageBackground, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { MagicLampIcon } from '@modules/jinni/components/MagicLampIcon';
import { jinniAssets } from '@theme/jinniAssets';
import { useJinniSession } from '@modules/jinni/hooks/useJinniSession';

interface OrderWishBannerProps {
  compact?: boolean;
}

/**
 * "Your Wish is on the Way!" — poster screen 9.
 * Uses order_wish_banner_bg.png + chirag_success when present.
 */
export const OrderWishBanner: React.FC<OrderWishBannerProps> = ({ compact }) => {
  const { open, wishes } = useJinniSession();

  return (
    <Pressable
      onPress={() => open('tabBar')}
      style={[styles.wrap, compact && styles.wrapCompact]}
      accessibilityRole="button"
      accessibilityLabel="Your Wish is on the Way — open Jinni"
    >
      <ImageBackground
        source={jinniAssets.orderWishBannerBg}
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <LinearGradient
          colors={['rgba(57,26,115,0.88)', 'rgba(94,47,184,0.75)', 'rgba(168,122,18,0.55)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <Image
            source={jinniAssets.chiragSuccess}
            style={[styles.chirag, compact && styles.chiragCompact]}
            resizeMode="contain"
          />
          <View style={styles.center}>
            <Text style={styles.title}>Your Wish is on the Way!</Text>
            <Text style={styles.subtitle}>
              {wishes.isExhausted
                ? 'Kal phir 3 nayi wishes milengi'
                : `${wishes.remaining} wish${wishes.remaining === 1 ? '' : 'es'} left · Tap to ask Chirag`}
            </Text>
          </View>
          <MagicLampIcon size={compact ? 22 : 28} animated={!wishes.isExhausted} />
        </LinearGradient>
      </ImageBackground>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: jinniColors.purple[800],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  wrapCompact: {
    marginHorizontal: 0,
    marginBottom: 8,
  },
  bg: {
    minHeight: 80,
  },
  bgImage: {
    borderRadius: 16,
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 80,
    gap: 8,
  },
  chirag: {
    width: 64,
    height: 64,
  },
  chiragCompact: {
    width: 48,
    height: 48,
  },
  center: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    color: '#FFF',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 3,
  },
});

export default OrderWishBanner;
