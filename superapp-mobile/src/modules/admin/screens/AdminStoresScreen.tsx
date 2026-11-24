import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { jinniColors } from '@shared/theme/jinni';
import { adminFinanceService, AdminStore } from '@services/admin-finance.service';

const P = jinniColors.purple;
const G = jinniColors.gold;
const TABS = [['pending', 'Pending'], ['verified', 'Verified'], ['inactive', 'Suspended'], ['all', 'All']] as const;
const STATUS: Record<string, [string, string]> = { active: ['#12805C', 'Verified'], pending_approval: ['#B54708', 'Pending'], suspended: ['#B42318', 'Suspended'], rejected: ['#B42318', 'Rejected'] };
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export const AdminStoresScreen: React.FC = () => {
  const [tab, setTab] = useState<string>('pending');
  const [rows, setRows] = useState<AdminStore[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await adminFinanceService.stores(tab); setRows(r.stores); setCounts(r.counts || {}); }
    catch (e: any) { Alert.alert('Could not load stores', e?.response?.data?.detail || 'Try again'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [tab]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  const act = async (s: AdminStore, a: 'verify' | 'reject' | 'suspend' | 'reactivate') => {
    try { await adminFinanceService.storeAction(s.user_id, a); void load(); }
    catch (e: any) { Alert.alert('Not done', e?.response?.data?.detail || 'Try again'); }
  };
  const confirm = (s: AdminStore, a: 'reject' | 'suspend') => Alert.alert(a === 'reject' ? 'Reject this store?' : 'Suspend and close this store?', s.store_name, [{ text: 'Cancel', style: 'cancel' }, { text: a === 'reject' ? 'Reject' : 'Suspend', style: 'destructive', onPress: () => void act(s, a) }]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>✦ GROCERY PARTNERS</Text>
        <Text style={styles.title}>Stores</Text>
        <Text style={styles.sub}>{counts.pending_approval || 0} waiting · {counts.active || 0} verified · {counts.suspended || 0} suspended</Text>
      </View>
      <View style={styles.tabs}>
        {TABS.map(([k, l]) => <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabOn]} onPress={() => setTab(k)}><Text style={[styles.tabTxt, tab === k && { color: '#fff' }]}>{l}</Text></TouchableOpacity>)}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={P[500]} /> : (
        <FlatList data={rows} keyExtractor={(s) => s.user_id} contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<View style={{ alignItems: 'center', marginTop: 60 }}><Ionicons name="storefront-outline" size={44} color={P[200]} /><Text style={{ color: '#667085', marginTop: 8 }}>No stores here</Text></View>}
          renderItem={({ item: s }) => {
            const [c, label] = STATUS[s.account_status] || ['#667085', s.account_status];
            const okN = s.checks.filter((x) => x.ok).length;
            const expanded = open === s.user_id;
            return (
              <TouchableOpacity activeOpacity={0.9} style={styles.card} onPress={() => setOpen(expanded ? null : s.user_id)}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{s.store_name}</Text>
                    <Text style={styles.muted}>{s.owner_name} · {s.phone}</Text>
                    <Text style={styles.muted}>{s.city || '—'} {s.pincode || ''}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: c + '1A' }]}><Text style={{ color: c, fontWeight: '700', fontSize: 12 }}>{label}</Text></View>
                </View>
                <View style={styles.stats}>
                  <Stat l="Orders" v={`${s.delivered}/${s.orders}`} /><Stat l="Sales" v={inr(s.sales)} /><Stat l="We owe" v={inr(s.payable)} strong />
                </View>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${(okN / s.checks.length) * 100}%`, backgroundColor: s.ready ? '#12805C' : G[400] }]} /></View>
                <Text style={styles.muted}>{s.ready ? 'Ready to trade and be paid' : `Needs: ${s.checks.filter((x) => !x.ok && x.required).map((x) => x.label).join(', ') || 'optional details'}`}{s.low_stock ? ` · ${s.low_stock} low stock` : ''}</Text>
                {expanded && (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    {s.checks.map((x) => <Text key={x.key} style={{ color: x.ok ? '#12805C' : x.required ? '#B42318' : '#667085' }}>{x.ok ? '✓' : x.required ? '✗' : '–'}  {x.label}{x.required ? '' : ' (optional)'}</Text>)}
                    <View style={styles.actions}>
                      {s.account_status === 'pending_approval' && <Btn t="Approve" onPress={() => void act(s, 'verify')} primary />}
                      {s.account_status === 'pending_approval' && <Btn t="Reject" onPress={() => confirm(s, 'reject')} danger />}
                      {s.account_status === 'active' && <Btn t="Suspend" onPress={() => confirm(s, 'suspend')} danger />}
                      {['suspended', 'rejected'].includes(s.account_status) && <Btn t="Reactivate" onPress={() => void act(s, 'reactivate')} primary />}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          }} />
      )}
    </SafeAreaView>
  );
};

const Stat = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => (
  <View style={{ flex: 1 }}><Text style={styles.statL}>{l}</Text><Text style={[styles.statV, strong && { color: P[600] }]}>{v}</Text></View>
);
const Btn = ({ t, onPress, primary, danger }: { t: string; onPress: () => void; primary?: boolean; danger?: boolean }) => (
  <TouchableOpacity onPress={onPress} style={[styles.btn, primary && { backgroundColor: P[500] }, danger && { borderColor: '#B42318', borderWidth: 1 }]}>
    <Text style={{ color: primary ? '#fff' : danger ? '#B42318' : P[600], fontWeight: '700' }}>{t}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAF8FE' },
  hero: { backgroundColor: P[800], paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  kicker: { color: G[200], fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 2 },
  sub: { color: P[200], marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 0 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: P[50] },
  tabOn: { backgroundColor: P[500] },
  tabTxt: { color: P[600], fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: P[100], shadowColor: P[500], shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  row: { flexDirection: 'row', gap: 10 },
  name: { fontSize: 17, fontWeight: '800', color: '#1D1433' },
  muted: { color: '#667085', fontSize: 12, marginTop: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  stats: { flexDirection: 'row', marginTop: 12, marginBottom: 10 },
  statL: { fontSize: 11, color: '#667085' },
  statV: { fontSize: 16, fontWeight: '800', color: '#1D1433' },
  bar: { height: 6, backgroundColor: P[50], borderRadius: 3, marginBottom: 6, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, backgroundColor: P[50] },
});
