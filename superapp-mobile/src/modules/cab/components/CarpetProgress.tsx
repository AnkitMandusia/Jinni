import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';

type Props = { progress: number; from: string; to: string; line: string };

/** A track from start to end with a little carpet gliding along it. Pure View math — no map, no tiles, free. */
export const CarpetProgress: React.FC<Props> = ({ progress, from, to, line }) => {
  const v = useRef(new Animated.Value(0)).current;
  const width = useRef(0);
  useEffect(() => {
    Animated.timing(v, { toValue: Math.max(0, Math.min(1, progress)), duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress, v]);

  return (
    <View>
      <View style={styles.track} onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}>
        <View style={styles.rail} />
        <Animated.View style={[styles.fill, { width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        <Animated.View style={[styles.carpet, { left: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '92%'] }) }]}>
          <Text style={styles.carpetEmoji}>🧞</Text>
        </Animated.View>
      </View>
      <View style={styles.labels}>
        <Text style={styles.lbl} numberOfLines={1}>{from}</Text>
        <Text style={styles.lbl} numberOfLines={1}>{to}</Text>
      </View>
      <Text style={styles.line}>{line}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  track: { height: 34, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: jinniColors.purple[100] },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: jinniColors.gold[400] },
  carpet: { position: 'absolute', top: 0 },
  carpetEmoji: { fontSize: 26 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lbl: { flex: 1, fontFamily: fontFamily.medium, fontSize: 11, color: '#667085' },
  line: { fontFamily: fontFamily.bold, fontSize: 15, color: jinniColors.purple[800], marginTop: 6 },
});
