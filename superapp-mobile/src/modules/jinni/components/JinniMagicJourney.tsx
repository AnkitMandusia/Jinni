import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { typography, fontFamily } from '@theme/typography';

const IDLE = require('../../../../assets/chirag_carpet_idle.png') as ImageSourcePropType;
const TAKEOFF = require('../../../../assets/chirag_carpet_takeoff.png') as ImageSourcePropType;
const ARRIVED = require('../../../../assets/chirag_carpet_arrived.png') as ImageSourcePropType;

export type MagicJourneyStage = 'idle' | 'takeoff' | 'journey' | 'arrived';

type Props = {
  stage: MagicJourneyStage;
  accent: string;
  pickupLabel: string;
  statusLabel: string;
};

/** Decorative status illustration only. This is not a live route or GPS indicator. */
export const JinniMagicJourney: React.FC<Props> = ({ stage, accent, pickupLabel, statusLabel }) => {
  const bob = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const floatLoop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const glowLoop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0, duration: 1200, useNativeDriver: true }),
    ]));
    floatLoop.start();
    glowLoop.start();
    return () => { floatLoop.stop(); glowLoop.stop(); };
  }, [bob, glow]);

  const source = stage === 'arrived' ? ARRIVED : stage === 'takeoff' ? TAKEOFF : IDLE;
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, stage === 'journey' ? -8 : -4] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.24] });

  return (
    <View style={[styles.container, { backgroundColor: `${accent}0C` }]}>
      <Animated.View style={[styles.aura, { backgroundColor: accent, opacity: glowOpacity }]} />
      <Animated.View style={[styles.artworkWrap, { transform: [{ translateY }] }]}>
        <Image source={source} style={styles.artwork} resizeMode="contain" accessibilityLabel="Chirag on his magic carpet" />
      </Animated.View>
      <View style={styles.statusRow}>
        <Ionicons name={stage === 'arrived' ? 'checkmark-circle' : 'sparkles'} size={16} color={accent} />
        <Text style={[styles.statusText, { color: accent }]}>{statusLabel}</Text>
      </View>
      <Text style={styles.caption}>A little Jinni magic · Illustrative journey, not live GPS</Text>
      <View style={styles.endpointRow}>
        <View style={styles.endpoint}><Ionicons name="storefront-outline" size={15} color={accent} /><Text style={styles.endpointText}>{pickupLabel}</Text></View>
        <View style={[styles.dottedLine, { borderColor: `${accent}70` }]} />
        <View style={styles.endpoint}><Ionicons name="home-outline" size={15} color={colors.gray[700]} /><Text style={styles.endpointText}>You</Text></View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, borderRadius: 24, padding: spacing.md, overflow: 'hidden', alignItems: 'center' },
  aura: { position: 'absolute', width: 210, height: 150, borderRadius: 100, top: 14 },
  artworkWrap: { width: '100%', height: 170, alignItems: 'center', justifyContent: 'center' },
  artwork: { width: '100%', height: '100%' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.xs },
  statusText: { ...typography.h6, fontFamily: fontFamily.semiBold },
  caption: { ...typography.caption, color: colors.gray[500], textAlign: 'center', marginTop: 5 },
  endpointRow: { flexDirection: 'row', width: '100%', alignItems: 'center', marginTop: spacing.md },
  endpoint: { alignItems: 'center', gap: 4, minWidth: 54 },
  endpointText: { ...typography.caption, color: colors.gray[600] },
  dottedLine: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', marginHorizontal: spacing.sm, marginBottom: 17 },
});

export default JinniMagicJourney;
