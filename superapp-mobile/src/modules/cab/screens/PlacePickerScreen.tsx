import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { api } from '@services/api';
import { useLocationStore } from '@store/locationStore';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { rideService } from '../services/rideService';
import { useRideDraft } from '../store/rideDraftStore';
import { RidePlace } from '../types';

const P = jinniColors.purple;

type Row =
  | { kind: 'here' }
  | { kind: 'result'; id: string; text: string; subtitle?: string; lat: number; lng: number }
  | { kind: 'spot'; place: RidePlace }
  | { kind: 'saved'; id: string; text: string; lat: number; lng: number }
  | { kind: 'search'; query: string };

type Saved = { id?: string; label?: string; line1: string; city?: string; latitude?: number | null; longitude?: number | null };

/**
 * Picks a pickup/drop WITHOUT any paid maps API:
 *  - "Use my location": on-device GPS + the phone's own geocoder
 *  - Jinni Spots: admin-curated landmarks with exact coordinates
 *  - Saved addresses that already carry coordinates
 *  - Typed address: resolved by the phone's built-in geocoder (free)
 */
export const PlacePickerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<{ p: { mode: 'pickup' | 'drop' } }, 'p'>>();
  const mode = params?.mode ?? 'drop';
  const { setPickup, setDrop } = useRideDraft();
  const pincode = useLocationStore((s) => s.pincode);
  const [q, setQ] = useState('');
  const [spots, setSpots] = useState<RidePlace[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ text: string; subtitle?: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const here = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getLastKnownPositionAsync();
          if (pos) here.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch { /* nearest-first is a nicety */ }
      rideService.config(here.current?.lat, here.current?.lng).then((c) => setSpots(c.places)).catch(() => undefined);
    })();
    api.get<any>('/users/addresses').then((d) => setSaved(Array.isArray(d) ? d : d?.addresses || [])).catch(() => undefined);
  }, []);

  // Free OpenStreetMap search (via our cached, rate-limited server proxy), debounced while typing.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 3) { setRemote([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      rideService.searchPlaces(needle, here.current?.lat, here.current?.lng)
        .then((r) => alive && setRemote(r.results || []))
        .catch(() => alive && setRemote([]))
        .finally(() => alive && setSearching(false));
    }, 550);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const choose = (pt: { text: string; lat: number; lng: number }) => {
    (mode === 'pickup' ? setPickup : setDrop)(pt);
    navigation.goBack();
  };

  const useMyLocation = async () => {
    setBusy('here');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Location needed', 'Allow location to use your current position, or pick a Jinni Spot instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let text = 'My current location';
      try {
        const [a] = await Location.reverseGeocodeAsync(pos.coords);
        const parts = [a?.name, a?.district || a?.subregion, a?.city].filter(Boolean);
        if (parts.length) text = Array.from(new Set(parts)).join(', ');
      } catch { /* keep generic label */ }
      choose({ text, lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Could not get your location', 'Turn on GPS, or pick a Jinni Spot.');
    } finally {
      setBusy(null);
    }
  };

  const geocode = async (query: string) => {
    setBusy('search');
    try {
      const hits = await Location.geocodeAsync(pincode ? `${query}, ${pincode}` : query);
      if (!hits.length) {
        Alert.alert('Place not found', 'Try a nearby landmark, or pick a Jinni Spot.');
        return;
      }
      choose({ text: query, lat: hits[0].latitude, lng: hits[0].longitude });
    } catch {
      Alert.alert('Could not look that up', 'Try a Jinni Spot instead.');
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Row[] = [];
    if (!needle) out.push({ kind: 'here' });
    out.push(...spots
      .filter((p) => !needle || `${p.name} ${p.area || ''}`.toLowerCase().includes(needle))
      .map((place): Row => ({ kind: 'spot', place })));
    out.push(...remote.map((r, i): Row => ({ kind: 'result', id: `${i}`, ...r })));
    out.push(...saved
      .filter((a) => a.latitude != null && a.longitude != null && (!needle || `${a.label || ''} ${a.line1}`.toLowerCase().includes(needle)))
      .map((a, i): Row => ({ kind: 'saved', id: a.id || String(i), text: [a.label, a.line1].filter(Boolean).join(' · '), lat: a.latitude as number, lng: a.longitude as number })));
    if (needle.length >= 3) out.push({ kind: 'search', query: q.trim() });
    return out;
  }, [q, spots, saved, remote]);

  const render = ({ item }: { item: Row }) => {
    const Line = ({ icon, title, sub, onPress, loading }: any) => (
      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7} disabled={!!busy}>
        <View style={styles.iconWrap}>{loading ? <ActivityIndicator size="small" color={P[500]} /> : <Text style={styles.emoji}>{icon}</Text>}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={styles.sub} numberOfLines={1}>{sub}</Text>}
        </View>
      </TouchableOpacity>
    );
    if (item.kind === 'here') return <Line icon="📍" title="Use my current location" sub="GPS · free" onPress={useMyLocation} loading={busy === 'here'} />;
    if (item.kind === 'result') return <Line icon="🔎" title={item.text} sub={item.subtitle} onPress={() => choose({ text: item.text, lat: item.lat, lng: item.lng })} />;
    if (item.kind === 'spot') return <Line icon={item.place.icon || '📍'} title={item.place.name} sub={item.place.area} onPress={() => choose({ text: item.place.name, lat: item.place.lat, lng: item.place.lng })} />;
    if (item.kind === 'saved') return <Line icon="🏠" title={item.text} sub="Saved address" onPress={() => choose({ text: item.text, lat: item.lat, lng: item.lng })} />;
    return <Line icon="📱" title={`Try “${item.query}” on this phone`} sub="Uses your phone's built-in address search" onPress={() => geocode(item.query)} loading={busy === 'search'} />;
  };

  return (
    <View style={styles.root}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={P[400]} />
        <TextInput
          style={styles.input}
          placeholder={mode === 'pickup' ? 'Search pickup' : 'Search drop'}
          placeholderTextColor="#98A2B3"
          value={q}
          onChangeText={setQ}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => q.trim().length >= 3 && geocode(q.trim())}
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.kind === 'spot' ? r.place.id : r.kind === 'saved' ? `s-${r.id}` : r.kind === 'result' ? `r-${r.id}` : `${r.kind}-${i}`)}
        renderItem={render}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={searching ? <ActivityIndicator style={{ margin: 16 }} color={P[500]} /> : null}
        ListEmptyComponent={<Text style={styles.empty}>No matches. Type a landmark to search.</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF9FF' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: P[100] },
  input: { flex: 1, paddingVertical: 14, fontFamily: fontFamily.medium, fontSize: 15, color: P[900] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: P[50], alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 18 },
  title: { fontFamily: fontFamily.semiBold, fontSize: 15, color: P[900] },
  sub: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', marginTop: 1 },
  empty: { textAlign: 'center', color: '#98A2B3', marginTop: 40, fontFamily: fontFamily.regular },
});

export default PlacePickerScreen;
