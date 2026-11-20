import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@services/api';
import { formatPrice } from '@utils/helpers';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

type Txn = { id: string; amount: number; kind: string; created_at?: string };
type WalletData = { balance: number; transactions: Txn[] };
type Referral = { code: string; referrer_reward: number; referee_reward: number; pending: number; rewarded: number; rule: string };

const KIND_LABEL: Record<string, string> = {
  referral_reward: 'Referral reward',
  order_payment: 'Order payment',
  order_refund: 'Order refund',
  admin_credit: 'Credit from Jinni',
};

/** One wallet currency + referral (research: avoid Zomato's Money/Credits split). */
export const WalletScreen: React.FC = () => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, r] = await Promise.all([api.get<WalletData>('/wallet'), api.get<Referral>('/referral')]);
      setWallet(w);
      setReferral(r);
    } catch (e: any) {
      Alert.alert('Could not load wallet', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const apply = async () => {
    if (!code.trim() || applying) return;
    setApplying(true);
    try {
      const res: any = await api.post('/referral/apply', { code: code.trim() });
      setCode('');
      Alert.alert('Referral applied', res?.message || 'Done');
    } catch (e: any) {
      Alert.alert('Could not apply code', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const share = () => {
    if (!referral) return;
    void Share.share({
      message: `Order on Jinni with my code ${referral.code} and get ₹${referral.referee_reward} in your wallet after your first delivery!`,
    });
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary[600]} />;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
    >
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Jinni Wallet</Text>
        <Text style={styles.balance}>{formatPrice(wallet?.balance ?? 0)}</Text>
        <Text style={styles.balanceHint}>Pay for orders with “Wallet” at checkout.</Text>
      </View>

      {referral && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Refer & earn ₹{referral.referrer_reward}</Text>
          <Text style={styles.muted}>{referral.rule}</Text>
          <View style={styles.codeRow}>
            <Text style={styles.codeText}>{referral.code}</Text>
            <TouchableOpacity style={styles.shareBtn} onPress={share}>
              <Ionicons name="share-social-outline" size={16} color={colors.white} />
              <Text style={styles.shareText}>Share</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.muted}>{referral.rewarded} rewarded · {referral.pending} pending</Text>

          <Text style={[styles.cardTitle, { marginTop: spacing.md }]}>Have a friend’s code?</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="JINXXXXXX"
              placeholderTextColor={colors.gray[400]}
              autoCapitalize="characters"
              maxLength={12}
            />
            <TouchableOpacity style={styles.applyBtn} onPress={apply} disabled={applying}>
              {applying ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.shareText}>Apply</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.section}>Transactions</Text>
      {wallet?.transactions.length ? (
        wallet.transactions.map((t) => (
          <View key={t.id} style={styles.txn}>
            <View style={{ flex: 1 }}>
              <Text style={styles.txnTitle}>{KIND_LABEL[t.kind] || t.kind}</Text>
              {!!t.created_at && <Text style={styles.muted}>{new Date(t.created_at).toLocaleString()}</Text>}
            </View>
            <Text style={[styles.txnAmt, { color: t.amount >= 0 ? colors.success.DEFAULT : colors.gray[800] }]}>
              {t.amount >= 0 ? '+' : '−'}{formatPrice(Math.abs(t.amount))}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.muted}>No transactions yet.</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40, backgroundColor: colors.surface.background },
  balanceCard: { backgroundColor: colors.primary[600], borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md },
  balanceLabel: { color: colors.white, opacity: 0.85, fontFamily: fontFamily.medium, fontSize: 13 },
  balance: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 34, marginVertical: 4 },
  balanceHint: { color: colors.white, opacity: 0.8, fontFamily: fontFamily.regular, fontSize: 12 },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.gray[900], marginBottom: 4 },
  muted: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.gray[500] },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: spacing.sm },
  codeText: { flex: 1, fontFamily: fontFamily.bold, fontSize: 20, letterSpacing: 2, color: colors.primary[700] },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary[600], paddingHorizontal: 14, paddingVertical: 10, borderRadius: borderRadius.md },
  shareText: { color: colors.white, fontFamily: fontFamily.bold, fontSize: 13 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.gray[200], borderRadius: borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fontFamily.regular, color: colors.gray[900] },
  applyBtn: { backgroundColor: colors.primary[600], paddingHorizontal: 18, paddingVertical: 11, borderRadius: borderRadius.md },
  section: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.gray[700], marginVertical: spacing.sm },
  txn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, padding: spacing.md, borderRadius: borderRadius.md, marginBottom: 6 },
  txnTitle: { fontFamily: fontFamily.semiBold, fontSize: 14, color: colors.gray[800] },
  txnAmt: { fontFamily: fontFamily.bold, fontSize: 15 },
});

export default WalletScreen;
