import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing } from '@theme/spacing';
import { useLocationStore } from '@store/locationStore';
import { api } from '@services/api';

interface Store {
  id: string;
  store_name: string;
  owner_name: string;
  address: string;
  pincode: string;
  city: string;
  is_open: boolean;
  delivery_radius_km: number;
}

export const GroceryStoreListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { pincode } = useLocationStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStores = useCallback(async () => {
    if (!pincode) return;
    setLoading(true);
    setError('');
    try {
      const data: any = await api.get('/grocery/stores', { params: { pincode } });
      setStores(data.stores ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  }, [pincode]);

  useEffect(() => { fetchStores(); }, [fetchStores]);

  const renderStore = ({ item }: { item: Store }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        navigation.navigate('StoreCategories', {
          storeId: item.id,
          storeName: item.store_name,
        })
      }
      activeOpacity={0.75}
    >
      <View style={styles.iconBox}>
        <Ionicons name="storefront" size={28} color={colors.grocery.primary} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.storeName}>{item.store_name}</Text>
        <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
        <View style={styles.meta}>
          <View style={[styles.badge, item.is_open ? styles.openBadge : styles.closedBadge]}>
            <Text style={[styles.badgeText, item.is_open ? styles.openText : styles.closedText]}>
              {item.is_open ? 'Open' : 'Closed'}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="bicycle" size={12} color={colors.gray[500]} />
            <Text style={styles.metaText}>{item.delivery_radius_km} km radius</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.gray[400]} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header pincode={pincode} navigation={navigation} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.grocery.primary} />
          <Text style={styles.loadingText}>Finding stores in {pincode}…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Header pincode={pincode} navigation={navigation} />
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error.DEFAULT} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchStores}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header pincode={pincode} navigation={navigation} />

      {stores.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="storefront-outline" size={64} color={colors.gray[300]} />
          <Text style={styles.emptyTitle}>No stores found</Text>
          <Text style={styles.emptySubtitle}>
            No grocery stores are currently serving pincode {pincode}
          </Text>
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(item) => item.id}
          renderItem={renderStore}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={fetchStores} colors={[colors.grocery.primary]} />
          }
          ListHeaderComponent={
            <Text style={styles.resultsLabel}>{stores.length} store{stores.length !== 1 ? 's' : ''} near {pincode}</Text>
          }
        />
      )}
    </SafeAreaView>
  );
};

const Header = ({ pincode, navigation }: { pincode: string; navigation: any }) => (
  <View style={styles.header}>
    <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
      <Ionicons name="arrow-back" size={24} color={colors.white} />
    </TouchableOpacity>
    <View>
      <Text style={styles.headerTitle}>Grocery Stores</Text>
      <Text style={styles.headerSub}>📍 Pincode: {pincode}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.grocery.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { fontSize: 20, fontFamily: fontFamily.bold, color: colors.white },
  headerSub: { fontSize: 13, color: colors.white + 'CC', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.gray[500], fontSize: 14 },
  errorText: { color: colors.error.DEFAULT, fontSize: 15, textAlign: 'center', marginTop: spacing.md },
  retryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 10,
  },
  retryText: { color: colors.white, fontFamily: fontFamily.bold },
  emptyTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.gray[700], marginTop: spacing.lg },
  emptySubtitle: { fontSize: 14, color: colors.gray[500], textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  list: { padding: spacing.lg },
  resultsLabel: { fontSize: 13, color: colors.gray[500], marginBottom: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.gray[200],
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.grocery.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  storeName: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.gray[900] },
  address: { fontSize: 13, color: colors.gray[500], marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  openBadge: { backgroundColor: colors.success.DEFAULT + '20' },
  closedBadge: { backgroundColor: colors.error.DEFAULT + '20' },
  badgeText: { fontSize: 11, fontFamily: fontFamily.bold },
  openText: { color: colors.success.DEFAULT },
  closedText: { color: colors.error.DEFAULT },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.gray[500] },
});

export default GroceryStoreListScreen;
