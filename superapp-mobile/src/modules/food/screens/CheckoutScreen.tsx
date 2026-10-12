import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FoodStackParamList } from '@navigation/stacks/FoodStack';
import { AppButton } from '@components/AppButton';
import { formatPrice } from '@utils/helpers';
import { api } from '@services/api';
import { useCartStore } from '@modules/cart/store/cartStore';
import { useLocationStore } from '@store/locationStore';
import { useFoodStore } from '../store/foodStore';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { initiatePaytm, startPaytmPayment, verifyPaytm } from '@services/paytm.service';

const FOOD = colors.food?.primary || '#FF6B6B';

type Addr = {
  id?: string;
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
};

const SectionTitle: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string }> = ({ icon, label }) => (
  <View style={styles.sectionRow}>
    <Ionicons name={icon} size={15} color={colors.text.secondary} />
    <Text style={styles.section}>{label}</Text>
  </View>
);

/**
 * Food checkout — address, COD/UPI, coupon, delivery fee only here.
 * Places order via POST /food/orders (quantity + delivery_address required).
 */
export const CheckoutScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<FoodStackParamList, 'Checkout'>>();
  const { restaurantId, items } = route.params as {
    restaurantId: string;
    items: { id: string; name: string; price: number; quantity: number; optionIds?: string[] }[];
  };
  const clearModule = useCartStore((s) => s.clearModule);
  const clearCart = useCartStore((s) => s.clearCart);
  const pincodeFromHome = useLocationStore((s) => s.pincode) || '';
  const restaurant = useFoodStore((s) => s.selectedRestaurant);

  const [addresses, setAddresses] = useState<Addr[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string | null>(null);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('Jaipur');
  const [stateName, setStateName] = useState('Rajasthan');
  const [pincode, setPincode] = useState(pincodeFromHome || '302001');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState<'cod' | 'online'>('cod');
  const [coupon, setCoupon] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAddr, setLoadingAddr] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data: any = await api.get('/users/addresses');
        const list: Addr[] = Array.isArray(data) ? data : data?.addresses || [];
        setAddresses(list);
        const def = list.find((a: any) => a.is_default) || list[0];
        if (def) {
          setSelectedAddrId(def.id || null);
          setLine1(def.line1 || '');
          setLine2(def.line2 || '');
          setCity(def.city || 'Jaipur');
          setStateName(def.state || 'Rajasthan');
          setPincode(def.pincode || pincodeFromHome || '302001');
          setLandmark(def.landmark || '');
          setLatitude(def.latitude);
          setLongitude(def.longitude);
        }
      } catch {
        /* addresses optional until migration */
      } finally {
        setLoadingAddr(false);
      }
    })();
  }, [pincodeFromHome]);

  const subtotal = useMemo(
    () => items.reduce((s, i) => s + i.price * i.quantity, 0),
    [items]
  );
  const deliveryFee = Number(restaurant?.delivery_fee ?? restaurant?.deliveryFee ?? 30);
  const freeAbove = restaurant?.free_delivery_above;
  const packaging = Number(restaurant?.packaging_fee ?? 0);
  const effectiveDelivery =
    freeAbove != null && subtotal >= Number(freeAbove) ? 0 : deliveryFee;
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const total = Math.max(0, subtotal + effectiveDelivery + packaging + tax - couponDiscount);

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    try {
      const data: any = await api.post('/coupons/validate', {
        code: coupon.trim().toUpperCase(),
        order_type: 'food',
        subtotal,
        restaurant_id: restaurantId,
      });
      const disc = Number(data.discount_amount || data.discount || 0);
      setCouponDiscount(disc);
      setCouponMsg(data.message || `Saved ${formatPrice(disc)}`);
    } catch (e: any) {
      setCouponDiscount(0);
      setCouponMsg(
        e.response?.data?.detail || e.response?.data?.message || 'Invalid coupon'
      );
    }
  };

  const selectSaved = (a: Addr) => {
    setSelectedAddrId(a.id || null);
    setLine1(a.line1);
    setLine2(a.line2 || '');
    setCity(a.city);
    setStateName(a.state);
    setPincode(a.pincode);
    setLandmark(a.landmark || '');
    setLatitude(a.latitude);
    setLongitude(a.longitude);
  };

  const handlePlaceOrder = async () => {
    if (!line1.trim() || line1.trim().length < 3) {
      Alert.alert('Address', 'Enter house / street (min 3 characters).');
      return;
    }
    if (!pincode || pincode.length !== 6) {
      Alert.alert('Pincode', 'Enter a valid 6-digit pincode.');
      return;
    }

    // Guard: backend FoodOrderCreate expects real UUIDs. Bad/empty values
    // produce the exact "Input should be a valid UUID..." 422 you see on UPI.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!restaurantId || !UUID_RE.test(String(restaurantId))) {
      Alert.alert(
        'Cart error',
        'Restaurant id is missing or invalid. Clear the cart, open the restaurant again, and re-add items.',
      );
      return;
    }
    if (!items?.length) {
      Alert.alert('Empty cart', 'Add items before placing an order.');
      return;
    }
    for (const item of items) {
      if (!item?.id || !UUID_RE.test(String(item.id))) {
        Alert.alert(
          'Cart error',
          `Menu item "${item?.name || 'item'}" has an invalid id. Remove it and add it again from the menu.`,
        );
        return;
      }
      const badOpts = (item.optionIds || []).filter((oid) => oid && !UUID_RE.test(String(oid)));
      if (badOpts.length) {
        Alert.alert(
          'Cart error',
          `Invalid option on "${item.name}". Remove the item and re-add with options from the menu.`,
        );
        return;
      }
    }

    setLoading(true);
    try {
      // Always create the merchant order on our backend first. For online payments,
      // the restaurant only sees the order after Paytm confirms payment.
      const order: any = await api.post('/food/orders', {
        restaurant_id: String(restaurantId).trim(),
        items: items.map((item) => ({
          menu_item_id: String(item.id).trim(),
          quantity: Number(item.quantity) || 1,
          // Drop empty/null option ids so Pydantic never sees "" as a UUID
          option_ids: (item.optionIds || [])
            .map((oid) => String(oid).trim())
            .filter((oid) => UUID_RE.test(oid)),
        })),
        delivery_address: {
          line1: line1.trim(),
          line2: line2.trim() || null,
          city: city.trim() || 'City',
          state: stateName.trim() || 'State',
          pincode,
          landmark: landmark.trim() || null,
          latitude: latitude != null && Number.isFinite(Number(latitude)) ? Number(latitude) : null,
          longitude: longitude != null && Number.isFinite(Number(longitude)) ? Number(longitude) : null,
        },
        payment_method: payment, // 'cod' | 'online' — matches backend pattern
        notes: notes.trim() || null,
        coupon_code: coupon.trim() ? coupon.trim().toUpperCase() : null,
      });

      const orderId = order?.id != null ? String(order.id) : '';
      if (!UUID_RE.test(orderId)) {
        throw new Error(
          'Order was not created correctly (missing id). Please try again. If this keeps happening, check backend logs for POST /food/orders.',
        );
      }

      if (payment === 'online') {
        const session = await initiatePaytm(orderId);
        if (!session.already_paid) {
          await startPaytmPayment(session);
        }
        // Never trust the native SDK result alone; reconcile server-to-server with Paytm.
        const verification = await verifyPaytm(orderId);
        if (verification.payment_status !== 'paid') {
          Alert.alert(
            verification.gateway_status === 'PENDING' ? 'Payment pending' : 'Payment not completed',
            verification.gateway_status === 'PENDING'
              ? 'Your bank is still confirming the payment. You can check the order status again shortly.'
              : 'No amount has been confirmed by Paytm. You can retry the payment.',
            [{ text: 'OK' }],
          );
          return;
        }
      }

      clearModule('food'); // keep grocery lines in unified cart
      Alert.alert(
        payment === 'online' ? 'Payment successful' : 'Order placed',
        `Order ${order.order_number || ''} confirmed.`,
        [
          {
            text: 'Track',
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'OrderTracking' as never,
                    params: { orderId } as never,
                  },
                ],
              }),
          },
        ],
      );
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      let msg = 'Could not place order';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        // Include field path so "valid UUID" errors show restaurant_id / menu_item_id / option_ids
        msg = detail
          .map((d: any) => {
            const loc = Array.isArray(d.loc) ? d.loc.filter((x: any) => x !== 'body').join('.') : '';
            const m = d.msg || String(d);
            return loc ? `${loc}: ${m}` : m;
          })
          .join('\n');
      } else if (detail?.message) {
        msg = detail.message;
      } else if (error.response?.data?.message) {
        msg = error.response.data.message;
      } else if (error?.message) {
        msg = error.message;
      }
      Alert.alert('Payment / order failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Checkout</Text>

        {/* Saved addresses */}
        <SectionTitle icon="location-outline" label="Delivery address" />
        {loadingAddr ? (
          <ActivityIndicator color={FOOD} />
        ) : addresses.length > 0 ? (
          addresses.map((a) => {
            const on = selectedAddrId === a.id;
            return (
              <TouchableOpacity
                key={a.id || a.line1}
                style={[styles.addrCard, on && styles.addrCardOn]}
                onPress={() => selectSaved(a)}
                activeOpacity={0.85}
              >
                <View style={styles.addrCardTop}>
                  <Text style={styles.addrLabel}>{a.label || 'Saved address'}</Text>
                  <View style={[styles.radioDot, on && styles.radioDotOn]}>
                    {on && <Ionicons name="checkmark" size={11} color={colors.white} />}
                  </View>
                </View>
                <Text style={styles.addrText}>
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ''} · {a.city} · {a.pincode}
                </Text>
              </TouchableOpacity>
            );
          })
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="House / flat / street *"
          value={line1}
          onChangeText={setLine1}
          placeholderTextColor={colors.gray[400]}
        />
        <TextInput
          style={styles.input}
          placeholder="Landmark (optional)"
          value={line2 || landmark}
          onChangeText={(t) => {
            setLine2(t);
            setLandmark(t);
          }}
          placeholderTextColor={colors.gray[400]}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="City"
            value={city}
            onChangeText={setCity}
            placeholderTextColor={colors.gray[400]}
          />
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Pincode"
            value={pincode}
            onChangeText={setPincode}
            keyboardType="number-pad"
            maxLength={6}
            placeholderTextColor={colors.gray[400]}
          />
        </View>

        {/* Payment */}
        <SectionTitle icon="card-outline" label="Payment" />
        <View style={styles.payRow}>
          <TouchableOpacity style={[styles.payChip, payment === 'cod' && styles.payChipOn]} onPress={() => setPayment('cod')} activeOpacity={0.85}>
            {payment === 'cod' && <Ionicons name="checkmark-circle" size={14} color={FOOD} style={{ marginRight: 5 }} />}
            <Text style={[styles.payText, payment === 'cod' && styles.payTextOn]}>Cash on delivery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.payChip, payment === 'online' && styles.payChipOn]}
            onPress={() => setPayment('online')}
            activeOpacity={0.85}
          >
            {payment === 'online' && <Ionicons name="checkmark-circle" size={14} color={FOOD} style={{ marginRight: 5 }} />}
            <Text style={[styles.payText, payment === 'online' && styles.payTextOn]}>UPI / Online (Paytm)</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Online payments are confirmed by Paytm on the server before the order is marked paid.
        </Text>

        {/* Coupon */}
        <SectionTitle icon="pricetag-outline" label="Coupon" />
        <View style={styles.couponRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Code (e.g. FIRST50)"
            autoCapitalize="characters"
            value={coupon}
            onChangeText={setCoupon}
            placeholderTextColor={colors.gray[400]}
          />
          <TouchableOpacity style={styles.couponBtn} onPress={applyCoupon}>
            <Text style={styles.couponBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
        {!!couponMsg && (
          <View style={styles.couponMsgRow}>
            <Ionicons
              name={couponDiscount > 0 ? 'checkmark-circle' : 'alert-circle'}
              size={13}
              color={couponDiscount > 0 ? colors.success.DEFAULT : colors.error.DEFAULT}
            />
            <Text style={[styles.couponMsg, couponDiscount > 0 ? styles.ok : styles.bad]}>
              {couponMsg}
            </Text>
          </View>
        )}

        <SectionTitle icon="chatbubble-ellipses-outline" label="Notes for restaurant" />
        <TextInput
          style={[styles.input, { height: 72 }]}
          placeholder="Less spicy, extra napkins…"
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholderTextColor={colors.gray[400]}
        />

        {/* Bill — delivery only shown at checkout */}
        <View style={styles.summary}>
          <View style={styles.sectionRow}>
            <Ionicons name="receipt-outline" size={15} color={colors.text.secondary} />
            <Text style={styles.summaryTitle}>Bill details</Text>
          </View>
          {items.map((i) => (
            <View key={i.id} style={styles.sumRow}>
              <Text style={styles.sumName}>
                {i.quantity}× {i.name}
              </Text>
              <Text style={styles.sumPrice}>{formatPrice(i.price * i.quantity)}</Text>
            </View>
          ))}
          <View style={styles.sumRow}>
            <Text style={styles.sumName}>Item total</Text>
            <Text style={styles.sumPrice}>{formatPrice(subtotal)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumName}>Delivery fee</Text>
            <Text style={styles.sumPrice}>
              {effectiveDelivery === 0 ? 'FREE' : formatPrice(effectiveDelivery)}
            </Text>
          </View>
          {packaging > 0 && (
            <View style={styles.sumRow}>
              <Text style={styles.sumName}>Packaging</Text>
              <Text style={styles.sumPrice}>{formatPrice(packaging)}</Text>
            </View>
          )}
          <View style={styles.sumRow}>
            <Text style={styles.sumName}>GST (5%)</Text>
            <Text style={styles.sumPrice}>{formatPrice(tax)}</Text>
          </View>
          {couponDiscount > 0 && (
            <View style={styles.sumRow}>
              <Text style={[styles.sumName, { color: colors.success.DEFAULT }]}>Coupon</Text>
              <Text style={[styles.sumPrice, { color: colors.success.DEFAULT }]}>
                −{formatPrice(couponDiscount)}
              </Text>
            </View>
          )}
          <View style={[styles.sumRow, styles.total]}>
            <Text style={styles.totalLabel}>To pay</Text>
            <Text style={styles.totalVal}>{formatPrice(total)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          title={
            loading
              ? 'Placing order…'
              : payment === 'cod'
                ? `Place COD · ${formatPrice(total)}`
                : `Pay online · ${formatPrice(total)}`
          }
          onPress={handlePlaceOrder}
          size="large"
          disabled={loading}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  scroll: { padding: spacing.lg, paddingBottom: 24 },
  title: { fontSize: 24, color: colors.gray[900], marginBottom: spacing.md, fontFamily: fontFamily.bold},
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  section: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
    color: colors.gray[700],
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    color: colors.gray[900],
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  addrCard: {
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  addrCardOn: { borderColor: FOOD, backgroundColor: colors.secondary[50] },
  addrCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addrLabel: { fontSize: 13, color: colors.gray[800], fontFamily: fontFamily.bold},
  addrText: { fontSize: 13, color: colors.gray[500], marginTop: 4, fontFamily: fontFamily.regular},
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotOn: { borderColor: FOOD, backgroundColor: FOOD },
  payRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  payChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
  },
  payChipOn: { borderColor: FOOD, backgroundColor: colors.secondary[50] },
  payChipDisabled: { backgroundColor: colors.surface.sunken, borderColor: colors.gray[200] },
  payText: { color: colors.gray[700], fontSize: 13, fontFamily: fontFamily.semiBold},
  payTextOn: { color: FOOD },
  payTextDisabled: { color: colors.gray[400] },
  hint: { fontSize: 11, color: colors.gray[400], marginTop: 6, fontFamily: fontFamily.regular},
  couponRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  couponBtn: {
    backgroundColor: FOOD,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  couponBtnText: { color: colors.white, fontFamily: fontFamily.bold},
  couponMsgRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  couponMsg: { fontSize: 12, fontFamily: fontFamily.regular},
  ok: { color: colors.success.DEFAULT },
  bad: { color: colors.error.DEFAULT },
  summary: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  summaryTitle: { fontSize: 15, color: colors.gray[900], fontFamily: fontFamily.bold},
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sumName: { fontSize: 14, color: colors.gray[700], flex: 1, fontFamily: fontFamily.regular},
  sumPrice: { fontSize: 14, color: colors.gray[800], fontFamily: fontFamily.regular},
  total: { borderTopWidth: 1, borderTopColor: colors.gray[200], paddingTop: 8, marginTop: 4 },
  totalLabel: { fontSize: 16, fontFamily: fontFamily.bold},
  totalVal: { fontSize: 16, color: FOOD, fontFamily: fontFamily.bold},
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray[200],
  },
});

export default CheckoutScreen;
