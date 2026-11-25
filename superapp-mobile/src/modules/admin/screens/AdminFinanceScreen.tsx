import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { jinniColors } from '@shared/theme/jinni';
import { adminFinanceService, FinanceOverview, FinanceParty } from '@services/admin-finance.service';

const P = jinniColors.purple;
const G = jinniColors.gold;
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const ROLE: Record<string, string> = { restaurant: 'Restaurant', store: 'Store', delivery: 'Rider' };
const METHODS = ['upi', 'bank', 'cash'] as const;

export const AdminFinanceScreen: React.FC = () => {
  const [days, setDays] = useState(30);
  const [o, setO] = useState<FinanceOverview | null>(null);
  const [parties, setParties] = useState<FinanceParty[]>([]);
  const [minPayout, setMin] = useState(100);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pay, setPay] = useState<FinanceParty | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof METHODS)[number]>('upi');
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, pr] = await Promise.all([adminFinanceService.overview(days), adminFinanceService.parties()]);
      setO(ov); setParties(pr.parties); setMin(pr.min_payout);
    } catch (e: any) { Alert.alert('Could not load finance', e?.response?.data?.detail || 'Try again'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [days]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  const openPay = (p: FinanceParty) => { setPay(p); setAmount(String(Math.abs(p.payable))); setMethod(p.payable > 0 ? (p.upi ? 'upi' : 'bank') : 'cash'); setRef(''); };
  const submit = async () => {
    if (!pay) return;
    setSaving(true);
    try {
      await adminFinanceService.record({ party_user_id: pay.user_id, kind: pay.payable > 0 ? 'payout' : 'deposit', amount: Number(amount), method, reference: ref.trim() || undefined });
      setPay(null); void load();
    } catch (e: any) { Alert.alert('Not recorded', typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Check the amount and reference'); }
    finally { setSaving(false); }
  };

  if (loading || !o) return <SafeAreaView style={styles.safe}><ActivityIndicator style={{ marginTop: 80 }} color={P[500]} /></SafeAreaView>;
  const tiles: [string, number, string, boolean?][] = [
    ['We owe restaurants & stores', o.owed.to_sellers, 'ready to pay'],
    ['We owe riders', o.owed.to_riders, 'earnings unpaid'],
    ['Cash riders must deposit', o.owed.cash_with_riders, 'COD + ride cash held'],
    ['Refunds to process', o.refunds_pending.amount, `${o.refunds_pending.count} orders`],
  ];
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>✦ FINANCE</Text>
          <Text style={styles.big}>{inr(o.revenue)}</Text>
          <Text style={styles.sub}>platform revenue · from {inr(o.gmv)} customer spend · {o.counts.orders} orders, {o.counts.rides} rides</Text>
          <View style={styles.seg}>{[7, 30, 90].map((d) => <TouchableOpacity key={d} onPress={() => setDays(d)} style={[styles.segBtn, days === d && styles.segOn]}><Text style={{ color: days === d ? P[800] : P[100], fontWeight: '800' }}>{d}d</Text></TouchableOpacity>)}</View>
        </View>

        <View style={styles.grid}>
          {tiles.map(([l, v, s]) => <View key={l} style={styles.tile}><Text style={styles.tl}>{l}</Text><Text style={styles.tv}>{inr(v)}</Text><Text style={styles.ts}>{s}</Text></View>)}
        </View>

        <Section title="How revenue is made">
          {Object.entries(o.revenue_breakdown).map(([k, v]) => <Line key={k} l={k} r={inr(v)} neg={v < 0} />)}
          <Line l="GST collected (pass-through)" r={inr(o.tax_collected)} muted />
        </Section>

        <Section title="Where money came from">
          {Object.entries(o.by_method).map(([k, v]) => <Line key={k} l={({ cod: 'COD (cash to rider)', online: 'Online (Paytm)', wallet: 'Wallet', ride_cash: 'Ride · cash', ride_upi: 'Ride · UPI' } as any)[k] || k} r={inr(v)} />)}
          <Line l="Paid out to partners" r={inr(o.movements.paid_out)} muted />
          <Line l="Deposits from riders" r={inr(o.movements.deposits_received)} muted />
        </Section>

        <Section title="Payouts & cash">
          <Text style={styles.hint}>Pay from your UPI/bank app, then record the UTR. Minimum payout {inr(minPayout)}.</Text>
          {parties.length === 0 && <Text style={styles.hint}>Nothing to settle yet.</Text>}
          {parties.map((p) => (
            <View key={p.user_id} style={styles.party}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pn}>{p.name} <Text style={styles.role}>{ROLE[p.role]}</Text></Text>
                <Text style={styles.ts}>earned {inr(p.earned)}{p.holds ? ` · collected ${inr(p.holds)}` : ''}</Text>
                <Text style={styles.ts}>{p.upi || (p.bank_account ? `${p.bank_account} · ${p.bank_ifsc}` : 'no payout account')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.pv, { color: p.payable < 0 ? '#B42318' : P[600] }]}>{p.payable === 0 ? 'Settled' : p.payable > 0 ? `Pay ${inr(p.payable)}` : `Collect ${inr(-p.payable)}`}</Text>
                {Math.abs(p.payable) >= 1 && !(p.payable > 0 && p.payable < minPayout) && <TouchableOpacity style={styles.rec} onPress={() => openPay(p)}><Text style={{ color: '#fff', fontWeight: '700' }}>{p.payable > 0 ? 'Record payout' : 'Record deposit'}</Text></TouchableOpacity>}
              </View>
            </View>
          ))}
        </Section>
        <Text style={styles.foot}>Rates: food {o.rates.food}% · grocery {o.rates.grocery}% · rider keeps {o.rates.rider_share}% of delivery fee · rides {o.rates.ride}%. Change them on the web console → Finance → Rates.</Text>
      </ScrollView>

      <Modal visible={!!pay} transparent animationType="slide" onRequestClose={() => setPay(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetT}>{pay && pay.payable > 0 ? `Pay ${pay.name}` : `Deposit from ${pay?.name}`}</Text>
            <Text style={styles.hint}>{pay && pay.payable > 0 ? `Owed ${inr(pay.payable)} · send to ${pay.upi || pay.bank_account || 'their saved account'}` : `They hold ${inr(Math.abs(pay?.payable || 0))}`}</Text>
            <Text style={styles.lbl}>Amount (₹)</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <Text style={styles.lbl}>How</Text>
            <View style={styles.seg2}>{METHODS.map((m) => <TouchableOpacity key={m} onPress={() => setMethod(m)} style={[styles.m, method === m && styles.mOn]}><Text style={{ color: method === m ? '#fff' : P[600], fontWeight: '700' }}>{m.toUpperCase()}</Text></TouchableOpacity>)}</View>
            <Text style={styles.lbl}>{method === 'cash' ? 'Receipt / note (optional)' : 'UTR / transaction id'}</Text>
            <TextInput style={styles.input} value={ref} onChangeText={setRef} autoCapitalize="characters" placeholder="e.g. 412356789012" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.sBtn, { backgroundColor: P[50] }]} onPress={() => setPay(null)}><Text style={{ color: P[600], fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.sBtn, { backgroundColor: G[500] }]} onPress={submit} disabled={saving}><Text style={{ color: P[900], fontWeight: '800' }}>{saving ? 'Saving…' : 'Record'}</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.sec}><Text style={styles.secT}>{title}</Text>{children}</View>
);
const Line = ({ l, r, neg, muted }: { l: string; r: string; neg?: boolean; muted?: boolean }) => (
  <View style={styles.line}><Text style={{ color: muted ? '#667085' : '#1D1433', flex: 1 }}>{l}</Text><Text style={{ fontWeight: '800', color: neg ? '#B42318' : muted ? '#667085' : P[700] }}>{r}</Text></View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF8FE' },
  hero: { backgroundColor: P[800], padding: 20, paddingTop: 14, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  kicker: { color: G[200], fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  big: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 4 },
  sub: { color: P[200], marginTop: 2, fontSize: 12 },
  seg: { flexDirection: 'row', gap: 8, marginTop: 14 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.12)' },
  segOn: { backgroundColor: G[300] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  tile: { width: '47.5%', backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: P[100] },
  tl: { fontSize: 12, color: '#667085', fontWeight: '600' },
  tv: { fontSize: 22, fontWeight: '800', color: '#1D1433', marginTop: 4 },
  ts: { fontSize: 11, color: '#667085', marginTop: 2 },
  sec: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 14, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: P[100] },
  secT: { fontSize: 15, fontWeight: '800', color: P[800], marginBottom: 8 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: P[50] },
  hint: { color: '#667085', fontSize: 12, marginBottom: 6 },
  party: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: P[50] },
  pn: { fontWeight: '800', color: '#1D1433', fontSize: 15 },
  role: { color: P[400], fontSize: 11, fontWeight: '700' },
  pv: { fontWeight: '800', fontSize: 14 },
  rec: { marginTop: 6, backgroundColor: P[500], paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  foot: { color: '#667085', fontSize: 12, marginHorizontal: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(42,19,84,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  sheetT: { fontSize: 18, fontWeight: '800', color: P[800] },
  lbl: { fontSize: 12, color: '#667085', fontWeight: '700', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: P[200], borderRadius: 12, padding: 12, fontSize: 16 },
  seg2: { flexDirection: 'row', gap: 8 },
  m: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, backgroundColor: P[50] },
  mOn: { backgroundColor: P[500] },
  sBtn: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14 },
});
