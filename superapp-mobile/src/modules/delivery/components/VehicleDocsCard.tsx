import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@services/api';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';
import { dmyToIso, maskDate } from '@auth/utils/partnerKyc';

type P = {
  vehicle_class?: string | null; vehicle_number?: string | null; vehicle_make_model?: string | null; vehicle_color?: string | null;
  license_no?: string; dl_expiry?: string | null; rc_expiry?: string | null; insurance_expiry?: string | null;
  documents_verified?: boolean; kyc_issues?: string[]; rating?: number; rating_count?: number;
  emergency_name?: string | null; emergency_phone?: string | null;
};

const isoToDmy = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const daysLeft = (iso?: string | null) => (iso ? Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000) : null);

/** Vehicle + licence status for partners, with a gentle "renew soon" nudge and an in-app renewal form. */
export const VehicleDocsCard: React.FC<{ profile: P; onSaved: () => void }> = ({ profile, onSaved }) => {
  const [edit, setEdit] = useState(false);
  const [dl, setDl] = useState(isoToDmy(profile.dl_expiry));
  const [rc, setRc] = useState(isoToDmy(profile.rc_expiry));
  const [ins, setIns] = useState(isoToDmy(profile.insurance_expiry));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDl(isoToDmy(profile.dl_expiry)); setRc(isoToDmy(profile.rc_expiry)); setIns(isoToDmy(profile.insurance_expiry)); }, [profile.dl_expiry, profile.rc_expiry, profile.insurance_expiry]);

  const rows: [string, string | null | undefined][] = [
    ['Driving licence', profile.dl_expiry], ['Registration (RC)', profile.rc_expiry], ['Insurance', profile.insurance_expiry],
  ];

  const save = async () => {
    const body: Record<string, string> = {};
    for (const [k, v] of [['dl_expiry', dl], ['rc_expiry', rc], ['insurance_expiry', ins]] as const) {
      const iso = dmyToIso(v);
      if (!iso) { Alert.alert('Check the date', 'Use DD/MM/YYYY.'); return; }
      body[k] = iso;
    }
    setSaving(true);
    try {
      await api.patch('/delivery/profile', body);
      setEdit(false);
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.detail ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Vehicle & documents</Text>
        <View style={[styles.badge, profile.documents_verified ? styles.ok : styles.wait]}>
          <Text style={[styles.badgeTxt, { color: profile.documents_verified ? '#067647' : '#B54708' }]}>{profile.documents_verified ? 'VERIFIED' : 'PENDING VERIFICATION'}</Text>
        </View>
      </View>
      <Text style={styles.veh}>
        {profile.vehicle_class === 'auto' ? '🛺' : profile.vehicle_class === 'cab' ? '🚕' : '🛵'}  {profile.vehicle_number ?? '—'}
      </Text>
      <Text style={styles.sub}>{[profile.vehicle_make_model, profile.vehicle_color].filter(Boolean).join(' · ')}</Text>
      {!profile.documents_verified && <Text style={styles.warn}>Visit the Jinni office with your original licence, RC and insurance to start taking rides.</Text>}
      {(profile.rating_count ?? 0) > 0 && <Text style={styles.sub}>★ {profile.rating?.toFixed(1)} from {profile.rating_count} rides</Text>}

      {rows.map(([label, iso]) => {
        const d = daysLeft(iso);
        const bad = d !== null && d <= 0;
        const soon = d !== null && d > 0 && d <= 30;
        return (
          <View key={label} style={styles.row}>
            <Text style={styles.rowLbl}>{label}</Text>
            <Text style={[styles.rowVal, bad && { color: '#D92D20' }, soon && { color: '#B54708' }]}>
              {iso ? isoToDmy(iso) : 'Not added'}{bad ? ' · expired' : soon ? ` · ${d} days left` : ''}
            </Text>
          </View>
        );
      })}

      {edit ? (
        <View style={{ marginTop: 10 }}>
          {([['Licence valid till', dl, setDl], ['Registration valid till', rc, setRc], ['Insurance valid till', ins, setIns]] as const).map(([lbl, val, setter]) => (
            <View key={lbl} style={{ marginBottom: 8 }}>
              <Text style={styles.rowLbl}>{lbl}</Text>
              <TextInput style={styles.input} value={val} onChangeText={(t) => setter(maskDate(t))} keyboardType="number-pad" placeholder="DD/MM/YYYY" maxLength={10} placeholderTextColor={colors.gray[400]} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.gray[100] }]} onPress={() => setEdit(false)}><Text style={[styles.btnTxt, { color: colors.gray[700] }]}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#5E2FB8' }]} onPress={save} disabled={saving}><Text style={styles.btnTxt}>{saving ? 'Saving…' : 'Save renewals'}</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.renew} onPress={() => setEdit(true)}>
          <Ionicons name="refresh-outline" size={16} color="#5E2FB8" /><Text style={styles.renewTxt}>Renewed a document? Update dates</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.foot}>Vehicle number or licence number changes need Jinni support (re-verification).</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.gray[900] },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  ok: { backgroundColor: '#ECFDF3' }, wait: { backgroundColor: '#FFFAEB' },
  badgeTxt: { fontFamily: fontFamily.bold, fontSize: 10 },
  veh: { fontFamily: fontFamily.bold, fontSize: 20, color: colors.gray[900], marginTop: 10, letterSpacing: 1 },
  sub: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.gray[500], marginTop: 2 },
  warn: { fontFamily: fontFamily.medium, fontSize: 12, color: '#B54708', marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.gray[100], marginTop: 6 },
  rowLbl: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.gray[600] },
  rowVal: { fontFamily: fontFamily.semiBold, fontSize: 13, color: colors.gray[900] },
  input: { borderWidth: 1, borderColor: colors.gray[200], borderRadius: borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fontFamily.medium, color: colors.gray[900], marginTop: 4 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: borderRadius.md, alignItems: 'center' },
  btnTxt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 14 },
  renew: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  renewTxt: { color: '#5E2FB8', fontFamily: fontFamily.semiBold, fontSize: 13 },
  foot: { fontFamily: fontFamily.regular, fontSize: 11, color: colors.gray[400], marginTop: 10 },
});
