import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { rideService } from '@modules/cab/services/rideService';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { borderRadius, spacing } from '@theme/spacing';

type Dues = Awaited<ReturnType<typeof rideService.dues>>;

/** Where a customer sees what they owe from ride cancellations, and why. */
export const RideChargesScreen: React.FC = () => {
  const [data, setData] = useState<Dues | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setData(await rideService.dues()); } catch { setData((d) => d ?? { total: 0, items: [], info: '' }); } finally { setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!data) return <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary[600]} />;
  return (
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
      <View style={styles.hero}>
        <Text style={styles.heroLbl}>PENDING RIDE CHARGES</Text>
        <Text style={styles.heroAmt}>₹{data.total.toFixed(0)}</Text>
        <Text style={styles.heroSub}>{data.total > 0 ? 'Added to your next ride or order — you pay it once.' : 'You’re all clear. Nothing is added to your next ride or order.'}</Text>
      </View>
      {data.items.map((i) => (
        <View key={i.ride_id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.num}>{i.ride_number}</Text>
            <Text style={styles.fee}>₹{i.fee.toFixed(0)}</Text>
          </View>
          <Text style={styles.route} numberOfLines={1}>{i.route}</Text>
          <Text style={styles.why}>{i.reason}{i.date ? ` · ${new Date(i.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</Text>
        </View>
      ))}
      {!!data.info && <Text style={styles.info}>{data.info}</Text>}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  hero: { backgroundColor: '#5E2FB8', borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md },
  heroLbl: { color: '#E9C45E', fontFamily: fontFamily.bold, fontSize: 11, letterSpacing: 1.5 },
  heroAmt: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 38, marginVertical: 4 },
  heroSub: { color: '#fff', opacity: 0.85, fontFamily: fontFamily.regular, fontSize: 12 },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  num: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.gray[900] },
  fee: { fontFamily: fontFamily.bold, fontSize: 15, color: '#B54708' },
  route: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.gray[700], marginTop: 2 },
  why: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.gray[500], marginTop: 4 },
  info: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.gray[500], marginTop: spacing.md, lineHeight: 18 },
});

export default RideChargesScreen;
