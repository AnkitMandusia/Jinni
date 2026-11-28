import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useOrderRealtime } from '@shared/hooks/useOrderRealtime';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { CarpetArt, CarpetStage } from '../components/CarpetArt';
import { CarpetProgress } from '../components/CarpetProgress';
import { InfoTip } from '../components/InfoTip';
import { RouteLine } from '../components/RouteLine';
import { SOSSheet } from '../components/SOSSheet';
import { callPhone } from '../openMaps';
import { rideError, rideService } from '../services/rideService';
import { Ride, RideConfig, RideStatus, isClosed } from '../types';

const P = jinniColors.purple;
const G = jinniColors.gold;
const WAIT_BEFORE_NUDGE = 40; // seconds before we highlight "add to fare"

const COPY: Record<RideStatus, { stage: CarpetStage; title: string; sub: string }> = {
  requested: { stage: 'idle', title: 'Finding your carpet…', sub: 'Waking up the nearest rider.' },
  accepted: { stage: 'takeoff', title: 'Your carpet is on the way', sub: 'Your rider is heading to the pickup point.' },
  arrived: { stage: 'arrived', title: 'Carpet has landed 📍', sub: 'Your rider is at the pickup point.' },
  in_progress: { stage: 'takeoff', title: 'Enjoy the flight ✨', sub: 'Sit back — you are on your way.' },
  completed: { stage: 'arrived', title: 'Wish fulfilled!', sub: 'Hope you enjoyed the ride.' },
  cancelled: { stage: 'idle', title: 'Ride cancelled', sub: '' },
  expired: { stage: 'idle', title: 'No carpet was free', sub: 'Nobody could take this ride in time. Add to the fare or try again.' },
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
  const [config, setConfig] = useState<RideConfig | null>(null);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<string>('changed_plan');
  const [cancelling, setCancelling] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);
  const [boosting, setBoosting] = useState<number | null>(null);
  const [waited, setWaited] = useState(0);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(false);
  const maxDist = useRef(0);

  const load = useCallback(async () => {
    try {
      setRide(await rideService.get(rideId));
      setError('');
    } catch (e: any) {
      setError(rideError(e));
    }
  }, [rideId]);

  useEffect(() => { rideService.config().then(setConfig).catch(() => undefined); }, []);

  useEffect(() => {
    if (!focused) return;
    void load();
    const fast = !ride || ride.status === 'requested' || ride.status === 'accepted' || ride.status === 'in_progress';
    // Poll as the safety net; the websocket below makes updates feel instant.
    const t = setInterval(() => { if (!ride || !isClosed(ride.status) || ride.payment_status !== 'paid') void load(); }, fast ? 5000 : 8000);
    return () => clearInterval(t);
  }, [focused, load, ride?.status, ride?.payment_status]);

  useOrderRealtime((evt) => { if (evt.event === 'ride.status_updated') void load(); }, rideId);

  // seconds since the (latest) request — restarts when the fare is boosted
  useEffect(() => {
    if (ride?.status !== 'requested') return;
    const tick = () => setWaited(Math.max(0, Math.floor((Date.now() - new Date((ride.requested_at || '') + 'Z').getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [ride?.status, ride?.requested_at]);

  const loc = ride?.rider_location;
  if (loc && loc.distance_km > maxDist.current) maxDist.current = loc.distance_km;
  if (ride?.status === 'requested') maxDist.current = 0;

  const boost = async (amount: number) => {
    setBoosting(amount);
    try { setRide(await rideService.boost(rideId, amount)); } catch (e: any) { Alert.alert('Could not add to fare', rideError(e)); void load(); } finally { setBoosting(null); }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      setRide(await rideService.cancel(rideId, reason));
      setCancelOpen(false);
    } catch (e: any) {
      Alert.alert('Cannot cancel', rideError(e));
      setCancelOpen(false);
      void load();
    } finally {
      setCancelling(false);
    }
  };

  const payUpi = async () => {
    if (!ride?.upi) return;
    try {
      await Linking.openURL(ride.upi.link);
    } catch {
      Alert.alert('No UPI app found', `Pay ₹${ride.total_payable.toFixed(0)} to ${ride.upi.vpa} from any UPI app, then tell your rider.`);
    }
  };

  const submitRating = async () => {
    if (!stars || rating) return;
    setRating(true);
    try { setRide(await rideService.rate(rideId, stars, comment.trim() || undefined)); } catch (e: any) { Alert.alert('Could not submit', rideError(e)); } finally { setRating(false); }
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
  const live = ['accepted', 'arrived', 'in_progress'].includes(ride.status);
  const stepIdx = STEPS.findIndex((s) => s.key === ride.status);
  const canCancel = ['requested', 'accepted', 'arrived'].includes(ride.status);
  const rd = ride.rider;
  const reasons = config?.cancel_reasons ?? [{ code: 'changed_plan', label: 'Changed my plan', rider_fault: false }];
  const chosen = reasons.find((r) => r.code === reason);
  const feeIfCancel = ride.cancel_info && !chosen?.rider_fault ? ride.cancel_info.fee : 0;
  const boostOptions = config?.boost_options ?? [];
  const boostLeft = Math.max(0, 50 - ride.boost_amount); // server enforces the real cap

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={failed ? ['#344054', '#475467'] : [P[900], P[700], P[500]]} style={styles.hero}>
          <SafeAreaView edges={['top']}>
            <View style={styles.top}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('RideHome')} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.num}>#{ride.ride_number}</Text>
              {live ? (
                <TouchableOpacity style={styles.sosBtn} onPress={() => setSosOpen(true)} accessibilityLabel="Emergency SOS">
                  <Text style={styles.sosTxt}>SOS</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 38 }} />}
            </View>
            <CarpetArt stage={c.stage} height={132} lift={ride.status === 'in_progress' ? 12 : 6} />
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

        {/* Waiting for a rider: boost the fare (Rapido/Uber-style) */}
        {(ride.status === 'requested' || ride.status === 'expired') && boostOptions.length > 0 && (
          <View style={[styles.card, waited >= WAIT_BEFORE_NUDGE || ride.status === 'expired' ? styles.nudge : null]}>
            <Text style={styles.cardTitle}>
              {ride.status === 'expired' ? 'No rider yet?' : waited >= WAIT_BEFORE_NUDGE ? 'Taking longer than usual?' : 'Want a rider faster?'}
            </Text>
            <Text style={styles.cardSub}>
              {ride.status === 'expired' ? 'Book again and add a little to the fare.' : 'Add to your fare — riders see the higher amount and your request is sent again.'}
              {ride.status === 'requested' ? `  (waiting ${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, '0')})` : ''}
            </Text>
            {ride.status === 'requested' && (
              <View style={styles.boostRow}>
                {boostOptions.map((a) => (
                  <TouchableOpacity key={a} style={[styles.boostBtn, a > boostLeft && { opacity: 0.35 }]} disabled={a > boostLeft || boosting !== null} onPress={() => boost(a)}>
                    {boosting === a ? <ActivityIndicator size="small" color={P[700]} /> : <Text style={styles.boostTxt}>+ ₹{a}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Free live status: rider phone GPS -> distance & ETA (no map, no paid API) */}
        {live && loc && (
          <View style={styles.card}>
            <CarpetProgress
              progress={ride.status === 'in_progress' ? (loc.progress ?? 0) : maxDist.current > 0 ? 1 - loc.distance_km / maxDist.current : 0}
              from={ride.status === 'in_progress' ? ride.pickup.text : 'Rider'}
              to={ride.status === 'in_progress' ? ride.drop.text : ride.pickup.text}
              line={loc.distance_km < 0.15 ? (ride.status === 'in_progress' ? 'Almost there!' : 'Your rider is right here') :
                `${loc.distance_km.toFixed(1)} km ${ride.status === 'in_progress' ? 'to go' : 'away'} · ~${loc.eta_min} min`}
            />
          </View>
        )}

        {/* The start code — only the customer sees it */}
        {!!ride.start_code && (
          <View style={[styles.card, styles.codeCard]}>
            <Text style={styles.codeLbl}>YOUR RIDE CODE</Text>
            <Text style={styles.code}>{ride.start_code.split('').join(' ')}</Text>
            <Text style={styles.codeHint}>Tell this code to your rider <Text style={{ fontFamily: fontFamily.bold }}>only when you board</Text>. The ride starts when they enter it.</Text>
          </View>
        )}

        {rd && (
          <View style={styles.card}>
            <View style={styles.riderRow}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{(rd.name || 'R')[0].toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.riderName}>{rd.name || 'Your rider'}</Text>
                <Text style={styles.riderMeta}>
                  {rd.rating_count ? `★ ${rd.rating?.toFixed(1)} · ${rd.rating_count} rides` : '★ New rider'}
                </Text>
              </View>
              {!!rd.phone && !closed && (
                <TouchableOpacity style={styles.call} onPress={() => callPhone(rd.phone)} accessibilityLabel="Call rider">
                  <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
            {(rd.vehicle_number || rd.vehicle_make_model) && (
              <View style={styles.vehRow}>
                {!!rd.vehicle_number && <View style={styles.plate}><Text style={styles.plateTxt}>{rd.vehicle_number}</Text></View>}
                <Text style={styles.vehTxt} numberOfLines={1}>{[rd.vehicle_make_model, rd.vehicle_color].filter(Boolean).join(' · ')}</Text>
              </View>
            )}
            {!!rd.phone && <Text style={styles.phone}>{rd.phone}</Text>}
          </View>
        )}

        <View style={styles.card}>
          <RouteLine pickup={ride.pickup.text} drop={ride.drop.text} />
        </View>

        <View style={styles.card}>
          <View style={styles.fareRow}>
            <Text style={styles.fareLbl}>Fare · {ride.distance_km.toFixed(1)} km</Text>
            <Text style={styles.fareAmt}>₹{(ride.fare - ride.boost_amount).toFixed(0)}</Text>
          </View>
          {ride.surge_multiplier > 1 && (
            <View style={styles.lineRow}>
              <Text style={styles.lineLbl}>Includes busy-time pricing ×{ride.surge_multiplier.toFixed(2).replace(/\.?0+$/, '')}</Text>
              <InfoTip title="Busy-time pricing" message="More people wanted rides when you booked, so the fare was higher. It was shown to you before you booked and stays fixed." />
            </View>
          )}
          {ride.boost_amount > 0 && (
            <View style={styles.lineRow}><Text style={styles.lineLbl}>Added by you to find a rider faster</Text><Text style={styles.lineAmt}>+ ₹{ride.boost_amount.toFixed(0)}</Text></View>
          )}
          {ride.dues_amount > 0 && (
            <View style={styles.lineRow}>
              <Text style={styles.lineLbl}>Earlier cancellation charge</Text>
              <InfoTip title="Why this charge?" message={`You cancelled an earlier ride after a rider was on the way. The ₹${ride.dues_amount.toFixed(0)} fee is added here, once. See Profile → Ride charges.`} />
              <Text style={[styles.lineAmt, { marginLeft: 'auto' }]}>+ ₹{ride.dues_amount.toFixed(0)}</Text>
            </View>
          )}
          {!!ride.fare_adjusted_reason && <Text style={styles.adj}>Adjusted: {ride.fare_adjusted_reason}</Text>}
          <View style={[styles.fareRow, styles.totalRow]}>
            <Text style={[styles.fareLbl, { fontFamily: fontFamily.bold, color: P[900] }]}>Total</Text>
            <Text style={styles.fare}>₹{ride.total_payable.toFixed(0)}</Text>
          </View>
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
              <Text style={styles.upiTxt}>Pay ₹{ride.total_payable.toFixed(0)} with UPI</Text>
            </TouchableOpacity>
          )}
          {ride.upi && <Text style={styles.hint}>Pays {ride.upi.vpa}. Your rider confirms once it arrives.</Text>}
          {ride.status === 'cancelled' && ride.cancellation_fee > 0 && !ride.fee_waived && (
            <View style={styles.feeBox}>
              <Text style={styles.feeTxt}>Cancellation charge ₹{ride.cancellation_fee.toFixed(0)} will be added to your next ride or order.</Text>
              <InfoTip color="#B54708" title="Cancellation charge" message="You cancelled after a rider was already on the way (or had arrived). This small fee is added to your next ride or order — you only pay it once. You can view it in Profile → Ride charges." />
            </View>
          )}
        </View>

        {/* Rating after the ride */}
        {ride.status === 'completed' && (
          <View style={styles.card}>
            {ride.rating ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.cardTitle}>Thanks for rating {'★'.repeat(ride.rating)}</Text>
                {!!ride.rating_comment && <Text style={styles.cardSub}>“{ride.rating_comment}”</Text>}
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.cardTitle}>How was {rd?.name?.split(' ')[0] || 'your rider'}?</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setStars(n)} hitSlop={6}>
                      <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={34} color={n <= stars ? G[500] : '#D0D5DD'} />
                    </TouchableOpacity>
                  ))}
                </View>
                {stars > 0 && (
                  <>
                    <TextInput style={styles.commentInput} placeholder="Add a comment (optional)" placeholderTextColor="#98A2B3"
                      value={comment} onChangeText={setComment} maxLength={300} multiline />
                    <TouchableOpacity style={styles.submit} onPress={submitRating} disabled={rating} activeOpacity={0.9}>
                      {rating ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitTxt}>Submit rating</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {canCancel && (
          <TouchableOpacity style={styles.cancel} onPress={() => { setReason('changed_plan'); setCancelOpen(true); }}>
            <Text style={styles.cancelTxt}>Cancel ride</Text>
          </TouchableOpacity>
        )}
        {closed && (
          <TouchableOpacity style={styles.again} onPress={() => navigation.navigate('RideHome')} activeOpacity={0.9}>
            <Text style={styles.againTxt}>{failed ? 'Try again' : 'Book another ride'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Cancel with a reason (and an honest fee note) */}
      <Modal visible={cancelOpen} transparent animationType="slide" onRequestClose={() => setCancelOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCancelOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Why are you cancelling?</Text>
          {reasons.map((r) => (
            <TouchableOpacity key={r.code} style={styles.reasonRow} onPress={() => setReason(r.code)} activeOpacity={0.8}>
              <Ionicons name={reason === r.code ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === r.code ? P[500] : '#98A2B3'} />
              <Text style={styles.reasonTxt}>{r.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={[styles.feeNote, feeIfCancel > 0 ? { backgroundColor: '#FFFAEB' } : { backgroundColor: '#ECFDF3' }]}>
            <Text style={[styles.feeNoteTxt, { color: feeIfCancel > 0 ? '#B54708' : '#067647' }]}>
              {feeIfCancel > 0
                ? `Cancelling now costs ₹${feeIfCancel.toFixed(0)}. ${ride.cancel_info?.note ?? ''} It is added to your next ride or order.`
                : chosen?.rider_fault && (ride.cancel_info?.fee ?? 0) > 0 ? 'No charge — this isn’t on you.' : 'Free to cancel right now.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.confirmCancel} onPress={cancel} disabled={cancelling} activeOpacity={0.9}>
            {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmCancelTxt}>{feeIfCancel > 0 ? `Cancel & accept ₹${feeIfCancel.toFixed(0)} charge` : 'Cancel ride'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.keep} onPress={() => setCancelOpen(false)}><Text style={styles.keepTxt}>Keep my ride</Text></TouchableOpacity>
        </View>
      </Modal>

      <SOSSheet visible={sosOpen} ride={ride} helpline={config?.sos_helpline ?? '112'} as="customer" onClose={() => setSosOpen(false)} />
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
  sosBtn: { minWidth: 46, height: 34, borderRadius: 17, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  sosTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 13, letterSpacing: 1 },
  num: { color: G[200], fontFamily: fontFamily.bold, letterSpacing: 1.5, fontSize: 13 },
  title: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 22, textAlign: 'center', marginTop: 4 },
  sub: { color: P[100], fontFamily: fontFamily.medium, fontSize: 13, textAlign: 'center', marginTop: 4, paddingHorizontal: 28 },
  steps: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: '#fff', borderRadius: 18, padding: 12 },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#D0D5DD', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepLabel: { fontFamily: fontFamily.medium, fontSize: 9.5, color: '#98A2B3', textAlign: 'center' },
  card: { marginHorizontal: 16, marginTop: 14, backgroundColor: '#fff', borderRadius: 20, padding: 16 },
  nudge: { backgroundColor: '#FFFAEB', borderWidth: 1, borderColor: G[200] },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: P[900] },
  cardSub: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', marginTop: 4, textAlign: 'center' },
  boostRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  boostBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: G[400] },
  boostTxt: { fontFamily: fontFamily.bold, fontSize: 15, color: P[800] },
  codeCard: { alignItems: 'center', backgroundColor: P[50], borderWidth: 1, borderColor: P[100] },
  codeLbl: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 2, color: P[400] },
  code: { fontFamily: fontFamily.bold, fontSize: 40, color: P[800], letterSpacing: 4, marginVertical: 4 },
  codeHint: { fontFamily: fontFamily.regular, fontSize: 12, color: '#475467', textAlign: 'center' },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: P[500], alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 18 },
  riderName: { fontFamily: fontFamily.bold, fontSize: 16, color: P[900] },
  riderMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', marginTop: 1 },
  vehRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  plate: { backgroundColor: '#FDE047', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5, borderColor: '#101828' },
  plateTxt: { fontFamily: fontFamily.bold, fontSize: 14, color: '#101828', letterSpacing: 1 },
  vehTxt: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13, color: '#475467' },
  phone: { fontFamily: fontFamily.medium, fontSize: 13, color: P[600], marginTop: 10 },
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#12B76A', alignItems: 'center', justifyContent: 'center' },
  fareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  totalRow: { borderTopWidth: 1, borderTopColor: '#EAECF0', paddingTop: 10, marginTop: 4 },
  lineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  lineLbl: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', flexShrink: 1 },
  lineAmt: { fontFamily: fontFamily.semiBold, fontSize: 13, color: '#B54708', marginLeft: 'auto' },
  fareLbl: { fontFamily: fontFamily.medium, fontSize: 14, color: '#475467' },
  fareAmt: { fontFamily: fontFamily.semiBold, fontSize: 16, color: P[800] },
  fare: { fontFamily: fontFamily.bold, fontSize: 24, color: P[800] },
  adj: { fontFamily: fontFamily.regular, fontSize: 12, color: '#B54708', marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeOk: { backgroundColor: '#ECFDF3' },
  badgeWait: { backgroundColor: '#FFFAEB' },
  badgeTxt: { fontFamily: fontFamily.bold, fontSize: 11 },
  upiBtn: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: P[600], paddingVertical: 14, borderRadius: 14 },
  upiTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 15 },
  hint: { marginTop: 8, fontFamily: fontFamily.regular, fontSize: 11, color: '#667085', textAlign: 'center' },
  feeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFAEB', borderRadius: 12, padding: 10, marginTop: 8 },
  feeTxt: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, color: '#B54708' },
  starsRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  commentInput: { alignSelf: 'stretch', minHeight: 64, borderWidth: 1, borderColor: '#EAECF0', borderRadius: 12, padding: 10, textAlignVertical: 'top', fontFamily: fontFamily.regular, color: P[900] },
  submit: { alignSelf: 'stretch', marginTop: 10, backgroundColor: P[600], paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  submitTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 15 },
  cancel: { marginHorizontal: 16, marginTop: 18, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#FEF3F2' },
  cancelTxt: { color: '#B42318', fontFamily: fontFamily.bold, fontSize: 15 },
  again: { marginHorizontal: 16, marginTop: 18, paddingVertical: 16, borderRadius: 16, alignItems: 'center', backgroundColor: G[500] },
  againTxt: { color: P[900], fontFamily: fontFamily.bold, fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#EAECF0', marginBottom: 12 },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: P[900], marginBottom: 6 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  reasonTxt: { fontFamily: fontFamily.medium, fontSize: 14, color: '#344054', flex: 1 },
  feeNote: { borderRadius: 12, padding: 12, marginTop: 8 },
  feeNoteTxt: { fontFamily: fontFamily.medium, fontSize: 12 },
  confirmCancel: { marginTop: 14, backgroundColor: '#D92D20', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  confirmCancelTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 15 },
  keep: { alignItems: 'center', paddingVertical: 12 },
  keepTxt: { fontFamily: fontFamily.semiBold, color: P[600] },
});

export default ActiveRideScreen;
