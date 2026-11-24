import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useOrderRealtime } from '@shared/hooks/useOrderRealtime';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { CarpetArt, CarpetStage } from '../components/CarpetArt';
import { RouteLine } from '../components/RouteLine';
import { callPhone } from '../openMaps';
import { rideError, rideService } from '../services/rideService';
import { Ride, RideStatus, isClosed } from '../types';

const P = jinniColors.purple;
const G = jinniColors.gold;

const COPY: Record<RideStatus, { stage: CarpetStage; title: string; sub: string }> = {
  requested: { stage: 'idle', title: 'Finding your carpet…', sub: 'Waking up the nearest rider. This usually takes a minute.' },
  accepted: { stage: 'takeoff', title: 'Your carpet is on the way', sub: 'Your rider is heading to the pickup point.' },
  arrived: { stage: 'arrived', title: 'Carpet has landed 📍', sub: 'Your rider is at the pickup point.' },
  in_progress: { stage: 'takeoff', title: 'Enjoy the flight ✨', sub: 'Sit back — you are on your way.' },
  completed: { stage: 'arrived', title: 'Wish fulfilled!', sub: 'Hope you enjoyed the ride.' },
  cancelled: { stage: 'idle', title: 'Ride cancelled', sub: '' },
  expired: { stage: 'idle', title: 'No carpet was free', sub: 'Nobody could take this ride in time. Please try again.' },
};

const STEPS: { key: RideStatus; label: string }[] = [
  { key: 'requested', label: 'Wish made' },
  { key: 'accepted', label: 'Rider assigned' },
  { key: 'arrived', label: 'Rider arrived' },
  { key: 'in_progress', label: 'On the way' },
  { key: 'completed', label: 'Dropped' },
];

