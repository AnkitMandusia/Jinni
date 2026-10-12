import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { EmptyState, ListSkeleton } from '@components';
import { useFoodStore, Restaurant } from '../store/foodStore';
import { useLocationStore } from '@store/locationStore';
import { OrderWithJinniButton } from '../components/OrderWithJinniButton';

const FOOD = colors.food?.primary || '#FF6B6B';
const GAP = 12;
const COLS = 2;
const SCREEN_W = Dimensions.get('window').width;
const CARD_W = (SCREEN_W - spacing.lg * 2 - GAP) / COLS;
const HERO_W = SCREEN_W - spacing.lg * 2;
const HERO_H = 132;

/** Promo hero slides — icon-led, not emoji-led */
const HERO_SLIDES = [
  {
    id: 'sealed',
    icon: 'cube-outline' as const,
    title: 'Separate sealed bag',
    subtitle: 'Food travels in its own sealed pack — never mixed with grocery or other orders.',
    bg: colors.secondary[50],
    accent: FOOD,
  },
  {
    id: 'rider',
    icon: 'bicycle-outline' as const,
    title: 'Dedicated food rider',
    subtitle: 'A different rider for food delivery. Faster, focused, restaurant to your door.',
    bg: colors.info.light,
    accent: colors.info.DEFAULT,
  },
  {
    id: 'veg',
    icon: 'leaf-outline' as const,
    title: 'Veg & non-veg, clearly marked',
    subtitle: 'Green / red indicators on every dish. Pure-veg filter when you need it.',
    bg: colors.success.light,
    accent: colors.success.DEFAULT,
  },
];

