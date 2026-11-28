import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily } from '@theme/typography';
import { rideError, rideService } from '../services/rideService';
import { Ride } from '../types';

type Props = {
  visible: boolean;
  ride: Ride;
  helpline: string;
  /** who is pressing: customer shares rider details, rider shares customer details */
  as: 'customer' | 'rider';
  onClose: () => void;
};

/** Real emergency tools: alert the Jinni desk (with GPS), call 112, share the trip with someone you trust, call the other person. */
export const SOSSheet: React.FC<Props> = ({ visible, ride, helpline, as, onClose }) => {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const other = as === 'customer' ? ride.rider : ride.customer;

  const alertSupport = async () => {
    setSending(true);
    try {
      let coords: { lat?: number; lng?: number } = {};
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = (await Location.getLastKnownPositionAsync()) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
          if (pos) coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch { /* send the alert even without GPS */ }
      await rideService.sos(ride.id, coords);
      setSent(true);
    } catch (e: any) {
      Alert.alert('Could not send alert', `${rideError(e)}\n\nIf you are in danger, call ${helpline} now.`);
    } finally {
      setSending(false);
    }
  };

  const share = () => {
    const rider = ride.rider;
    const who = as === 'customer'
      ? `Rider: ${rider?.name ?? '—'} ${rider?.phone ?? ''}\nVehicle: ${[rider?.vehicle_make_model, rider?.vehicle_color, rider?.vehicle_number].filter(Boolean).join(' · ')}`
      : `Passenger: ${ride.customer?.name ?? '—'} ${ride.customer?.phone ?? ''}`;
    void Share.share({ message: `I'm on a Jinni ride ${ride.ride_number}.\n${who}\nFrom: ${ride.pickup.text}\nTo: ${ride.drop.text}\nMaps: ${ride.drop.maps_url ?? ''}` });
  };

  const Row = ({ icon, title, sub, color, onPress, loading }: any) => (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={loading} activeOpacity={0.8}>
      <View style={[styles.iconWrap, { backgroundColor: color + '18' }]}>
        {loading ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={22} color={color} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>🚨 Emergency</Text>
        <Text style={styles.sub}>{sent ? 'Jinni support has been alerted with your ride and location. Stay on the line if they call.' : 'Pick what you need. In real danger, call 112 first.'}</Text>
        <Row icon="call" color="#B42318" title={`Call ${helpline}`} sub="Police / ambulance — free, 24×7" onPress={() => Linking.openURL(`tel:${helpline}`)} />
        <Row icon={sent ? 'checkmark-circle' : 'alert-circle'} color={sent ? '#12B76A' : '#D92D20'} loading={sending}
          title={sent ? 'Support alerted' : 'Alert Jinni support'} sub="Sends this ride + your location to our team" onPress={sent ? undefined : alertSupport} />
        <Row icon="share-social" color="#5E2FB8" title="Share ride details" sub="Send rider/vehicle and route to someone you trust" onPress={share} />
        {!!other?.phone && <Row icon="person" color="#175CD3" title={`Call ${as === 'customer' ? 'rider' : 'passenger'}`} sub={other.name || other.phone} onPress={() => Linking.openURL(`tel:${other.phone}`)} />}
        <TouchableOpacity style={styles.close} onPress={onClose}><Text style={styles.closeTxt}>Close</Text></TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#EAECF0', marginBottom: 12 },
  title: { fontFamily: fontFamily.bold, fontSize: 20, color: '#B42318' },
  sub: { fontFamily: fontFamily.regular, fontSize: 13, color: '#475467', marginTop: 4, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: '#101828' },
  rowSub: { fontFamily: fontFamily.regular, fontSize: 12, color: '#667085', marginTop: 1 },
  close: { alignItems: 'center', paddingVertical: 12 },
  closeTxt: { fontFamily: fontFamily.semiBold, color: '#667085' },
});
