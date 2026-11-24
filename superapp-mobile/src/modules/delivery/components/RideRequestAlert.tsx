import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { navigationRef } from '@navigation/navigationRef';
import { RouteLine } from '@modules/cab/components/RouteLine';
import { rideError, rideService } from '@modules/cab/services/rideService';
import { Ride } from '@modules/cab/types';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { useRiderRides } from '../store/riderRideStore';

const P = jinniColors.purple;
const G = jinniColors.gold;
const SHOW_SECONDS = 45;

/** Full-screen "new ride" prompt for online partners (the deliveries have their own alert). */
export const RideRequestAlert: React.FC = () => {
  const { available, busy, refresh, drop } = useRiderRides();
  const [current, setCurrent] = useState<Ride | null>(null);
  const [left, setLeft] = useState(SHOW_SECONDS);
  const [working, setWorking] = useState(false);
  const dismissed = useRef<Set<string>>(new Set());

  // Surface the oldest request we haven't dealt with yet.
  useEffect(() => {
    if (current || busy) return;
    const next = available.find((r) => !dismissed.current.has(r.id));
    if (next) {
      setCurrent(next);
      setLeft(SHOW_SECONDS);
      Vibration.vibrate([0, 400, 200, 400]);
    }
  }, [available, current, busy]);

  // If the request disappears (taken / expired / cancelled) close the prompt.
  useEffect(() => {
    if (current && !available.some((r) => r.id === current.id) && !working) {
      setCurrent(null);
    }
  }, [available, current, working]);

  useEffect(() => {
    if (!current) return;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [current]);

  useEffect(() => {
    if (current && left <= 0) skip(false); // timed out: hide locally, leave it open for others
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { Vibration.cancel(); setCurrent(null); };

  const skip = async (explicit: boolean) => {
    if (!current) return;
    dismissed.current.add(current.id);
    const id = current.id;
    close();
    drop(id);
    if (explicit) { try { await rideService.reject(id); } catch { /* best effort */ } }
  };

  const accept = async () => {
    if (!current || working) return;
    setWorking(true);
    try {
      const ride = await rideService.accept(current.id);
      close();
      await refresh();
      if (navigationRef.isReady()) navigationRef.navigate('RiderRide', { rideId: ride.id });
    } catch (e: any) {
      Alert.alert('Could not accept', rideError(e));
      dismissed.current.add(current.id);
      close();
      await refresh();
    } finally {
      setWorking(false);
    }
  };

  if (!current) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => skip(true)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.badge}>🧞 NEW RIDE</Text>
            <Text style={styles.timer}>{Math.max(left, 0)}s</Text>
          </View>
          <Text style={styles.fare}>₹{current.fare.toFixed(0)}</Text>
          <Text style={styles.meta}>
            {current.distance_km.toFixed(1)} km · {current.payment_method === 'cash' ? '💵 Cash' : '📲 UPI'}
            {current.customer?.name ? ` · ${current.customer.name}` : ''}
          </Text>
          <View style={{ marginVertical: 16 }}>
            <RouteLine pickup={current.pickup.text} drop={current.drop.text} />
          </View>
          <TouchableOpacity style={styles.accept} onPress={accept} disabled={working} activeOpacity={0.9}>
            <Ionicons name="checkmark-circle" size={22} color={P[900]} />
            <Text style={styles.acceptTxt}>{working ? 'Accepting…' : 'Accept ride'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skip} onPress={() => skip(true)} disabled={working}>
            <Text style={styles.skipTxt}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(26,12,53,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 30 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { fontFamily: fontFamily.bold, color: P[500], letterSpacing: 1.5, fontSize: 12 },
  timer: { fontFamily: fontFamily.bold, color: '#B42318', fontSize: 14 },
  fare: { fontFamily: fontFamily.bold, fontSize: 42, color: P[800], marginTop: 4 },
  meta: { fontFamily: fontFamily.medium, fontSize: 13, color: '#667085' },
  accept: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: G[400], paddingVertical: 16, borderRadius: 16 },
  acceptTxt: { fontFamily: fontFamily.bold, fontSize: 17, color: P[900] },
  skip: { alignItems: 'center', paddingVertical: 14 },
  skipTxt: { fontFamily: fontFamily.semiBold, color: '#667085', fontSize: 15 },
});
