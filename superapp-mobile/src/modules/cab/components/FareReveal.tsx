import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';

/** The "wish price": counts up to the fare with a little sparkle so the estimate feels like a reveal. */
export const FareReveal: React.FC<{ fare: number; km: number }> = ({ fare, km }) => {
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = v.addListener(({ value }) => setShown(Math.round(value)));
    v.setValue(0);
    Animated.timing(v, { toValue: fare, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [fare, v]);

  return (
    <LinearGradient colors={[jinniColors.gold[100], jinniColors.gold[50]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <Text style={styles.label}>✨ WISH PRICE</Text>
      <Text style={styles.fare}>₹{shown}</Text>
      <Text style={styles.sub}>{km.toFixed(1)} km · price locked once you book</Text>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: jinniColors.gold[200] },
  label: { fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 2, color: jinniColors.gold[700] },
  fare: { fontFamily: fontFamily.bold, fontSize: 44, color: jinniColors.purple[800], marginVertical: 2 },
  sub: { fontFamily: fontFamily.medium, fontSize: 12, color: jinniColors.gold[700] },
});
