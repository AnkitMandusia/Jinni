import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, Path, Circle as SvgCircle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';
import { typography, fontFamily } from '@theme/typography';

/**
 * Replaces the live MapView on the order tracking screen. No GPS polling, no
 * maps SDK, no per-request cost — just a distance-derived ETA ("15 min" /
 * "30 min" style buckets, see estimateEtaMinutes below) visualised as a
 * little genie-on-a-flying-carpet gliding from the store/restaurant icon to
 * the home icon, bobbing gently via RN's Animated API (no extra native
 * dependency beyond what's already in the project).
 */

export function estimateEtaMinutes(distanceKm: number | null): number {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return 20; // sensible default when we don't have both coordinates yet
  }
  // ~18 km/h average city delivery speed (bike/scooter incl. stops), rounded
  // to the nearest 5 minutes and bucketed between a 15 and 40 minute floor/
  // ceiling so very short or very long hops still read as a believable ETA.
  const raw = (distanceKm / 18) * 60;
  const rounded = Math.round(raw / 5) * 5;
  return Math.min(45, Math.max(15, rounded));
}

export function haversineKm(
  a: { latitude: number; longitude: number } | null,
  b: { latitude: number; longitude: number } | null
): number | null {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

const Carpet: React.FC<{ accent: string }> = ({ accent }) => (
  <Svg width={56} height={44} viewBox="0 0 56 44">
    <Ellipse cx={28} cy={38} rx={20} ry={4} fill={colors.black} opacity={0.08} />
    <Path
      d="M4 22 Q28 10 52 22 Q46 28 28 28 Q10 28 4 22 Z"
      fill={accent}
    />
    <Path d="M4 22 Q28 10 52 22" stroke={colors.white} strokeWidth={1.5} opacity={0.6} fill="none" />
    <Path d="M10 24 Q28 15 46 24" stroke={colors.white} strokeWidth={1} opacity={0.4} fill="none" />
    {/* tassels */}
    <SvgCircle cx={6} cy={23} r={1.6} fill={colors.secondary[500]} />
    <SvgCircle cx={50} cy={23} r={1.6} fill={colors.secondary[500]} />
    {/* genie puff */}
    <SvgCircle cx={28} cy={12} r={7} fill={colors.white} opacity={0.9} />
    <SvgCircle cx={23} cy={9} r={4} fill={colors.white} opacity={0.7} />
    <SvgCircle cx={34} cy={8} r={3.5} fill={colors.white} opacity={0.7} />
  </Svg>
);

type Props = {
  progress: number; // 0..1 along the pickup -> destination journey
  accent: string;
  pickupIcon: 'storefront' | 'restaurant';
  pickupLabel: string;
};

export const JinniETAFlight: React.FC<Props> = ({ progress, accent, pickupIcon, pickupLabel }) => {
  const bob = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    const sparkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(sparkle, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    sparkleLoop.start();
    return () => { loop.stop(); sparkleLoop.stop(); };
  }, [bob, sparkle]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.9] });

  return (
    <View style={styles.wrap}>
      <View style={styles.trackRow}>
        <View style={[styles.endpoint, { backgroundColor: accent }]}>
          <Ionicons name={pickupIcon} size={16} color={colors.white} />
        </View>
        <View style={styles.trackLine}>
          <View style={[styles.trackFill, { width: `${clamped * 100}%`, backgroundColor: accent }]} />
          <Animated.View
            style={[
              styles.carpetPos,
              { left: `${clamped * 100}%`, transform: [{ translateY }, { translateX: -28 }] },
            ]}
          >
            <Animated.View style={[styles.sparkle, { opacity: sparkleOpacity }]} />
            <Carpet accent={accent} />
          </Animated.View>
        </View>
        <View style={[styles.endpoint, { backgroundColor: colors.gray[800] }]}>
          <Ionicons name="home" size={16} color={colors.white} />
        </View>
      </View>
      <View style={styles.labelRow}>
        <Text style={styles.labelText}>{pickupLabel}</Text>
        <Text style={styles.labelText}>You</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.md },
  trackRow: { flexDirection: 'row', alignItems: 'center', height: 56 },
  endpoint: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', elevation: 2,
  },
  trackLine: {
    flex: 1, height: 4, backgroundColor: colors.gray[150] ?? colors.gray[200],
    borderRadius: 2, marginHorizontal: spacing.sm, position: 'relative',
  },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  carpetPos: { position: 'absolute', top: -26, width: 56, alignItems: 'center' },
  sparkle: {
    position: 'absolute', top: -4, width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.secondary[300] ?? colors.secondary[500],
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  labelText: { ...typography.caption, color: colors.gray[500], fontFamily: fontFamily.medium },
});

export default JinniETAFlight;
