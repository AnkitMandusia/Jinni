import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { jinniColors } from '@theme/jinni';
import { ChiragScene } from '../types';

interface ChiragSmokeLayerProps {
  scene: ChiragScene;
}

const isVisible = (scene: ChiragScene) =>
  !['idle', 'tap', 'exhausted'].includes(scene);

const densityForScene = (scene: ChiragScene): number => {
  switch (scene) {
    case 'summoning':
      return 0.6;
    case 'arriving':
      return 0.85;
    case 'thinking':
      return 1;
    case 'dismissing':
      return 0.4;
    default:
      return 0.72;
  }
};

const Puff: React.FC<{
  delay: number;
  size: number;
  drift: number;
  density: number;
  duration?: number;
  color?: string;
}> = ({ delay, size, drift, density, duration = 2400, color }) => {
  const rise = useSharedValue(0);

  useEffect(() => {
    rise.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      )
    );
  }, [rise, delay, duration]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.max(0, (0.55 - Math.abs(rise.value - 0.45)) * density),
    transform: [
      { translateY: -rise.value * 110 },
      { translateX: drift * rise.value },
      { scale: 0.45 + rise.value * 1.15 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.puff,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: -size / 2,
          backgroundColor: color || jinniColors.smoke[0],
        },
        style,
      ]}
    />
  );
};

/** Spark particle for thinking / success */
const Spark: React.FC<{ delay: number; x: number; density: number }> = ({
  delay,
  x,
  density,
}) => {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      )
    );
  }, [t, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: (1 - t.value) * density * 0.9,
    transform: [
      { translateY: -t.value * 70 },
      { translateX: x + Math.sin(t.value * 6) * 8 },
      { scale: 0.4 + t.value * 0.8 },
    ],
  }));

  return <Animated.View style={[styles.spark, style]} />;
};

export const ChiragSmokeLayer: React.FC<ChiragSmokeLayerProps> = ({ scene }) => {
  const density = densityForScene(scene);
  const showSparks = scene === 'thinking' || scene === 'success' || scene === 'arriving';

  if (!isVisible(scene)) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Puff delay={0} size={78} drift={-22} density={density} color={jinniColors.smoke[0]} />
      <Puff delay={280} size={62} drift={26} density={density * 0.9} color={jinniColors.smoke[1]} />
      <Puff delay={520} size={50} drift={-10} density={density * 0.75} />
      <Puff delay={780} size={42} drift={16} density={density * 0.6} color={jinniColors.smoke[1]} />
      <Puff delay={1100} size={36} drift={-14} density={density * 0.5} duration={2800} />
      {showSparks && (
        <>
          <Spark delay={100} x={-20} density={density} />
          <Spark delay={400} x={12} density={density} />
          <Spark delay={700} x={-6} density={density * 0.8} />
          <Spark delay={950} x={24} density={density * 0.7} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    alignItems: 'center',
    width: 1,
  },
  puff: {
    position: 'absolute',
    bottom: 0,
  },
  spark: {
    position: 'absolute',
    bottom: 20,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: jinniColors.gold[300],
  },
});

export default ChiragSmokeLayer;
