import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';
import { adminRestaurantService, AdminRestaurant, RestaurantAdminState } from '@services/admin-restaurant.service';

const TABS: { key: RestaurantAdminState; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'pending', label: 'Pending', icon: 'time-outline' },
  { key: 'verified', label: 'Verified', icon: 'checkmark-circle-outline' },
  { key: 'rejected', label: 'Rejected', icon: 'close-circle-outline' },
  { key: 'inactive', label: 'Inactive', icon: 'pause-circle-outline' },
  { key: 'all', label: 'All', icon: 'grid-outline' },
];

export const AdminRestaurantsScreen: React.FC = () => {
  const [tab, setTab] = useState<RestaurantAdminState>('pending');
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<AdminRestaurant | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState({ name: '', description: '', city: '', state: '', pincode: '', cuisines: '' });

  const load = useCallback(async () => {
    try {
      const result = await adminRestaurantService.list({ state: tab, search: search.trim() || undefined, page_size: 50 });
      setRestaurants(result.restaurants || []);
    } catch (e: any) {
      Alert.alert('Could not load restaurants', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, search]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(load, search.trim() ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const selectedTab = useMemo(() => TABS.find((x) => x.key === tab) || TABS[0], [tab]);

  const openEdit = (r: AdminRestaurant) => {
    setSelected(r);
    setEdit({
      name: r.name,
      description: r.description || '',
      city: r.city || '',
      state: r.state || '',
      pincode: r.pincode || '',
      cuisines: (r.cuisines || []).join(', '),
    });
  };

  const saveEdit = async () => {
    if (!selected || !edit.name.trim()) return;
    setSaving(true);
    try {
      const updated = await adminRestaurantService.update(selected.id, {
        name: edit.name.trim(),
        description: edit.description.trim() || null,
        city: edit.city.trim(),
        state: edit.state.trim(),
        pincode: edit.pincode.trim(),
        cuisines: edit.cuisines.split(',').map((x) => x.trim()).filter(Boolean),
      });
      setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
      Alert.alert('Saved', 'Restaurant details updated successfully.');
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || 'Could not update restaurant.');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (fn: () => Promise<AdminRestaurant>, message: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await fn();
      setSelected(updated);
      setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      Alert.alert('Done', message);
      await load();
    } catch (e: any) {
      Alert.alert('Action failed', e?.response?.data?.detail || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmAndRun = (
    title: string,
    body: string,
    confirmLabel: string,
    fn: () => Promise<AdminRestaurant>,
    successMessage: string
  ) => {
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: () => runAction(fn, successMessage) },
    ]);
  };

  const pickImage = async (kind: 'logo' | 'cover') => {
    if (!selected) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access required', 'Allow photo access to upload restaurant images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setSaving(true);
    try {
      const uploaded = await adminRestaurantService.uploadImage(
        selected.id,
        { uri: asset.uri, name: asset.fileName || `${kind}.jpg`, type: asset.mimeType || 'image/jpeg' },
        kind,
      );
      const updated = { ...selected, ...(kind === 'logo' ? { logo_url: uploaded.image_url } : { cover_image_url: uploaded.image_url }) };
      setSelected(updated);
      setRestaurants((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e: any) {
      Alert.alert('Upload failed', e?.response?.data?.detail || 'Could not upload image.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: AdminRestaurant }) => {
    const pending = !item.is_verified && item.owner_status !== 'rejected';
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} activeOpacity={0.9}>
        <View style={styles.coverWrap}>
          {item.cover_image_url ? (
            <Image source={{ uri: item.cover_image_url }} style={styles.cover} />
          ) : (
            <View style={styles.coverPlaceholder}><Ionicons name="restaurant-outline" size={28} color={colors.gray[400]} /></View>
          )}
          <View style={styles.logoWrap}>
            {item.logo_url ? <Image source={{ uri: item.logo_url }} style={styles.logo} /> : <Ionicons name="restaurant" size={22} color={colors.gray[500]} />}
          </View>
          <View style={styles.cardArrow}><Ionicons name="chevron-forward" size={18} color={colors.gray[500]} /></View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.statusPill, pending ? styles.pendingPill : item.owner_status === 'rejected' ? styles.rejectedPill : styles.verifiedPill]}>
              <Text style={[styles.statusText, pending ? styles.pendingText : item.owner_status === 'rejected' ? styles.rejectedText : styles.verifiedText]}>
                {pending ? 'Pending review' : item.owner_status === 'rejected' ? 'Rejected' : 'Verified'}
              </Text>
            </View>
          </View>
          <Text style={styles.owner}>{item.owner_name || 'Restaurant partner'} · {item.owner_phone || 'No phone'}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}><Ionicons name="location-outline" size={14} color={colors.gray[500]} /><Text style={styles.meta}>{item.city || '—'} · {item.pincode || '—'}</Text></View>
            <View style={styles.metaItem}><Ionicons name="ellipse" size={7} color={item.is_active ? colors.success.DEFAULT : colors.gray[400]} /><Text style={styles.meta}>{item.is_active ? 'Active' : 'Inactive'}</Text></View>
          </View>
          <Text style={styles.cuisine} numberOfLines={1}>{item.cuisines?.length ? item.cuisines.join(' · ') : 'Cuisine not added'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View>
            <Text style={styles.eyebrow}>SUPER ADMIN</Text>
            <Text style={styles.title}>Restaurants</Text>
            <Text style={styles.subtitle}>Review, verify and operate restaurant partners.</Text>
          </View>
          <View style={styles.countBadge}><Text style={styles.countValue}>{restaurants.length}</Text><Text style={styles.countLabel}>{selectedTab.label}</Text></View>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={19} color={colors.gray[400]} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search restaurant, city or phone" placeholderTextColor={colors.gray[400]} style={styles.searchInput} returnKeyType="search" />
        {!!search && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={colors.gray[400]} /></TouchableOpacity>}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((item) => {
          const active = tab === item.key;
          return <TouchableOpacity key={item.key} onPress={() => setTab(item.key)} activeOpacity={0.8} style={[styles.tab, active && styles.tabActive]}>
            <Ionicons name={item.icon} size={15} color={active ? colors.white : colors.gray[600]} />
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{item.label}</Text>
          </TouchableOpacity>;
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary[500]} /><Text style={styles.loadingText}>Loading restaurants…</Text></View>
      ) : (
        <FlatList
          data={restaurants}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={restaurants.length ? styles.list : styles.emptyList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary[500]} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name={selectedTab.icon} size={40} color={colors.gray[300]} /><Text style={styles.emptyTitle}>No restaurants here</Text><Text style={styles.emptyText}>{tab === 'pending' ? 'New or unverified restaurants will appear here for review.' : 'Try another filter or clear your search.'}</Text></View>}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.iconButton} onPress={() => setSelected(null)}><Ionicons name="close" size={22} color={colors.gray[800]} /></TouchableOpacity>
              <View style={{ flex: 1, marginHorizontal: spacing.md }}><Text style={styles.modalEyebrow}>RESTAURANT PARTNER</Text><Text style={styles.modalTitle} numberOfLines={1}>{selected.name}</Text></View>
              <View style={[styles.modalStatus, selected.is_verified ? styles.verifiedPill : selected.owner_status === 'rejected' ? styles.rejectedPill : styles.pendingPill]}><Text style={[styles.statusText, selected.is_verified ? styles.verifiedText : selected.owner_status === 'rejected' ? styles.rejectedText : styles.pendingText]}>{selected.is_verified ? 'Verified' : selected.owner_status === 'rejected' ? 'Rejected' : 'Pending'}</Text></View>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.imageGrid}>
                <TouchableOpacity style={styles.logoUpload} onPress={() => pickImage('logo')}>
                  {selected.logo_url ? <Image source={{ uri: selected.logo_url }} style={styles.logoLarge} /> : <Ionicons name="image-outline" size={25} color={colors.gray[400]} />}
                  <View style={styles.uploadBadge}><Ionicons name="camera" size={13} color={colors.white} /></View>
                  <Text style={styles.imageCaption}>Logo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.coverUpload} onPress={() => pickImage('cover')}>
                  {selected.cover_image_url ? <Image source={{ uri: selected.cover_image_url }} style={styles.coverLarge} /> : <View style={styles.coverEmpty}><Ionicons name="image-outline" size={28} color={colors.gray[400]} /><Text style={styles.coverEmptyText}>Add cover</Text></View>}
                  <View style={styles.uploadBadge}><Ionicons name="camera" size={13} color={colors.white} /></View>
                  <Text style={styles.imageCaption}>Cover image</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Restaurant details</Text>
                {([['name','Restaurant name'],['description','Description'],['city','City'],['state','State'],['pincode','Pincode'],['cuisines','Cuisines · comma separated']] as const).map(([key, label]) => (
                  <View key={key} style={styles.field}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TextInput value={edit[key]} onChangeText={(value) => setEdit((prev) => ({ ...prev, [key]: value }))} style={styles.input} placeholderTextColor={colors.gray[400]} multiline={key === 'description'} keyboardType={key === 'pincode' ? 'number-pad' : 'default'} maxLength={key === 'pincode' ? 6 : undefined} />
                  </View>
                ))}
                <TouchableOpacity style={styles.saveBtn} disabled={saving} onPress={saveEdit}>{saving ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="checkmark" size={18} color={colors.white} /><Text style={styles.saveText}>Save changes</Text></>}</TouchableOpacity>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Operations</Text>
                <Text style={styles.sectionHint}>Verification controls whether this restaurant can appear in customer food discovery.</Text>
                <View style={styles.actionRow}>
                  {!selected.is_verified && selected.owner_status !== 'rejected' && <TouchableOpacity style={[styles.actionBtn, styles.verifyBtn]} disabled={saving} onPress={() => runAction(() => adminRestaurantService.verify(selected.id), 'Restaurant verified and activated.') }><Ionicons name="checkmark-circle" size={18} color={colors.white} /><Text style={styles.actionText}>Verify</Text></TouchableOpacity>}
                  {!selected.is_verified && selected.owner_status !== 'rejected' && <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} disabled={saving} onPress={() => confirmAndRun('Reject this restaurant?', `${selected.name} will be hidden from customer discovery. The owner can be reviewed again later.`, 'Reject', () => adminRestaurantService.reject(selected.id), 'Restaurant rejected and hidden from customers.') }><Ionicons name="close-circle" size={18} color={colors.white} /><Text style={styles.actionText}>Reject</Text></TouchableOpacity>}
                  {selected.is_verified && selected.is_active && <TouchableOpacity style={[styles.actionBtn, styles.deactivateBtn]} disabled={saving} onPress={() => confirmAndRun('Deactivate this restaurant?', `${selected.name} will stop appearing to customers until reactivated.`, 'Deactivate', () => adminRestaurantService.deactivate(selected.id), 'Restaurant deactivated.') }><Ionicons name="pause-circle" size={18} color={colors.white} /><Text style={styles.actionText}>Deactivate</Text></TouchableOpacity>}
                  {selected.is_verified && !selected.is_active && <TouchableOpacity style={[styles.actionBtn, styles.verifyBtn]} disabled={saving} onPress={() => runAction(() => adminRestaurantService.activate(selected.id), 'Restaurant activated.') }><Ionicons name="play-circle" size={18} color={colors.white} /><Text style={styles.actionText}>Activate</Text></TouchableOpacity>}
                </View>
                <View style={styles.statusSummary}><Text style={styles.summaryLabel}>Customer visibility</Text><Text style={[styles.summaryValue, { color: selected.is_verified && selected.is_active ? colors.success.dark : colors.error.dark }]}>{selected.is_verified && selected.is_active ? 'Visible' : 'Hidden'}</Text></View>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: { backgroundColor: colors.white, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { ...typography.overline, color: colors.primary[600] },
  title: { ...typography.h3, color: colors.gray[900], marginTop: 1 },
  subtitle: { ...typography.body2, color: colors.gray[500], marginTop: 2 },
  countBadge: { minWidth: 58, paddingHorizontal: 10, paddingVertical: 8, borderRadius: borderRadius.md, backgroundColor: colors.primary[50], alignItems: 'center' },
  countValue: { ...typography.h6, color: colors.primary[700] },
  countLabel: { ...typography.caption, color: colors.primary[700] },
  searchBox: { marginHorizontal: spacing.lg, marginTop: spacing.md, height: 46, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.gray[200], borderRadius: borderRadius.md, backgroundColor: colors.white },
  searchInput: { flex: 1, ...typography.body2, color: colors.gray[900], marginLeft: 8, paddingVertical: 0 },
  tabs: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 8 },
  tab: { height: 38, paddingHorizontal: 13, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  tabText: { ...typography.label, color: colors.gray[600] },
  tabTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  emptyList: { flexGrow: 1, paddingHorizontal: spacing.xl },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.lg, marginBottom: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray[100] },
  coverWrap: { height: 105, backgroundColor: colors.gray[100], position: 'relative' },
  cover: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoWrap: { position: 'absolute', left: spacing.md, bottom: -24, width: 58, height: 58, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
  cardArrow: { position: 'absolute', right: spacing.md, bottom: spacing.md, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...colors.shadows?.sm },
  cardBody: { paddingHorizontal: spacing.md, paddingTop: 34, paddingBottom: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...typography.h6, color: colors.gray[900], flex: 1 },
  owner: { ...typography.caption, color: colors.gray[500], marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { ...typography.caption, color: colors.gray[600] },
  cuisine: { ...typography.caption, color: colors.gray[500], marginTop: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pendingPill: { backgroundColor: colors.warning.light },
  verifiedPill: { backgroundColor: colors.success.light },
  rejectedPill: { backgroundColor: colors.error.light },
  statusText: { ...typography.caption, fontFamily: typography.label.fontFamily },
  pendingText: { color: colors.warning.dark },
  verifiedText: { color: colors.success.dark },
  rejectedText: { color: colors.error.dark },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body2, color: colors.gray[500], marginTop: spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 90 },
  emptyTitle: { ...typography.h6, color: colors.gray[800], marginTop: spacing.md },
  emptyText: { ...typography.body2, color: colors.gray[500], textAlign: 'center', marginTop: 5, maxWidth: 280 },
  modal: { flex: 1, backgroundColor: colors.surface.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  modalEyebrow: { ...typography.overline, color: colors.gray[500] },
  modalTitle: { ...typography.h5, color: colors.gray[900] },
  modalStatus: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  modalContent: { padding: spacing.lg, paddingBottom: 50 },
  imageGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  logoUpload: { width: 110, height: 132, borderRadius: borderRadius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoLarge: { width: 86, height: 86, borderRadius: 16 },
  coverUpload: { flex: 1, height: 132, borderRadius: borderRadius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray[200], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverLarge: { width: '100%', height: '100%' },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  coverEmptyText: { ...typography.caption, color: colors.gray[500], marginTop: 4 },
  uploadBadge: { position: 'absolute', right: 7, top: 7, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gray[800], alignItems: 'center', justifyContent: 'center' },
  imageCaption: { position: 'absolute', bottom: 7, left: 8, ...typography.caption, color: colors.gray[800], backgroundColor: colors.white, paddingHorizontal: 5, borderRadius: 5 },
  sectionCard: { backgroundColor: colors.white, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.gray[100] },
  sectionTitle: { ...typography.h6, color: colors.gray[900] },
  sectionHint: { ...typography.caption, color: colors.gray[500], marginTop: 4, marginBottom: 4 },
  field: { marginTop: spacing.md },
  fieldLabel: { ...typography.label, color: colors.gray[600], marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.gray[200], borderRadius: borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, ...typography.body2, color: colors.gray[900], backgroundColor: colors.surface.sunken },
  saveBtn: { height: 46, borderRadius: borderRadius.md, backgroundColor: colors.primary[600], alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: spacing.lg },
  saveText: { ...typography.button, color: colors.white },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  actionBtn: { minHeight: 42, paddingHorizontal: 14, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  verifyBtn: { backgroundColor: colors.success.dark },
  rejectBtn: { backgroundColor: colors.error.dark },
  deactivateBtn: { backgroundColor: colors.warning.dark },
  actionText: { ...typography.button, color: colors.white },
  statusSummary: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray[100], flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { ...typography.body2, color: colors.gray[500] },
  summaryValue: { ...typography.label },
});

export default AdminRestaurantsScreen;
