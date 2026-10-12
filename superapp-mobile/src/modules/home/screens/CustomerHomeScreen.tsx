import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';
import { homeAssets } from '@theme/assets';
import { useAuthStore } from '@auth/store/authStore';
import { useLocationStore } from '@store/locationStore';

import {
  LocationHeader,
  HomeSearchBar,
  HeroCarousel,
  HeroSlide,
  LocationPrompt,
  ServiceCategoryCard,
  ServiceCategoryConfig,
  TryJinniNudgeCard,
} from '@modules/home/components';
import { useJinniSession } from '@modules/jinni/hooks/useJinniSession';

// "Try Jinni" nudge (spec section 4.3) is shown only the first few times
// Home is opened, then stays dismissed — tracked locally, no backend yet.
const JINNI_NUDGE_STORAGE_KEY = 'jinni_home_nudge_shows';
const JINNI_NUDGE_MAX_SHOWS = 3;

/**
 * Home — the super-app's front door.
 *
 * Layout order follows the product spec exactly:
 * header -> search -> hero carousel -> location prompt -> explore services.
 * Each block is its own component so the screen stays a thin composition
 * layer, not a monolith.
 */
export const CustomerHomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { pincode, city, setPincode: savePincode } = useLocationStore();
  const [refreshing, setRefreshing] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [pincodeDraft, setPincodeDraft] = useState(pincode);
  const [showJinniNudge, setShowJinniNudge] = useState(false);
  const { open: openJinni, wishes } = useJinniSession();

  const isPincodeSet = pincode.length === 6;

  useEffect(() => {
    AsyncStorage.getItem(JINNI_NUDGE_STORAGE_KEY).then((raw) => {
      const shows = raw ? parseInt(raw, 10) : 0;
      if (shows < JINNI_NUDGE_MAX_SHOWS) {
        setShowJinniNudge(true);
        AsyncStorage.setItem(JINNI_NUDGE_STORAGE_KEY, String(shows + 1));
      }
    });
  }, []);

  const dismissJinniNudge = useCallback(() => {
    setShowJinniNudge(false);
    AsyncStorage.setItem(JINNI_NUDGE_STORAGE_KEY, String(JINNI_NUDGE_MAX_SHOWS));
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const openLocationPicker = useCallback(() => {
    setPincodeDraft(pincode);
    setLocationModalVisible(true);
  }, [pincode]);

  const confirmLocation = useCallback(() => {
    if (pincodeDraft.length !== 6) {
      Alert.alert('Invalid pincode', 'Please enter a valid 6-digit pincode.');
      return;
    }
    savePincode(pincodeDraft);
    setLocationModalVisible(false);
  }, [pincodeDraft, savePincode]);

  const requirePincode = useCallback(
    (onReady: () => void) => {
      if (!isPincodeSet) {
        openLocationPicker();
        return;
      }
      onReady();
    },
    [isPincodeSet, openLocationPicker]
  );

  const handleSearchPress = useCallback(() => {
    // No dedicated unified-search screen exists in this app yet — flagged
    // in the engineering report rather than linking to a route that would
    // crash navigation.
    Alert.alert('Search', 'Universal search is coming soon.');
  }, []);

  const heroSlides: HeroSlide[] = useMemo(
    () => [
      {
        id: 'food',
        image: homeAssets.heroFood,
        eyebrow: 'FOOD DELIVERY',
        title: 'Everything you love, nearby',
        subtitle: 'Discover local food around you',
        onPress: () => requirePincode(() => navigation.navigate('Food')),
      },
      {
        id: 'rides',
        image: homeAssets.heroRide,
        eyebrow: 'RIDES',
        title: 'Go anywhere nearby',
        subtitle: 'Quick and convenient rides',
        onPress: () => requirePincode(() => navigation.navigate('Cab')),
      },
      {
        id: 'stores',
        image: homeAssets.heroStores,
        eyebrow: 'LOCAL STORES',
        title: 'Your neighbourhood, delivered',
        subtitle: 'Shop from stores around you',
        onPress: () => requirePincode(() => navigation.navigate('Grocery')),
      },
      {
        id: 'jinni',
        image: homeAssets.heroJinni,
        eyebrow: 'JINNI',
        title: 'Tap the lamp, make a wish',
        subtitle: 'Chirag gets it done',
        onPress: () => openJinni('homeNudge'),
      },
    ],
    [navigation, requirePincode, openJinni]
  );

  const categories: ServiceCategoryConfig[] = useMemo(
    () => [
      {
        id: 'food',
        title: 'Food',
        subtitle: '25–40 min',
        tint: colors.food.primary + '14',
        image: homeAssets.catFood,
        onPress: () => requirePincode(() => navigation.navigate('Food')),
      },
      {
        id: 'mart',
        title: 'Mart',
        subtitle: '10–15 min',
        tint: colors.grocery.primary + '14',
        image: homeAssets.catMart,
        onPress: () => requirePincode(() => navigation.navigate('Grocery')),
      },
      {
        id: 'rides',
        title: 'Rides',
        subtitle: '3 min away',
        tint: colors.cab.primary + '14',
        image: homeAssets.catRide,
        onPress: () => requirePincode(() => navigation.navigate('Cab')),
      },
      {
        id: 'local-stores',
        title: 'Local Stores',
        subtitle: 'Neighbourhood shops',
        tint: colors.primary[50],
        image: homeAssets.catLocalStore,
        onPress: () => requirePincode(() => navigation.navigate('Grocery')),
      },
      {
        id: 'salon',
        title: 'Salon',
        subtitle: 'Beauty & grooming',
        tint: colors.salon.primary + '14',
        icon: 'cut-outline',
        comingSoon: true,
      },
      {
        id: 'services',
        title: 'Services',
        subtitle: 'More near you',
        tint: colors.gray[100],
        icon: 'apps-outline',
        comingSoon: true,
      },
    ],
    [navigation, requirePincode]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />
        }
      >
        <LocationHeader
          state={isPincodeSet ? 'set' : 'unset'}
          city={city}
          pincode={pincode}
          notificationCount={0}
          onChangeLocation={openLocationPicker}
          onNotifications={() => Alert.alert('Notifications', 'No new notifications yet.')}
          onProfile={() => navigation.navigate('Profile')}
        />

        <HomeSearchBar onPress={handleSearchPress} />

        <HeroCarousel slides={heroSlides} intervalMs={3500} />

        {!isPincodeSet && <LocationPrompt onPress={openLocationPicker} />}

        {showJinniNudge && !wishes.isExhausted && (
          <TryJinniNudgeCard
            remaining={wishes.remaining}
            onPress={() => {
              dismissJinniNudge();
              openJinni('homeNudge');
            }}
            onDismiss={dismissJinniNudge}
          />
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Explore services</Text>
            <Text style={styles.sectionSubtitle}>
              {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Everything nearby, in one place'}
            </Text>
          </View>
          <View style={styles.grid}>
            {categories.map((c) => (
              <ServiceCategoryCard key={c.id} {...c} />
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={locationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Where should we deliver?</Text>
            <Text style={styles.modalSubtitle}>
              Enter your 6-digit pincode to see local stores, food and rides near you.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 305001"
              placeholderTextColor={colors.gray[400]}
              value={pincodeDraft}
              onChangeText={setPincodeDraft}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              onSubmitEditing={confirmLocation}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setLocationModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmLocation}>
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  section: { paddingHorizontal: spacing.xl, marginBottom: spacing.xxxl },
  sectionHeader: { marginBottom: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.gray[900], letterSpacing: -0.2 },
  sectionSubtitle: { ...typography.body2, color: colors.gray[500], marginTop: 2 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  modalTitle: { ...typography.h5, color: colors.gray[900] },
  modalSubtitle: { ...typography.body2, color: colors.gray[500], marginTop: spacing.xs, marginBottom: spacing.lg },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.gray[300],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontWeight: '600',
    color: colors.gray[900],
    marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalCancel: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.gray[100],
  },
  modalCancelText: { fontWeight: '700', color: colors.gray[700] },
  modalConfirm: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.primary[500],
  },
  modalConfirmText: { fontWeight: '700', color: colors.white },
});

export default CustomerHomeScreen;
