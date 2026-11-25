import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { CarpetArt } from '../components/CarpetArt';
import { FareReveal } from '../components/FareReveal';
import { InfoTip } from '../components/InfoTip';
import { carpetsLine, vehicleFreeLabel } from '../carpetsLine';
import { rideError, rideService } from '../services/rideService';
import { useRideDraft } from '../store/rideDraftStore';
import { PayMethod, Quote, Ride, RideConfig, RidePlace, VehicleClass } from '../types';

// The ride flow is a Jinni moment by design (user request: "full Jinni style"), so it uses the
// scoped Jinni palette instead of the generic cab blue.
const P = jinniColors.purple;
const G = jinniColors.gold;
const VEHICLE_ICON: Record<VehicleClass, string> = { bike: '🛵', auto: '🛺', cab: '🚕' };

type QuoteMap = Partial<Record<VehicleClass, Quote>>;

export const RideHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { pickup, drop, payment, vehicle, setDrop, setPickup, setPayment, setVehicle, swap, reset } = useRideDraft();
  const [config, setConfig] = useState<RideConfig | null>(null);
  const [active, setActive] = useState<Ride | null>(null);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [booking, setBooking] = useState(false);
  const here = useRef<{ lat: number; lng: number } | null>(null);
  const prefilled = useRef(false);

  // Config (nearest-first spots, rider counts) + any live ride, refreshed whenever the screen regains focus.
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      // Use the location only if the user already allowed it — never prompt just to open this screen.
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
          if (pos) here.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch { /* location is optional here */ }
      const cfg = await rideService.config(here.current?.lat, here.current?.lng).catch(() => null);
      if (!alive) return;
      if (cfg) setConfig(cfg);
      // First visit: pre-fill pickup with where the customer is standing.
      if (!prefilled.current && here.current && !useRideDraft.getState().pickup) {
        prefilled.current = true;
        let text = 'Current location';
        try {
          const [a] = await Location.reverseGeocodeAsync({ latitude: here.current.lat, longitude: here.current.lng });
          const parts = [a?.name, a?.district || a?.subregion].filter(Boolean);
          if (parts.length) text = Array.from(new Set(parts)).join(', ');
        } catch { /* generic label is fine */ }
        if (alive && !useRideDraft.getState().pickup) setPickup({ text, lat: here.current.lat, lng: here.current.lng });
      }
    })();
    rideService.active().then((r) => alive && setActive(r.ride)).catch(() => undefined);
    return () => { alive = false; };
  }, [setPickup]));

  // Re-quote every enabled vehicle when both ends are chosen. Stale responses are dropped.
  useEffect(() => {
    setQuotes({});
    setQuoteError('');
    if (!pickup || !drop || !config) return;
    let alive = true;
    setQuoting(true);
    const classes = config.vehicles.filter((v) => v.enabled).map((v) => v.vehicle_class);
    Promise.allSettled(classes.map((vc) => rideService.estimate(pickup, drop, vc))).then((res) => {
      if (!alive) return;
      const next: QuoteMap = {};
      let firstErr = '';
      res.forEach((r, i) => {
        if (r.status === 'fulfilled') next[classes[i]] = r.value; else if (!firstErr) firstErr = rideError((r as any).reason, 'Could not price this trip.');
      });
      setQuotes(next);
      setQuoteError(Object.keys(next).length ? '' : firstErr);
      setQuoting(false);
    });
    return () => { alive = false; };
  }, [pickup, drop, config]);

  const spots = config?.places ?? [];
  const pickSpot = (p: RidePlace) => {
    const pt = { text: p.name, lat: p.lat, lng: p.lng };
    // Fill the drop first (the common case: "take me to…"), then the pickup.
    if (!drop) setDrop(pt); else if (!pickup) setPickup(pt); else setDrop(pt);
  };

  const quote = quotes[vehicle];
  const vinfo = config?.vehicles.find((v) => v.vehicle_class === vehicle);

  const book = async () => {
    if (!pickup || !drop || !quote || booking) return;
    setBooking(true);
    try {
      const ride = await rideService.book({ pickup, drop, vehicle_class: vehicle, payment_method: payment, expected_fare: quote.fare });
      reset();
      navigation.navigate('ActiveRide', { rideId: ride.id });
    } catch (e: any) {
      const d = e?.response?.data?.detail;
      if (d?.code === 'fare_changed') {
        setQuotes((q) => ({ ...q, [vehicle]: { ...quote, fare: d.fare, total_payable: d.fare + quote.dues_amount } }));
        Alert.alert('Fare updated', d.message);
      } else {
        Alert.alert('Could not book', rideError(e));
      }
    } finally {
      setBooking(false);
    }
  };

  const paused = !!config && !config.enabled;
  const outside = config?.service_area?.inside === false;
  const canBook = !!quote && !booking && !paused;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
            <CarpetArt stage="idle" height={124} />
            <Text style={styles.title}>Make a wish. Take a ride.</Text>
            <Text style={styles.subtitle}>{carpetsLine(config?.riders_online ?? 0, paused)}</Text>
          </SafeAreaView>
        </LinearGradient>

        {outside && (
          <View style={[styles.section, styles.warnBox]}>
            <Ionicons name="location-outline" size={18} color="#B54708" />
            <Text style={styles.warnText}>Jinni Carpet isn't running at your current location yet. You can still book from a Jinni Spot inside our service area.</Text>
          </View>
        )}

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
              <Text style={[styles.fieldValue, !pickup && styles.placeholder]} numberOfLines={1}>{pickup?.text ?? 'Choose pickup'}</Text>
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
            <Text style={styles.sectionTitle}>Jinni Spots{here.current ? ' · nearest first' : ''}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }}>
              {spots.slice(0, 14).map((p) => (
                <TouchableOpacity key={p.id} style={styles.spot} onPress={() => pickSpot(p)} activeOpacity={0.8}>
                  <Text style={styles.spotIcon}>{p.icon || '📍'}</Text>
                  <Text style={styles.spotName} numberOfLines={2}>{p.name}</Text>
                  {p.distance_km != null && <Text style={styles.spotDist}>{p.distance_km < 10 ? p.distance_km.toFixed(1) : Math.round(p.distance_km)} km</Text>}
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

        {!!config && !!pickup && !!drop && Object.keys(quotes).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose your carpet</Text>
            <View style={styles.vehRow}>
              {config.vehicles.filter((v) => v.enabled).map((v) => {
                const q = quotes[v.vehicle_class];
                const on = vehicle === v.vehicle_class;
                return (
                  <TouchableOpacity key={v.vehicle_class} style={[styles.veh, on && styles.vehOn, !q && { opacity: 0.4 }]}
                    disabled={!q} onPress={() => setVehicle(v.vehicle_class)} activeOpacity={0.85}>
                    <Text style={styles.vehIcon}>{VEHICLE_ICON[v.vehicle_class]}</Text>
                    <Text style={[styles.vehName, on && { color: P[700] }]}>{v.label}</Text>
                    <Text style={styles.vehPrice}>{q ? `₹${q.fare}` : '—'}</Text>
                    <Text style={[styles.vehFree, v.riders_online === 0 && { color: '#B54708' }]}>{vehicleFreeLabel(v.riders_online)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {quote && (
          <View style={styles.section}>
            {quote.surge_multiplier > 1 && (
              <View style={styles.surge}>
                <Ionicons name="flash" size={16} color="#B54708" />
                <Text style={styles.surgeText}>{quote.surge_reason || 'Busy time'} · fares ×{quote.surge_multiplier.toFixed(2).replace(/\.?0+$/, '')}</Text>
                <InfoTip color="#B54708" title="Why is the fare higher?"
                  message={`${quote.surge_reason || 'Busy time'}: more people want rides than usual, so fares are ×${quote.surge_multiplier.toFixed(2)} right now (normal fare ₹${quote.base_fare_no_surge}). The price you see is the price you pay — it won't change after you book. It drops back as demand eases.`} />
              </View>
            )}
            <FareReveal fare={quote.fare} km={quote.distance_km} />
            {quote.dues_amount > 0 && (
              <View style={styles.duesRow}>
                <Text style={styles.duesLbl}>Earlier cancellation charge</Text>
                <InfoTip title="Why this charge?" message={`You cancelled a ride after a rider was already on the way. That small fee (₹${quote.dues_amount.toFixed(0)}) is added to your next ride, so you pay it only once. You can see it in Profile → Ride charges.`} />
                <Text style={styles.duesAmt}>+ ₹{quote.dues_amount.toFixed(0)}</Text>
              </View>
            )}
            {quote.dues_amount > 0 && (
              <View style={styles.duesRow}>
                <Text style={[styles.duesLbl, { fontFamily: fontFamily.bold, color: P[800] }]}>Total to pay</Text>
                <Text style={[styles.duesAmt, { color: P[800], fontSize: 16 }]}>₹{quote.total_payable.toFixed(0)}</Text>
              </View>
            )}
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
              <Text style={styles.ctaText}>{quote ? `Summon my ${vinfo?.label ?? 'carpet'} · ₹${quote.total_payable.toFixed(0)}` : 'Pick pickup & drop'}</Text>
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
  title: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 25, textAlign: 'center', marginTop: 4, paddingHorizontal: 16 },
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
  spotDist: { fontFamily: fontFamily.medium, fontSize: 10, color: '#98A2B3', marginTop: 2 },
  errorBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FEF3F2', alignItems: 'center' },
  errorText: { flex: 1, color: '#B42318', fontFamily: fontFamily.medium, fontSize: 13 },
  warnBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFFAEB', alignItems: 'center' },
  warnText: { flex: 1, color: '#B54708', fontFamily: fontFamily.medium, fontSize: 12 },
  vehRow: { flexDirection: 'row', gap: 10 },
  veh: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EAECF0' },
  vehOn: { borderColor: P[400], backgroundColor: P[50] },
  vehIcon: { fontSize: 26 },
  vehName: { fontFamily: fontFamily.bold, fontSize: 13, color: '#344054', marginTop: 2 },
  vehPrice: { fontFamily: fontFamily.bold, fontSize: 17, color: P[800], marginTop: 2 },
  vehFree: { fontFamily: fontFamily.medium, fontSize: 10, color: '#667085', marginTop: 2 },
  surge: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 12, backgroundColor: '#FFFAEB', marginBottom: 10 },
  surgeText: { flex: 1, color: '#B54708', fontFamily: fontFamily.semiBold, fontSize: 12 },
  duesRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 },
  duesLbl: { flex: 1, fontFamily: fontFamily.medium, fontSize: 13, color: '#475467' },
  duesAmt: { fontFamily: fontFamily.semiBold, fontSize: 14, color: '#B54708' },
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
