import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';

type Props = {
  pickup: string;
  drop: string;
  onPickupNav?: () => void;
  onDropNav?: () => void;
  dark?: boolean;
};

/** Pickup → drop timeline (optionally with "open in Google Maps" buttons for riders). */
export const RouteLine: React.FC<Props> = ({ pickup, drop, onPickupNav, onDropNav, dark }) => {
  const text = dark ? '#fff' : jinniColors.purple[900];
  const Row = ({ label, value, dot, onNav }: { label: string; value: string; dot: string; onNav?: () => void }) => (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, dark && { color: jinniColors.gold[200] }]}>{label}</Text>
        <Text style={[styles.value, { color: text }]} numberOfLines={2}>{value}</Text>
      </View>
      {onNav && (
        <TouchableOpacity style={styles.nav} onPress={onNav} accessibilityLabel={`Navigate to ${label}`}>
          <Ionicons name="navigate" size={16} color="#fff" />
          <Text style={styles.navText}>Navigate</Text>
        </TouchableOpacity>
      )}
    </View>
  );
  return (
    <View>
      <Row label="PICKUP" value={pickup} dot={jinniColors.gold[500]} onNav={onPickupNav} />
      <View style={[styles.rail, dark && { borderColor: 'rgba(255,255,255,0.3)' }]} />
      <Row label="DROP" value={drop} dot={jinniColors.purple[400]} onNav={onDropNav} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  label: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 1.5, color: jinniColors.purple[400] },
  value: { fontFamily: fontFamily.semiBold, fontSize: 15, marginTop: 1 },
  rail: { height: 16, marginLeft: 5, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: jinniColors.purple[200] },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: jinniColors.purple[500], paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  navText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 12 },
});
