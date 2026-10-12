import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { jinniColors } from '@theme/jinni';

const BAR_COUNT = 24;

interface ChiragWaveformProps {
  /** 0-1 mic amplitude. Defaults to a gentle simulated level until the real
   *  mic input is wired up (spec section 6.1, scene 5: "the one place the
   *  UI should feel responsive to the user's actual voice"). */
  amplitude?: number;
  active?: boolean;
}

const Bar: React.FC<{ target: number }> = ({ target }) => {
  const height = useSharedValue(4);

  useEffect(() => {
    height.value = withTiming(target, { duration: 160 });
  }, [target, height]);

  const style = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View style={[styles.bar, style]} />;
};

/**
 * Listening-state waveform (spec section 6.1, scene 5). When `amplitude`
 * isn't supplied by a live mic yet, falls back to a soft simulated pattern
 * so the component is reviewable standalone — swap in the real mic level
 * once the voice pipeline exists, no API change needed.
 */
export const ChiragWaveform: React.FC<ChiragWaveformProps> = ({ amplitude, active = true }) => {
  const [levels, setLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(6));
  const frame = useRef(0);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      frame.current += 1;
      setLevels((prev) =>
        prev.map((_, i) => {
          const base = amplitude ?? 0.45 + 0.35 * Math.sin(frame.current / 3 + i);
          const noise = Math.random() * 0.3;
          return 4 + Math.max(0, Math.min(1, base + noise - 0.15)) * 26;
        })
      );
    }, 90);
    return () => clearInterval(interval);
  }, [active, amplitude]);

  return (
    <View style={styles.row}>
      {levels.map((h, i) => (
        <Bar key={i} target={h} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    gap: 3,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: jinniColors.glow.listening,
  },
});

export default ChiragWaveform;