export const ActiveRideScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { rideId } = useRoute<RouteProp<{ p: { rideId: string } }, 'p'>>().params;
  const focused = useIsFocused();
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setRide(await rideService.get(rideId));
      setError('');
    } catch (e: any) {
      setError(rideError(e));
    }
  }, [rideId]);

  useEffect(() => {
    if (!focused) return;
    void load();
    // Poll as the safety net; the websocket below makes updates feel instant.
    const t = setInterval(() => { if (!ride || !isClosed(ride.status) || ride.payment_status !== 'paid') void load(); }, 6000);
    return () => clearInterval(t);
  }, [focused, load, ride?.status, ride?.payment_status]);

  useOrderRealtime((evt) => { if (evt.event === 'ride.status_updated') void load(); }, rideId);

  const cancel = () =>
    Alert.alert('Cancel this ride?', 'You can cancel until you are on board.', [
      { text: 'Keep ride', style: 'cancel' },
      {
        text: 'Cancel ride', style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try { setRide(await rideService.cancel(rideId)); } catch (e: any) { Alert.alert('Cannot cancel', rideError(e)); void load(); } finally { setCancelling(false); }
        },
      },
    ]);

  const payUpi = async () => {
    if (!ride?.upi) return;
    try {
      await Linking.openURL(ride.upi.link);
    } catch {
      Alert.alert('No UPI app found', `Pay ₹${ride.fare} to ${ride.upi.vpa} from any UPI app, then tell your rider.`);
    }
  };

  if (!ride) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.err}>{error}</Text> : <ActivityIndicator color={P[500]} size="large" />}
        {!!error && <TouchableOpacity onPress={load}><Text style={styles.link}>Try again</Text></TouchableOpacity>}
      </View>
    );
  }

  const c = COPY[ride.status];
  const closed = isClosed(ride.status);
  const failed = ride.status === 'cancelled' || ride.status === 'expired';
  const stepIdx = STEPS.findIndex((s) => s.key === ride.status);
  const canCancel = ['requested', 'accepted', 'arrived'].includes(ride.status);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={failed ? ['#344054', '#475467'] : [P[900], P[700], P[500]]} style={styles.hero}>
          <SafeAreaView edges={['top']}>
            <View style={styles.top}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('RideHome')} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.num}>#{ride.ride_number}</Text>
              <View style={{ width: 38 }} />
            </View>
            <CarpetArt stage={c.stage} height={140} lift={ride.status === 'in_progress' ? 12 : 6} />
            <Text style={styles.title}>{c.title}</Text>
            <Text style={styles.sub}>{ride.status === 'cancelled' && ride.cancel_reason ? ride.cancel_reason : c.sub}</Text>
          </SafeAreaView>
        </LinearGradient>

        {!failed && (
          <View style={styles.steps}>
            {STEPS.map((s, i) => {
              const done = i <= stepIdx;
              return (
                <View key={s.key} style={styles.step}>
                  <View style={[styles.stepDot, done && { backgroundColor: G[500], borderColor: G[500] }]}>
                    {done && <Ionicons name="checkmark" size={10} color={P[900]} />}
                  </View>
                  <Text style={[styles.stepLabel, done && { color: P[800], fontFamily: fontFamily.bold }]} numberOfLines={2}>{s.label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {ride.rider && (
          <View style={styles.card}>
            <View style={styles.riderRow}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{(ride.rider.name || 'R')[0].toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{ride.rider.name || 'Your rider'}</Text>
                <Text style={styles.riderMeta}>
                  {ride.rider.vehicle_type || 'Bike'}{ride.rider.rating ? ` · ★ ${ride.rider.rating.toFixed(1)}` : ''}
                </Text>
              </View>
              {!!ride.rider.phone && !closed && (
                <TouchableOpacity style={styles.call} onPress={() => callPhone(ride.rider?.phone)} accessibilityLabel="Call rider">
                  <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            {!!ride.rider.phone && <Text style={styles.phone}>{ride.rider.phone}</Text>}
          </View>
        )}

        <View style={styles.card}>
          <RouteLine pickup={ride.pickup.text} drop={ride.drop.text} />
        </View>

        <View style={styles.card}>
          <View style={styles.fareRow}>
            <Text style={styles.fareLbl}>Fare · {ride.distance_km.toFixed(1)} km</Text>
            <Text style={styles.fare}>₹{ride.fare.toFixed(0)}</Text>
          </View>
          {!!ride.fare_adjusted_reason && <Text style={styles.adj}>Adjusted: {ride.fare_adjusted_reason}</Text>}
          <View style={styles.fareRow}>
            <Text style={styles.fareLbl}>{ride.payment_method === 'cash' ? '💵 Cash to rider' : '📲 UPI'}</Text>
            <View style={[styles.badge, ride.payment_status === 'paid' ? styles.badgeOk : styles.badgeWait]}>
              <Text style={[styles.badgeTxt, { color: ride.payment_status === 'paid' ? '#067647' : '#B54708' }]}>
                {ride.payment_status === 'paid' ? 'PAID' : 'PAYMENT PENDING'}
              </Text>
            </View>
          </View>
          {ride.upi && (
            <TouchableOpacity style={styles.upiBtn} onPress={payUpi} activeOpacity={0.85}>
              <Ionicons name="qr-code" size={18} color="#fff" />
              <Text style={styles.upiTxt}>Pay ₹{ride.fare.toFixed(0)} with UPI</Text>
            </TouchableOpacity>
          )}
          {ride.upi && <Text style={styles.hint}>Pays {ride.upi.vpa}. Your rider confirms once it arrives.</Text>}
        </View>

        {canCancel && (
          <TouchableOpacity style={styles.cancel} onPress={cancel} disabled={cancelling}>
            {cancelling ? <ActivityIndicator color="#B42318" /> : <Text style={styles.cancelTxt}>Cancel ride</Text>}
          </TouchableOpacity>
        )}
        {closed && (
          <TouchableOpacity style={styles.again} onPress={() => navigation.navigate('RideHome')} activeOpacity={0.9}>
            <Text style={styles.againTxt}>{failed ? 'Try again' : 'Book another ride'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF9FF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  err: { color: '#B42318', fontFamily: fontFamily.medium, textAlign: 'center' },
  link: { color: P[500], fontFamily: fontFamily.bold },
  hero: { paddingBottom: 24, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  num: { color: G[200], fontFamily: fontFamily.bold, letterSpacing: 1.5, fontSize: 13 },
  title: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 22, textAlign: 'center', marginTop: 4 },
  sub: { color: P[100], fontFamily: fontFamily.medium, fontSize: 13, textAlign: 'center', marginTop: 4, paddingHorizontal: 28 },
  steps: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: '#fff', borderRadius: 18, padding: 12 },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#D0D5DD', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepLabel: { fontFamily: fontFamily.medium, fontSize: 9.5, color: '#98A2B3', textAlign: 'center' },
  card: { marginHorizontal: 16, marginTop: 14, backgroundColor: '#fff', borderRadius: 20, padding: 16 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: P[500], alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 18 },
  riderName: { fontFamily: fontFamily.bold, fontSize: 16, color: P[900] },
  riderMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', marginTop: 1 },
  phone: { fontFamily: fontFamily.medium, fontSize: 13, color: P[600], marginTop: 10 },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#12B76A', alignItems: 'center', justifyContent: 'center' },
  fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fareLbl: { fontFamily: fontFamily.medium, fontSize: 14, color: '#475467' },
  fare: { fontFamily: fontFamily.bold, fontSize: 24, color: P[800] },
  adj: { fontFamily: fontFamily.regular, fontSize: 12, color: '#B54708', marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeOk: { backgroundColor: '#ECFDF3' },
  badgeWait: { backgroundColor: '#FFFAEB' },
  badgeTxt: { fontFamily: fontFamily.bold, fontSize: 11 },
  upiBtn: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P[600], paddingVertical: 14, borderRadius: 14 },
  upiTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 15 },
  hint: { marginTop: 8, fontFamily: fontFamily.regular, fontSize: 11, color: '#667085', textAlign: 'center' },
  cancel: { marginHorizontal: 16, marginTop: 18, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#FEF3F2' },
  cancelTxt: { color: '#B42318', fontFamily: fontFamily.bold, fontSize: 15 },
  again: { marginHorizontal: 16, marginTop: 18, paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: G[500] },
  againTxt: { color: P[900], fontFamily: fontFamily.bold, fontSize: 16 },
});

export default ActiveRideScreen;
