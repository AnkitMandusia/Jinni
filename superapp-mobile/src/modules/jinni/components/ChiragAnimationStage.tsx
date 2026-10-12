import React, { useEffect } from 'react';
import { StyleSheet, View, Image } from 'react-native';
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
import { ChiragSmokeLayer } from './ChiragSmokeLayer';
import { MagicLampIcon } from './MagicLampIcon';
import { chiragImageForScene } from '@theme/jinniAssets';
import { ChiragGenieFigure } from './ChiragGenieFigure';

interface ChiragAnimationStageProps {
  scene: ChiragScene;
}

const glowColorForScene = (scene: ChiragScene): string => {
  switch (scene) {
    case 'listening':
      return jinniColors.glow.listening;
    case 'thinking':
      return jinniColors.glow.thinking;
    case 'speaking':
      return jinniColors.glow.speaking;
    case 'success':
      return jinniColors.gold[200];
    default:
      return jinniColors.gold[300];
  }
};

/**
 * Cinematic stage: lamp → smoke → real Chirag PNG (from assets/).
 * Spec section 6 / 17 timings. Image swaps by scene for a real character feel.
 */

const moodForScene = (
  scene: ChiragScene
): 'listening' | 'thinking' | 'speaking' | 'success' | 'default' => {
  switch (scene) {
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'success':
      return 'success';
    default:
      return 'default';
  }
};

export const ChiragAnimationStage: React.FC<ChiragAnimationStageProps> = ({ scene }) => {
  const emerge = useSharedValue(0);
  const sway = useSharedValue(0);
  const glowOpacity = useSharedValue(0);
  const glowScale = useSharedValue(0.8);
  const sparkle = useSharedValue(0);
  const lampPulse = useSharedValue(1);
  const imgOpacity = useSharedValue(1);

  const visible = !['idle', 'tap', 'exhausted', 'results'].includes(scene);
  const source = chiragImageForScene(scene);

  useEffect(() => {
    if (
      scene === 'arriving' ||
      scene === 'listening' ||
      scene === 'thinking' ||
      scene === 'speaking' ||
      scene === 'success'
    ) {
      emerge.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.12)) });
    } else if (scene === 'dismissing') {
      emerge.value = withTiming(0, { duration: 650, easing: Easing.in(Easing.cubic) });
    } else if (scene === 'summoning') {
      emerge.value = 0;
      lampPulse.value = withSequence(
        withTiming(1.14, { duration: 220 }),
        withTiming(1, { duration: 320 })
      );
    }
  }, [scene, emerge, lampPulse]);

  useEffect(() => {
    imgOpacity.value = 0.35;
    imgOpacity.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
  }, [scene, imgOpacity]);

  useEffect(() => {
    if (visible) {
      sway.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(-1, { duration: 2200, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    } else {
      sway.value = 0;
    }
  }, [visible, sway]);

  useEffect(() => {
    glowOpacity.value = withTiming(visible ? 1 : 0, { duration: 450 });
    if (scene === 'thinking') {
      glowScale.value = withRepeat(
        withSequence(withTiming(1.16, { duration: 1000 }), withTiming(0.92, { duration: 1000 })),
        -1,
        true
      );
    } else if (scene === 'listening') {
      glowScale.value = withRepeat(
        withSequence(withTiming(1.07, { duration: 520 }), withTiming(0.96, { duration: 520 })),
        -1,
        true
      );
    } else {
      glowScale.value = withTiming(1, { duration: 320 });
    }
  }, [scene, visible, glowOpacity, glowScale]);

  useEffect(() => {
    if (scene === 'success') {
      sparkle.value = 0;
      sparkle.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
    } else {
      sparkle.value = withDelay(100, withTiming(0, { duration: 200 }));
    }
  }, [scene, sparkle]);

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: emerge.value * imgOpacity.value,
    transform: [
      { translateY: (1 - emerge.value) * 56 + sway.value * -5 },
      { scale: 0.78 + emerge.value * 0.22 },
      { rotateZ: `${sway.value * 1.6}deg` },
    ],
  }));

  const glowColor = glowColorForScene(scene);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value * 0.75,
    transform: [{ scale: glowScale.value }],
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: sparkle.value * 0.9,
    transform: [{ scale: 0.5 + sparkle.value * 1.35 }],
  }));

  const lampStyle = useAnimatedStyle(() => ({
    transform: [{ scale: lampPulse.value }],
  }));

  return (
    <View style={styles.stage}>
      <ChiragSmokeLayer scene={scene} />

      <Animated.View
        style={[styles.glowHalo, { backgroundColor: glowColor }, glowStyle]}
        pointerEvents="none"
      />
      <Animated.View style={[styles.sparkleHalo, sparkleStyle]} pointerEvents="none" />

      <Animated.View style={[styles.figure, bodyStyle]}>
        <View style={styles.imageFrame}>
          {/* Vector Chirag always renders (reliable); PNG overlays when assets exist */}
          <View style={styles.genieFallback}>
            <ChiragGenieFigure size={120} mood={moodForScene(scene)} />
          </View>
          <Image
            source={source}
            style={styles.chiragImage}
            resizeMode="contain"
            accessibilityLabel="Chirag, Jinni assistant"
          />
        </View>
      </Animated.View>

      <Animated.View style={[styles.lampBase, lampStyle]}>
        <View style={styles.lampCircle}>
          <MagicLampIcon
            size={34}
            animated={scene === 'summoning' || scene === 'listening'}
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    height: 280,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  glowHalo: {
    position: 'absolute',
    bottom: 40,
    width: 210,
    height: 210,
    borderRadius: 105,
  },
  sparkleHalo: {
    position: 'absolute',
    bottom: 40,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: jinniColors.gold[100],
  },
  figure: {
    position: 'absolute',
    bottom: 58,
    zIndex: 2,
  },
  imageFrame: {
    width: 168,
    height: 168,
    borderRadius: 84,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chiragImage: {
    width: 168,
    height: 168,
  },
  lampBase: {
    zIndex: 3,
    marginBottom: 2,
  },
  lampCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: jinniColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: jinniColors.gold[400],
    shadowColor: jinniColors.gold[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});

export default ChiragAnimationStage;
