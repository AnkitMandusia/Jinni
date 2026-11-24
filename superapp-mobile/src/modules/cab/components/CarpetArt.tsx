import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import { jinniColors } from '@theme/jinni';

const IDLE = require('../../../../assets/chirag_carpet_idle.png') as ImageSourcePropType;
const TAKEOFF = require('../../../../assets/chirag_carpet_takeoff.png') as ImageSourcePropType;
const ARRIVED = require('../../../../assets/chirag_carpet_arrived.png') as ImageSourcePropType;

export type CarpetStage = 'idle' | 'takeoff' | 'arrived';

/** Chirag on his magic carpet, gently floating over a soft gold aura. Decorative only. */
export const CarpetArt: React.FC<{ stage: CarpetStage; height?: number; lift?: number }> = ({ stage, height = 150, lift = 6 }) => {
  const bob = useRef(new Animated.Value(0)).current;
  const aura = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(aura, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(aura, { toValue: 0, duration: 1400, useNativeDriver: true }),
    ]));
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [bob, aura]);

  const src = stage === 'arrived' ? ARRIVED : stage === 'takeoff' ? TAKEOFF : IDLE;
  return (
    <View style={[styles.wrap, { height }]}>
      <Animated.View style={[styles.aura, { opacity: aura.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.3] }) }]} />
      <Animated.Image
        source={src}
        resizeMode="contain"
        style={[styles.img, { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -lift] }) }] }]}
        accessibilityLabel="Chirag on his magic carpet"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  aura: { position: 'absolute', width: 220, height: 120, borderRadius: 120, backgroundColor: jinniColors.gold[300] },
  img: { width: '100%', height: '100%' },
});
