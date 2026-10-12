import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { jinniColors } from '@theme/jinni';

interface JinniSparkleAccentProps {
  style?: ViewStyle;
  size?: number;
}

/**
 * Small "wish granted" sparkle/glow accent for the order success screen
 * (spec section 7, v1-recommended touchpoint). Sits behind/around an
 * existing checkmark — short-burst feeling, not a standalone character,
 * and does not add a Chirag appearance to commerce screens (restraint
 * rule, section 3).
 */
export const JinniSparkleAccent: React.FC<JinniSparkleAccentProps> = ({ style, size = 120 }) => {
  const burst = useSharedValue(0);

  useEffect(() => {
    burst.value = withDelay(150, withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }));
  }, [burst]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: burst.value * 0.55,
    transform: [{ scale: 0.6 + burst.value * 0.6 }],
  }));

  const sparkleStyle = (delayFactor: number) =>
    useAnimatedStyle(() => ({
      opacity: Math.max(0, burst.value - delayFactor) * 2,
      transform: [{ scale: burst.value }],
    }));

  const s1 = sparkleStyle(0.05);
  const s2 = sparkleStyle(0.15);
  const s3 = sparkleStyle(0.25);

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]} pointerEvents="none">
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.dot, styles.dotTop, s1]} />
      <Animated.View style={[styles.dot, styles.dotLeft, s2]} />
      <Animated.View style={[styles.dot, styles.dotRight, s3]} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: '80%',
    height: '80%',
    borderRadius: 999,
    backgroundColor: jinniColors.gold[200],
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: jinniColors.gold[400],
  },
  dotTop: { top: '6%' },
  dotLeft: { left: '10%', top: '40%' },
  dotRight: { right: '10%', top: '55%' },
});

export default JinniSparkleAccent;
