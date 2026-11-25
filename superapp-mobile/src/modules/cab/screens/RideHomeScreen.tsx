import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { CarpetArt } from '../components/CarpetArt';
import { FareReveal } from '../components/FareReveal';
import { rideError, rideService } from '../services/rideService';
import { useRideDraft } from '../store/rideDraftStore';
import { PayMethod, Ride, RideConfig, RidePlace } from '../types';

// The ride flow is a Jinni moment by design (user request: "full Jinni style"), so it uses the
// scoped Jinni palette instead of the generic cab blue.
const P = jinniColors.purple;
const G = jinniColors.gold;

export const RideHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { pickup, drop, payment, setDrop, setPickup, setPayment, swap, reset } = useRideDraft();
  const [config, setConfig] = useState<RideConfig | null>(null);
  const [active, setActive] = useState<Ride | null>(null);
  const [quote, setQuote] = useState<{ fare: number; km: number } | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [booking, setBooking] = useState(false);

  // Config + any live ride, refreshed whenever the screen regains focus.
  useFocusEffect(useCallback(() => {
    let alive = true;
    rideService.config().then((c) => alive && setConfig(c)).catch(() => undefined);
    rideService.active().then((r) => alive && setActive(r.ride)).catch(() => undefined);
    return () => { alive = false; };
  }, []));

  // Re-quote whenever both ends are chosen. Stale responses are dropped.
  useEffect(() => {
    setQuote(null);
    setQuoteError('');
    if (!pickup || !drop) return;
    let alive = true;
    setQuoting(true);
    rideService.estimate(pickup, drop)
      .then((r) => alive && setQuote({ fare: r.fare, km: r.distance_km }))
      .catch((e) => alive && setQuoteError(rideError(e, 'Could not price this trip.')))
      .finally(() => alive && setQuoting(false));
    return () => { alive = false; };
  }, [pickup, drop]);

  const spots = config?.places ?? [];
  const pickSpot = (p: RidePlace) => {
    const pt = { text: p.name, lat: p.lat, lng: p.lng };
    // Fill the drop first (the common case: "take me to…"), then the pickup.
    if (!drop) setDrop(pt); else if (!pickup) setPickup(pt); else setDrop(pt);
  };

  const book = async () => {
    if (!pickup || !drop || !quote || booking) return;
    setBooking(true);
    try {
      const ride = await rideService.book({ pickup, drop, payment_method: payment, expected_fare: quote.fare });
      reset();
      navigation.navigate('ActiveRide', { rideId: ride.id });
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      if (d?.code === 'fare_changed') {
        setQuote((q) => (q ? { ...q, fare: d.fare } : q));
        Alert.alert('Fare updated', d.message);
      } else {
        Alert.alert('Could not book', rideError(e));
      }
    } finally {
      setBooking(false);
    }
  };

  const riders = config?.riders_online ?? 0;
  const paused = config && !config.enabled;
  const canBook = !!quote && !booking && !paused;

  const pickupLabel = useMemo(() => pickup?.text ?? 'Choose pickup', [pickup]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={[P[900], P[700], P[500]]} style={styles.hero}>
          <SafeAreaView edges={['top']}>
            <View style={styles.heroTop}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.brand}>Jinni Carpet</Text>
              <TouchableOpacity onPress={() => navigation.navigate('RideHistory')} style={styles.iconBtn} accessibilityLabel="Ride history">
                <Ionicons name="time-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <CarpetArt stage="idle" height={132} />
            <Text style={styles.title}>Kahan chalna hai?</Text>
            <Text style={styles.subtitle}>
              {paused ? 'Carpets are resting right now. Please try later.'
                : riders > 0 ? `🧞 ${riders} carpet${riders > 1 ? 's' : ''} awake near you`
                : 'No carpet is awake right now — you can still make your wish'}
            </Text>
          </SafeAreaView>
        </LinearGradient>

        {active && (
          <TouchableOpacity style={styles.activeBanner} onPress={() => navigation.navigate('ActiveRide', { rideId: active.id })} activeOpacity={0.85}>
            <Ionicons name="sparkles" size={18} color={G[700]} />
            <Text style={styles.activeText}>Your ride is on · tap to see</Text>
            <Ionicons name="chevron-forward" size={18} color={G[700]} />
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <TouchableOpacity style={styles.field} onPress={() => navigation.navigate('PlacePicker', { mode: 'pickup' })} activeOpacity={0.8}>
            <View style={[styles.dot, { backgroundColor: G[500] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>PICKUP</Text>
              <Text style={[styles.fieldValue, !pickup && styles.placeholder]} numberOfLines={1}>{pickupLabel}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.divRow}>
            <View style={styles.divider} />
            <TouchableOpacity onPress={swap} style={styles.swap} disabled={!pickup && !drop} accessibilityLabel="Swap pickup and drop">
              <Ionicons name="swap-vertical" size={18} color={P[500]} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.field} onPress={() => navigation.navigate('PlacePicker', { mode: 'drop' })} activeOpacity={0.8}>
            <View style={[styles.dot, { backgroundColor: P[400] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>DROP</Text>
              <Text style={[styles.fieldValue, !drop && styles.placeholder]} numberOfLines={1}>{drop?.text ?? 'Where to?'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {spots.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Jinni Spots</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }}>
              {spots.map((p) => (
                <TouchableOpacity key={p.id} style={styles.spot} onPress={() => pickSpot(p)} activeOpacity={0.8}>
                  <Text style={styles.spotIcon}>{p.icon || '📍'}</Text>
                  <Text style={styles.spotName} numberOfLines={2}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {quoting && <ActivityIndicator style={{ marginTop: 24 }} color={P[500]} />}
        {!!quoteError && (
          <View style={[styles.section, styles.errorBox]}>
            <Ionicons name="alert-circle-outline" size={18} color="#B42318" />
            <Text style={styles.errorText}>{quoteError}</Text>
          </View>
        )}
        {quote && (
          <View style={styles.section}>
            <FareReveal fare={quote.fare} km={quote.km} />
            <Text style={styles.sectionTitle2}>How will you pay?</Text>
            <View style={styles.payRow}>
              {([['cash', 'cash-outline', 'Cash', 'Pay the rider'], ['upi', 'qr-code-outline', 'UPI', 'Pay after the ride']] as [PayMethod, any, string, string][]).map(([m, icon, t, s]) => (
                <TouchableOpacity key={m} style={[styles.pay, payment === m && styles.payOn]} onPress={() => setPayment(m)} activeOpacity={0.85}>
                  <Ionicons name={icon} size={20} color={payment === m ? P[600] : '#667085'} />
                  <Text style={[styles.payTitle, payment === m && { color: P[700] }]}>{t}</Text>
                  <Text style={styles.paySub}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity disabled={!canBook} onPress={book} activeOpacity={0.9} style={{ opacity: canBook ? 1 : 0.45 }}>
          <LinearGradient colors={[G[400], G[500]]} style={styles.cta}>
            {booking ? <ActivityIndicator color={P[900]} /> : (
              <Text style={styles.ctaText}>{quote ? `Summon my carpet · ₹${quote.fare}` : 'Pick pickup & drop'}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF9FF' },
  hero: { paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  brand: { color: G[200], fontFamily: fontFamily.bold, fontSize: 15, letterSpacing: 2 },
  title: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 26, textAlign: 'center', marginTop: 4 },
  subtitle: { color: P[100], fontFamily: fontFamily.medium, fontSize: 13, textAlign: 'center', marginTop: 4, paddingHorizontal: 24 },
  activeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: G[100], borderWidth: 1, borderColor: G[200] },
  activeText: { flex: 1, fontFamily: fontFamily.semiBold, color: G[800], fontSize: 13 },
  card: { marginHorizontal: 16, marginTop: -14, backgroundColor: '#fff', borderRadius: 22, padding: 6, shadowColor: P[900], shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  fieldLabel: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 1.5, color: P[400] },
  fieldValue: { fontFamily: fontFamily.semiBold, fontSize: 16, color: P[900], marginTop: 1 },
  placeholder: { color: '#98A2B3', fontFamily: fontFamily.medium },
  divRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 36, paddingRight: 12 },
  divider: { flex: 1, height: 1, backgroundColor: '#EEE8F8' },
  swap: { width: 34, height: 34, borderRadius: 17, backgroundColor: P[50], alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  section: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: P[800], marginBottom: 10 },
  sectionTitle2: { fontFamily: fontFamily.bold, fontSize: 14, color: P[800], marginTop: 18, marginBottom: 10 },
  spot: { width: 108, padding: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: P[100] },
  spotIcon: { fontSize: 22 },
  spotName: { fontFamily: fontFamily.semiBold, fontSize: 12, color: P[800], marginTop: 6 },
  errorBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FEF3F2', alignItems: 'center' },
  errorText: { flex: 1, color: '#B42318', fontFamily: fontFamily.medium, fontSize: 13 },
  payRow: { flexDirection: 'row', gap: 12 },
  pay: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EAECF0' },
  payOn: { borderColor: P[400], backgroundColor: P[50] },
  payTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: '#344054', marginTop: 6 },
  paySub: { fontFamily: fontFamily.regular, fontSize: 11, color: '#667085', marginTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(251,249,255,0.96)' },
  cta: { height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: P[900], fontFamily: fontFamily.bold, fontSize: 16 },
});

export default RideHomeScreen;
