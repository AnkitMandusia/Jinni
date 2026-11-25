import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RouteLine } from '@modules/cab/components/RouteLine';
import { SOSSheet } from '@modules/cab/components/SOSSheet';
import { callPhone, openInGoogleMaps } from '@modules/cab/openMaps';
import { rideError, rideService } from '@modules/cab/services/rideService';
import { Ride } from '@modules/cab/types';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { useRiderRides } from '../store/riderRideStore';

const P = jinniColors.purple;
const G = jinniColors.gold;

const STAGE: Record<string, string> = {
  accepted: 'Head to the pickup',
  arrived: 'Waiting for the customer',
  in_progress: 'Ride in progress',
  completed: 'Ride completed',
  cancelled: 'Ride cancelled',
  requested: 'Ride handed back',
};

/** The rider's single-ride workflow: navigate → arrived → start → navigate → complete → collect. */
export const RiderRideScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { rideId } = useRoute<RouteProp<{ p: { rideId: string } }, 'p'>>().params;
  const refreshStore = useRiderRides((s) => s.refresh);
  const [ride, setRide] = useState<Ride | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [sosOpen, setSosOpen] = useState(false);

  const load = useCallback(async () => {
    try { setRide(await rideService.get(rideId)); } catch (e: any) { Alert.alert('Could not load ride', rideError(e)); }
  }, [rideId]);
  useEffect(() => { void load(); }, [load]);

  // The customer may cancel from their side — keep this screen honest.
  useEffect(() => {
    const t = setInterval(() => { if (ride && ['accepted', 'arrived', 'in_progress'].includes(ride.status)) void load(); }, 8000);
    return () => clearInterval(t);
  }, [ride?.status, load]);

  const act = async (fn: () => Promise<any>) => {
    if (busy) return;
    setBusy(true);
    try {
      const out = await fn();
      if (out && out.id) setRide(out as Ride); else await load();
      void refreshStore();
    } catch (e: any) {
      Alert.alert('Could not update', rideError(e));
      void load();
    } finally {
      setBusy(false);
    }
  };

  const complete = () => {
    if (!ride) return;
    const cash = ride.payment_method === 'cash';
    Alert.alert(
      cash ? `Collect ₹${ride.fare.toFixed(0)} cash` : `UPI ₹${ride.fare.toFixed(0)}`,
      cash ? 'Did the customer hand you the fare?' : 'Has the UPI payment reached you?',
      [
        { text: 'Not yet', onPress: () => act(() => rideService.complete(ride.id, false)) },
        { text: cash ? 'Cash collected' : 'UPI received', onPress: () => act(() => rideService.complete(ride.id, true)) },
      ],
    );
  };

  const startWithCode = async () => {
    if (code.length !== 4 || !ride) return;
    setBusy(true);
    setCodeError('');
    try {
      setRide(await rideService.start(ride.id, code));
      setCodeOpen(false);
      void refreshStore();
    } catch (e: any) {
      setCodeError(rideError(e, 'That code didn’t work.'));
      setCode('');
      void load();
    } finally {
      setBusy(false);
    }
  };

  const handBack = () =>
    Alert.alert('Hand this ride back?', 'It goes to the other riders. Use this only if you cannot make it.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Hand back', style: 'destructive', onPress: async () => { await act(() => rideService.release(rideId)); navigation.goBack(); } },
    ]);

  if (!ride) return <ActivityIndicator style={{ marginTop: 100 }} color={P[500]} />;

  const s = ride.status;
  const live = ['accepted', 'arrived', 'in_progress'].includes(s);
  const customer = ride.customer;

  const primary =
    s === 'accepted' ? { label: "I've reached the pickup", run: () => act(() => rideService.arrived(ride.id)) }
    : s === 'arrived' ? { label: 'Enter ride code & start', run: () => { setCode(''); setCodeError(''); setCodeOpen(true); } }
    : s === 'in_progress' ? { label: 'Complete ride', run: complete }
    : null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[P[900], P[600]]} style={styles.hero}>
        <SafeAreaView edges={['top']}>
          <View style={styles.top}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={22} color="#fff" /></TouchableOpacity>
            <Text style={styles.num}>#{ride.ride_number}</Text>
            {live ? (
              <TouchableOpacity style={styles.sosBtn} onPress={() => setSosOpen(true)} accessibilityLabel="Emergency SOS">
                <Text style={styles.sosTxt}>SOS</Text>
              </TouchableOpacity>
            ) : <View style={{ width: 38 }} />}
          </View>
          <Text style={styles.stage}>{STAGE[s] ?? s}</Text>
          <Text style={styles.fare}>₹{ride.total_payable.toFixed(0)}</Text>
          <Text style={styles.meta}>{ride.distance_km.toFixed(1)} km · {ride.payment_method === 'cash' ? '💵 Cash' : '📲 UPI'} · {ride.vehicle_class}</Text>
          {(ride.boost_amount > 0 || ride.dues_amount > 0 || ride.surge_multiplier > 1) && (
            <Text style={styles.break}>
              {[ride.surge_multiplier > 1 ? `busy ×${ride.surge_multiplier.toFixed(2).replace(/\.?0+$/, '')}` : '', ride.boost_amount > 0 ? `+₹${ride.boost_amount.toFixed(0)} added by customer` : '', ride.dues_amount > 0 ? `incl. ₹${ride.dues_amount.toFixed(0)} earlier cancellation charge` : ''].filter(Boolean).join(' · ')}
            </Text>
          )}
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {customer && (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{(customer.name || 'C')[0].toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{customer.name || 'Customer'}</Text>
                {!!customer.phone && <Text style={styles.sub}>{customer.phone}</Text>}
              </View>
              {!!customer.phone && live && (
                <TouchableOpacity style={styles.call} onPress={() => callPhone(customer.phone)}><Ionicons name="call" size={20} color="#fff" /></TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={styles.card}>
          <RouteLine
            pickup={ride.pickup.text}
            drop={ride.drop.text}
            onPickupNav={live ? () => openInGoogleMaps(ride.pickup.lat, ride.pickup.lng, ride.pickup.maps_url) : undefined}
            onDropNav={live ? () => openInGoogleMaps(ride.drop.lat, ride.drop.lng, ride.drop.maps_url) : undefined}
          />
        </View>

        {s === 'completed' && (
          <View style={styles.card}>
            <Text style={styles.name}>{ride.payment_status === 'paid' ? '✅ Payment received' : '⏳ Payment pending'}</Text>
            <Text style={styles.sub}>
              {ride.payment_method === 'cash' ? 'Cash to be collected from the customer.' : 'Waiting for the customer’s UPI payment.'}
            </Text>
            {ride.payment_status !== 'paid' && (
              <TouchableOpacity style={styles.confirm} onPress={() => act(() => rideService.confirmPayment(ride.id))} disabled={busy}>
                <Text style={styles.confirmTxt}>{ride.payment_method === 'cash' ? 'Cash collected' : 'UPI received'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {(s === 'accepted' || s === 'arrived') && (
          <TouchableOpacity onPress={handBack} style={styles.handBack}><Text style={styles.handBackTxt}>Can't make it? Hand back</Text></TouchableOpacity>
        )}
        {s === 'cancelled' && <Text style={styles.cancelled}>This ride was cancelled{ride.cancel_reason ? `: ${ride.cancel_reason}` : '.'}</Text>}
      </ScrollView>

      <Modal visible={codeOpen} transparent animationType="fade" onRequestClose={() => setCodeOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCodeOpen(false)}>
          <Pressable style={styles.codeBox} onPress={() => undefined}>
            <Text style={styles.codeTitle}>Enter the customer’s ride code</Text>
            <Text style={styles.codeSub}>Ask the passenger for the 4-digit code in their app — it confirms the right person boarded.</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 4)); setCodeError(''); }}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="• • • •"
              placeholderTextColor="#D0D5DD"
              autoFocus
            />
            {!!codeError && <Text style={styles.codeErr}>{codeError}</Text>}
            <TouchableOpacity style={[styles.codeBtn, code.length !== 4 && { opacity: 0.4 }]} onPress={startWithCode} disabled={code.length !== 4 || busy}>
              {busy ? <ActivityIndicator color={P[900]} /> : <Text style={styles.codeBtnTxt}>Start ride</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <SOSSheet visible={sosOpen} ride={ride} helpline="112" as="rider" onClose={() => setSosOpen(false)} />

      {primary && (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <TouchableOpacity onPress={primary.run} disabled={busy} activeOpacity={0.9}>
            <LinearGradient colors={[G[400], G[500]]} style={styles.cta}>
              {busy ? <ActivityIndicator color={P[900]} /> : <Text style={styles.ctaTxt}>{primary.label}</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </SafeAreaView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF9FF' },
  hero: { paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  sosBtn: { minWidth: 46, height: 34, borderRadius: 17, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  sosTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 13, letterSpacing: 1 },
  break: { color: G[200], fontFamily: fontFamily.medium, fontSize: 11, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  codeBox: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 22 },
  codeTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: P[900] },
  codeSub: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', marginTop: 4, marginBottom: 14 },
  codeInput: { fontFamily: fontFamily.bold, fontSize: 40, letterSpacing: 10, textAlign: 'center', color: P[800], borderBottomWidth: 2, borderBottomColor: P[200], paddingVertical: 8 },
  codeErr: { color: '#D92D20', fontFamily: fontFamily.medium, fontSize: 13, textAlign: 'center', marginTop: 8 },
  codeBtn: { marginTop: 18, backgroundColor: G[400], paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  codeBtnTxt: { color: P[900], fontFamily: fontFamily.bold, fontSize: 16 },
  num: { color: G[200], fontFamily: fontFamily.bold, letterSpacing: 1.5, fontSize: 13 },
  stage: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 18, textAlign: 'center', marginTop: 8 },
  fare: { color: G[300], fontFamily: fontFamily.bold, fontSize: 44, textAlign: 'center' },
  meta: { color: P[100], fontFamily: fontFamily.medium, fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: P[500], alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 18 },
  name: { fontFamily: fontFamily.bold, fontSize: 16, color: P[900] },
  sub: { fontFamily: fontFamily.regular, fontSize: 13, color: '#667085', marginTop: 2 },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#12B76A', alignItems: 'center', justifyContent: 'center' },
  confirm: { marginTop: 12, backgroundColor: P[600], paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  confirmTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 15 },
  handBack: { alignItems: 'center', paddingVertical: 12 },
  handBackTxt: { color: '#B42318', fontFamily: fontFamily.semiBold },
  cancelled: { textAlign: 'center', color: '#B42318', fontFamily: fontFamily.medium, marginTop: 10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(251,249,255,0.96)' },
  cta: { height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { fontFamily: fontFamily.bold, fontSize: 17, color: P[900] },
});

export default RiderRideScreen;