function RatingChip({ rating, count }: { rating: number; count: number }) {
  if (!count) {
    return (
      <View style={[styles.ratingChip, { backgroundColor: colors.gray[200] }]}>
        <Text style={[styles.ratingText, { color: colors.gray[600] }]}>NEW</Text>
      </View>
    );
  }
  const bg = rating >= 4 ? colors.success.DEFAULT : colors.warning.DEFAULT;
  return (
    <View style={[styles.ratingChip, { backgroundColor: bg }]}>
      <Ionicons name="star" size={10} color={colors.white} />
      <Text style={[styles.ratingText, { marginLeft: 3 }]}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function GridCard({ item, onPress }: { item: Restaurant; onPress: () => void }) {
  const open = item.isOpen && item.is_accepting_orders !== false;
  const img = item.cover_image_url || item.logo_url || item.imageUrl;

  return (
    <TouchableOpacity
      style={[styles.card, !open && styles.cardClosed]}
      onPress={onPress}
      activeOpacity={0.9}
      disabled={!open}
    >
      <View style={styles.imageWrap}>
        {img ? (
          <Image source={{ uri: img }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePh]}>
            <Ionicons name="restaurant-outline" size={32} color={colors.secondary[300]} />
          </View>
        )}
        {!open && (
          <View style={styles.closedMask}>
            <Text style={styles.closedText}>Closed</Text>
          </View>
        )}
        {item.pure_veg ? (
          <View style={styles.pureVeg}>
            <Text style={styles.pureVegText}>PURE VEG</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.cuisine} numberOfLines={1}>
          {(item.cuisines || item.cuisine || []).join(', ')}
        </Text>
        {item.matchedDish ? (
          <View style={styles.matchChip}>
            <Ionicons name="search" size={9} color={FOOD} />
            <Text style={styles.matchChipText} numberOfLines={1}>
              Has "{item.matchedDish}"
            </Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <RatingChip rating={item.rating || item.rating_avg || 0} count={item.rating_count || 0} />
          <Text style={styles.meta}>
            {item.deliveryTime || item.delivery_time_estimate || '30 min'}
          </Text>
        </View>
        <Text style={styles.fee}>
          ₹{item.deliveryFee ?? item.delivery_fee ?? 0} delivery
          {(item.minOrder ?? item.min_order_amount)
            ? ` · Min ₹${item.minOrder ?? item.min_order_amount}`
            : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function HeroSlider() {
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % HERO_SLIDES.length;
        ref.current?.scrollTo({ x: next * (HERO_W + 12), animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / (HERO_W + 12));
    if (i !== index && i >= 0 && i < HERO_SLIDES.length) setIndex(i);
  };

  return (
    <View style={styles.heroWrap}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={HERO_W + 12}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}
      >
        {HERO_SLIDES.map((slide) => (
          <View
            key={slide.id}
            style={[styles.heroCard, { backgroundColor: slide.bg[0], width: HERO_W }]}
          >
            <View style={[styles.heroEmojiWrap, { backgroundColor: colors.white }]}>
              <Ionicons name={slide.icon} size={26} color={slide.accent} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: slide.accent }]}>{slide.title}</Text>
              <Text style={styles.heroSub} numberOfLines={3}>
                {slide.subtitle}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {HERO_SLIDES.map((s, i) => (
          <View key={s.id} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

export const RestaurantListScreen: React.FC = () => {
  const navigation = useNavigation();
  const { restaurants, isLoading, error, fetchRestaurants, totalRestaurants } = useFoodStore();
  const pincode = useLocationStore((s) => s.pincode);
  const city = useLocationStore((s) => s.city);
  const setPincode = useLocationStore((s) => s.setPincode);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [usePincodeFilter, setUsePincodeFilter] = useState(true);
  const [vegOnly, setVegOnly] = useState(false);
  const [topRatedOnly, setTopRatedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'rating' | 'delivery_time' | 'cost_low' | 'cost_high'>('relevance');

  const load = useCallback(() => {
    const params: Record<string, any> = { sort_by: sortBy };
    if (search.trim()) params.search = search.trim();
    if (usePincodeFilter && pincode?.length === 6) params.pincode = pincode;
    if (vegOnly) params.pure_veg = true;
    if (topRatedOnly) params.min_rating = 4;
    fetchRestaurants(params);
  }, [fetchRestaurants, pincode, search, usePincodeFilter, vegOnly, topRatedOnly, sortBy]);

  useEffect(() => {
    // Debounce text search so partial/fast typing ("burg", "burge", "burger")
    // doesn't fire a request per keystroke — fire once typing settles.
    const delay = search.trim().length > 0 ? 300 : 0;
    const t = setTimeout(load, delay);
    return () => clearTimeout(t);
  }, [load, search]);

  const listHeader = (
    <View>
      <HeroSlider />
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabel}>Restaurants near you</Text>
        {restaurants.length > 0 ? (
          <Text style={styles.sectionCount}>{restaurants.length} places</Text>
        ) : null}
      </View>
      <View style={styles.jinniRow}>
        <OrderWithJinniButton />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.toolbar}>
        {/* Location pill — Swiggy/Zomato style "DELIVERING TO" row */}
        <TouchableOpacity
          style={styles.locationRow}
          activeOpacity={0.7}
          onPress={() => setUsePincodeFilter((v) => !v)}
        >
          <Ionicons name="location" size={16} color={FOOD} />
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={styles.locationEyebrow}>DELIVERING TO</Text>
            <View style={styles.locationValueRow}>
              <Text style={styles.locationValue} numberOfLines={1}>
                {pincode?.length === 6
                  ? `${city ? `${city} · ` : ''}${pincode}${!usePincodeFilter ? ' · all areas' : ''}`
                  : 'Set your location'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.gray[500]} />
            </View>
          </View>
          <TouchableOpacity
            style={styles.vegToggle}
            onPress={() => setVegOnly((v) => !v)}
            hitSlop={8}
          >
            <View style={[styles.vegSqSmall, vegOnly && styles.vegSqSmallOn]}>
              {vegOnly && <View style={styles.vegDotSmall} />}
            </View>
            <Text style={[styles.vegToggleText, vegOnly && styles.vegToggleTextOn]}>Veg</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Search bar */}
        <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
          <Ionicons name="search" size={18} color={colors.gray[400]} />
          <TextInput
            style={styles.searchInput}
            placeholder='Search for restaurant, cuisine or dish'
            placeholderTextColor={colors.gray[400]}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={load}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); load(); }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.gray[400]} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter / sort chips — horizontally scrollable like Swiggy's filter strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterStrip}
        >
          <TouchableOpacity
            style={[styles.filterChip, topRatedOnly && styles.filterChipOn]}
            onPress={() => setTopRatedOnly((v) => !v)}
          >
            <Text style={[styles.filterChipText, topRatedOnly && styles.filterChipTextOn]}>Rating 4.0+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, sortBy === 'delivery_time' && styles.filterChipOn]}
            onPress={() => setSortBy((s) => (s === 'delivery_time' ? 'relevance' : 'delivery_time'))}
          >
            <Text style={[styles.filterChipText, sortBy === 'delivery_time' && styles.filterChipTextOn]}>Fast delivery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, sortBy === 'cost_low' && styles.filterChipOn]}
            onPress={() => setSortBy((s) => (s === 'cost_low' ? 'relevance' : 'cost_low'))}
          >
            <Text style={[styles.filterChipText, sortBy === 'cost_low' && styles.filterChipTextOn]}>Price: Low to High</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, sortBy === 'cost_high' && styles.filterChipOn]}
            onPress={() => setSortBy((s) => (s === 'cost_high' ? 'relevance' : 'cost_high'))}
          >
            <Text style={[styles.filterChipText, sortBy === 'cost_high' && styles.filterChipTextOn]}>Price: High to Low</Text>
          </TouchableOpacity>
          {pincode !== '302001' && (
            <TouchableOpacity
              style={styles.filterChip}
              onPress={() => { setPincode('302001', 'Jaipur'); setUsePincodeFilter(true); }}
            >
              <Text style={styles.filterChipText}>Demo 302001</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {isLoading && restaurants.length === 0 ? (
        <ListSkeleton count={6} />
      ) : (
        <FlatList
          data={restaurants}
          keyExtractor={(item) => item.id}
          numColumns={COLS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListHeaderComponent={listHeader}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
          renderItem={({ item }) => (
            <GridCard
              item={item}
              onPress={() =>
                navigation.navigate('RestaurantDetail' as never, { restaurantId: item.id } as never)
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="restaurant-outline" size={40} color={colors.gray[300]} />}
              title={error || 'No restaurants available'}
              description={
                usePincodeFilter && pincode
                  ? `Nothing for PIN ${pincode}. Try All areas or Demo 302001.`
                  : 'Check API / EXPO_PUBLIC_API_URL or seed data'
              }
              actionLabel="Retry"
              onAction={load}
            />
          }
          ListFooterComponent={
            restaurants.length > 0 && totalRestaurants > restaurants.length ? (
              <Text style={styles.footer}>
                Showing {restaurants.length} of {totalRestaurants}
              </Text>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[200],
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  locationEyebrow: { fontSize: 10, color: colors.gray[400], letterSpacing: 0.5, fontFamily: fontFamily.bold},
  locationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  locationValue: { fontSize: 15, color: colors.gray[900], flexShrink: 1, fontFamily: fontFamily.bold},
  vegToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: spacing.sm },
  vegSqSmall: {
    width: 15, height: 15, borderRadius: 3, borderWidth: 1.5, borderColor: colors.gray[300],
    alignItems: 'center', justifyContent: 'center',
  },
  vegSqSmallOn: { borderColor: colors.success.DEFAULT },
  vegDotSmall: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success.DEFAULT },
  vegToggleText: { fontSize: 12, color: colors.gray[500], fontFamily: fontFamily.bold},
  vegToggleTextOn: { color: colors.success.DEFAULT },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.gray[50],
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.lg,
    paddingHorizontal: 14,
    height: 46,
    marginBottom: spacing.sm,
  },
  searchBarFocused: { borderColor: FOOD },
  searchInput: { flex: 1, fontSize: 14, color: colors.gray[900], padding: 0, fontFamily: fontFamily.regular},
  filterStrip: { gap: 8, paddingRight: spacing.lg, paddingBottom: 2 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
  },
  filterChipOn: { backgroundColor: FOOD + '14', borderColor: FOOD },
  filterChipText: { fontSize: 12, color: colors.gray[600], fontFamily: fontFamily.bold},
  filterChipTextOn: { color: FOOD },
  heroWrap: { marginTop: spacing.md, marginBottom: spacing.sm },
  heroCard: {
    height: HERO_H,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  heroEmojiWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 28, fontFamily: fontFamily.regular},
  heroText: { flex: 1 },
  heroTitle: { fontSize: 16, marginBottom: 4, fontFamily: fontFamily.bold},
  heroSub: { fontSize: 12, color: colors.gray[600], lineHeight: 17, fontFamily: fontFamily.regular},
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray[300],
  },
  dotOn: { backgroundColor: FOOD, width: 16 },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  jinniRow: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionLabel: { fontSize: 16, color: colors.gray[900], fontFamily: fontFamily.bold},
  sectionCount: { fontSize: 12, color: colors.gray[500], fontFamily: fontFamily.semiBold},
  list: { paddingBottom: 32 },
  row: { gap: GAP, marginBottom: GAP, paddingHorizontal: spacing.lg },
  card: {
    width: CARD_W,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  cardClosed: { opacity: 0.7 },
  imageWrap: { width: '100%', height: CARD_W * 0.72, backgroundColor: colors.gray[100] },
  image: { width: '100%', height: '100%' },
  imagePh: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary[50] },
  closedMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedText: { color: colors.white, fontSize: 13, fontFamily: fontFamily.bold},
  pureVeg: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.success.light,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pureVegText: { fontSize: 9, color: colors.success.dark, fontFamily: fontFamily.bold},
  cardBody: { padding: 10 },
  name: { fontSize: 14, color: colors.gray[900], fontFamily: fontFamily.bold},
  matchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: FOOD + '14',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 3,
  },
  matchChipText: { fontSize: 10, color: FOOD, fontFamily: fontFamily.semiBold },
  cuisine: { fontSize: 11, color: colors.gray[500], marginTop: 2, fontFamily: fontFamily.regular},
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  ratingChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ratingText: { color: colors.white, fontSize: 11, fontFamily: fontFamily.bold},
  meta: { fontSize: 11, color: colors.gray[600], fontFamily: fontFamily.medium},
  fee: { fontSize: 11, color: colors.gray[500], marginTop: 4, fontFamily: fontFamily.regular},
  footer: { textAlign: 'center', color: colors.gray[400], fontSize: 12, paddingVertical: 12, fontFamily: fontFamily.regular},
});

export default RestaurantListScreen;
