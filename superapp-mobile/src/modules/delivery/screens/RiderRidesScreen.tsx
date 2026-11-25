import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { rideError, rideService } from '@modules/cab/services/rideService';
import { Ride } from '@modules/cab/types';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { useRiderRides } from '../store/riderRideStore';

const P = jinniColors.purple;
const G = jinniColors.gold;

type History = Awaited<ReturnType<typeof rideService.riderHistory>>;

/** Rides tab: current ride, open requests, and past rides with cash/UPI totals. */
export const RiderRidesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { available, active, busy, disabled, refresh, drop } = useRiderRides();
  const [history, setHistory] = useState<History | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    await refresh();
    try { setHistory(await rideService.riderHistory()); } catch { /* keep previous */ }
    setRefreshing(false);
  }, [refresh]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const accept = async (r: Ride) => {
    try {
      const ride = await rideService.accept(r.id);
      void refresh();
      navigation.navigate('RiderRide', { rideId: ride.id });
    } catch (e: any) {
      Alert.alert('Could not accept', rideError(e));
      void refresh();
    }
  };
  const skip = async (r: Ride) => { drop(r.id); try { await rideService.reject(r.id); } catch { /* ignore */ } };
  const confirm = async (r: Ride) => {
    try { await rideService.confirmPayment(r.id); void load(); } catch (e: any) { Alert.alert('Could not confirm', rideError(e)); }
  };

  const t = history?.page_totals;
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
        <Text style={styles.h1}>🧞 Rides</Text>
        {disabled && <Text style={styles.notice}>Rides are switched off for your account. Contact admin.</Text>}

        {active && (
          <TouchableOpacity style={styles.active} activeOpacity={0.9} onPress={() => navigation.navigate('RiderRide', { rideId: active.id })}>
            <Text style={styles.activeLbl}>CURRENT RIDE · {active.status.replace('_', ' ').toUpperCase()}</Text>
            <Text style={styles.activeRoute} numberOfLines={1}>{active.pickup.text} → {active.drop.text}</Text>
            <Text style={styles.activeFare}>₹{active.fare.toFixed(0)} · tap to continue</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.h2}>New requests</Text>
        {available.length === 0 ? (
          <Text style={styles.empty}>{busy ? 'Finish your current job to get new rides.' : 'No requests right now. Make sure you are Online on the Dashboard.'}</Text>
        ) : available.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={styles.route} numberOfLines={1}>{r.pickup.text}</Text>
            <Text style={styles.arrow}>↓</Text>
            <Text style={styles.route} numberOfLines={1}>{r.drop.text}</Text>
            <Text style={styles.meta}>₹{r.fare.toFixed(0)} · {r.distance_km.toFixed(1)} km · {r.payment_method.toUpperCase()}</Text>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.skip} onPress={() => skip(r)}><Text style={styles.skipTxt}>Skip</Text></TouchableOpacity>
              <TouchableOpacity style={styles.accept} onPress={() => accept(r)}><Text style={styles.acceptTxt}>Accept</Text></TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={styles.h2}>Past rides</Text>
        {t && (
          <View style={styles.totals}>
            {[['Rides', String(t.completed)], ['Fare', `₹${t.fare.toFixed(0)}`], ['Cash', `₹${t.cash.toFixed(0)}`], ['UPI', `₹${t.upi.toFixed(0)}`], ['Unpaid', `₹${t.unpaid.toFixed(0)}`]].map(([k, v]) => (
              <View key={k} style={styles.tot}><Text style={styles.totV}>{v}</Text><Text style={styles.totK}>{k}</Text></View>
            ))}
          </View>
        )}
        {history?.rides.length === 0 && <Text style={styles.empty}>No completed rides yet.</Text>}
        {history?.rides.map((r) => (
          <TouchableOpacity key={r.id} style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('RiderRide', { rideId: r.id })}>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{r.completed_at ? new Date(r.completed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : r.status}</Text>
              <Text style={styles.fareSm}>₹{r.fare.toFixed(0)}</Text>
            </View>
            <Text style={styles.route} numberOfLines={1}>{r.pickup.text} → {r.drop.text}</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.meta}>{r.status === 'cancelled' ? 'Cancelled' : `${r.payment_method.toUpperCase()} · ${r.payment_status === 'paid' ? 'paid' : 'unpaid'}`}</Text>
              {r.status === 'completed' && r.payment_status !== 'paid' && (
                <TouchableOpacity style={styles.mini} onPress={() => confirm(r)}><Text style={styles.miniTxt}>Mark received</Text></TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF9FF' },
  h1: { fontFamily: fontFamily.bold, fontSize: 26, color: P[800], marginBottom: 8 },
  h2: { fontFamily: fontFamily.bold, fontSize: 14, color: P[800], marginTop: 20, marginBottom: 10 },
  notice: { backgroundColor: '#FEF3F2', color: '#B42318', padding: 12, borderRadius: 12, fontFamily: fontFamily.medium },
  empty: { color: '#98A2B3', fontFamily: fontFamily.regular, fontSize: 13 },
  active: { backgroundColor: P[700], borderRadius: 20, padding: 16, marginTop: 8 },
  activeLbl: { color: G[200], fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 1.5 },
  activeRoute: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 16, marginTop: 6 },
  activeFare: { color: P[100], fontFamily: fontFamily.medium, fontSize: 13, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10 },
  route: { fontFamily: fontFamily.semiBold, fontSize: 14, color: P[900] },
  arrow: { color: P[300] },
  meta: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  skip: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#F2F4F7' },
  skipTxt: { fontFamily: fontFamily.bold, color: '#475467' },
  accept: { flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: G[400] },
  acceptTxt: { fontFamily: fontFamily.bold, color: P[900] },
  totals: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 12, justifyContent: 'space-between' },
  tot: { alignItems: 'center' },
  totV: { fontFamily: fontFamily.bold, fontSize: 15, color: P[800] },
  totK: { fontFamily: fontFamily.regular, fontSize: 11, color: '#667085' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareSm: { fontFamily: fontFamily.bold, fontSize: 16, color: P[800] },
  mini: { backgroundColor: P[600], paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginTop: 4 },
  miniTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 12 },
});

export default RiderRidesScreen;
