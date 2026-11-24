import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { rideService } from '../services/rideService';
import { Ride, RideStatus } from '../types';

const P = jinniColors.purple;
const TONE: Record<RideStatus, [string, string, string]> = {
  requested: ['Finding rider', '#B54708', '#FFFAEB'],
  accepted: ['Rider coming', '#175CD3', '#EFF8FF'],
  arrived: ['Rider arrived', '#175CD3', '#EFF8FF'],
  in_progress: ['On the way', '#175CD3', '#EFF8FF'],
  completed: ['Completed', '#067647', '#ECFDF3'],
  cancelled: ['Cancelled', '#B42318', '#FEF3F2'],
  expired: ['No rider', '#667085', '#F2F4F7'],
};

export const RideHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [rides, setRides] = useState<Ride[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setRides((await rideService.my()).rides); } catch { setRides((r) => r ?? []); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!rides) return <ActivityIndicator style={{ marginTop: 80 }} color={P[500]} />;

  return (
    <FlatList
      style={{ backgroundColor: '#FBF9FF' }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={rides}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
      ListEmptyComponent={<Text style={styles.empty}>No rides yet. Make your first wish ✨</Text>}
      renderItem={({ item: r }) => {
        const [label, fg, bg] = TONE[r.status];
        return (
          <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('ActiveRide', { rideId: r.id })}>
            <View style={styles.head}>
              <Text style={styles.date}>{r.requested_at ? new Date(r.requested_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</Text>
              <View style={[styles.chip, { backgroundColor: bg }]}><Text style={[styles.chipTxt, { color: fg }]}>{label}</Text></View>
            </View>
            <Text style={styles.route} numberOfLines={1}>{r.pickup.text}</Text>
            <Text style={styles.arrow}>↓</Text>
            <Text style={styles.route} numberOfLines={1}>{r.drop.text}</Text>
            <View style={styles.foot}>
              <Text style={styles.meta}>{r.distance_km.toFixed(1)} km · {r.payment_method.toUpperCase()}{r.payment_status === 'paid' ? ' · paid' : ''}</Text>
              <Text style={styles.fare}>₹{r.fare.toFixed(0)}</Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: '#98A2B3', marginTop: 60, fontFamily: fontFamily.medium },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  date: { fontFamily: fontFamily.medium, fontSize: 12, color: '#667085' },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  chipTxt: { fontFamily: fontFamily.bold, fontSize: 11 },
  route: { fontFamily: fontFamily.semiBold, fontSize: 14, color: P[900] },
  arrow: { color: P[300], marginVertical: 1 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  meta: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085' },
  fare: { fontFamily: fontFamily.bold, fontSize: 18, color: P[800] },
});

export default RideHistoryScreen;
