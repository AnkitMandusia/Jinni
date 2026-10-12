import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppInput } from '@components/AppInput';
import { AppButton } from '@components/AppButton';
import { colors } from '@theme/colors';
import { fontFamily, typography } from '@theme/typography';
import { borderRadius, shadows, spacing } from '@theme/spacing';
import { api } from '@services/api';

interface Subcategory { id: string; label: string; }
interface Category { id: string; label: string; icon: string; subcategories: Subcategory[]; }

const FAQS = [
  { q: 'How do I track my order?', a: 'Go to My Orders from your Profile tab and tap on the order to see live tracking.' },
  { q: 'How do I cancel an order?', a: 'You can cancel from My Orders within a few minutes of placing it, before the store/restaurant accepts it.' },
  { q: 'When will I get my refund?', a: 'Refunds to UPI/cards are usually processed within 3-5 business days after the order is cancelled/returned.' },
  { q: 'How do I change my delivery address?', a: 'You can manage addresses from Profile > Saved Addresses, or add a new one at checkout.' },
];

export const HelpSupportScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [categories, setCategories] = useState<Category[]>([]);
  const [sheetVisible, setSheetVisible] = useState(!!route.params?.openReport);
  const [step, setStep] = useState<'category' | 'subcategory' | 'details'>('category');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<Subcategory | null>(null);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; description?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data: any = await api.get('/support/categories');
        setCategories(Array.isArray(data) ? data : []);
      } catch {
        // category sheet degrades to disabled state if offline
      }
    })();
  }, []);

  const resetSheet = () => {
    setStep('category');
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setReason('');
    setDescription('');
    setErrors({});
  };

  const openSheet = () => {
    resetSheet();
    setSheetVisible(true);
  };

  const closeSheet = () => {
    setSheetVisible(false);
    resetSheet();
  };

  const validateDetails = () => {
    const next: { reason?: string; description?: string } = {};
    if (!reason.trim() || reason.trim().length < 3) next.reason = 'Enter a short reason (min 3 characters).';
    if (!description.trim() || description.trim().length < 10) next.description = 'Please describe the issue in at least 10 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !selectedSubcategory) return;
    if (!validateDetails()) return;
    setSubmitting(true);
    try {
      await api.post('/support/tickets', {
        category: selectedCategory.id,
        subcategory: selectedSubcategory.id,
        reason: reason.trim(),
        description: description.trim(),
        order_id: route.params?.reportOrderId || undefined,
      });
      closeSheet();
      Alert.alert(
        'Report submitted',
        'Thanks for letting us know. Our team will review this and contact you shortly.',
        [{ text: 'OK' }],
      );
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      Alert.alert('Could not submit', typeof detail === 'string' ? detail : 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <TouchableOpacity style={styles.reportCard} onPress={openSheet} activeOpacity={0.85}>
          <View style={styles.reportIconWrap}>
            <Ionicons name="megaphone-outline" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle}>Report an issue</Text>
            <Text style={styles.reportSub}>Tell us what went wrong — our team will contact you.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.gray[400]} />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Frequently asked questions</Text>
        <View style={styles.card}>
          {FAQS.map((item, idx) => (
            <View key={item.q}>
              <TouchableOpacity
                style={styles.faqRow}
                onPress={() => setOpenFaq(openFaq === idx ? null : idx)}
                activeOpacity={0.7}
              >
                <Text style={styles.faqQ}>{item.q}</Text>
                <Ionicons name={openFaq === idx ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray[400]} />
              </TouchableOpacity>
              {openFaq === idx && <Text style={styles.faqA}>{item.a}</Text>}
              {idx < FAQS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Other ways to reach us</Text>
        <View style={styles.card}>
          <View style={styles.contactRow}>
            <Ionicons name="call-outline" size={18} color={colors.primary[600]} />
            <Text style={styles.contactText}>Support: +91 1800-123-4567 (9am-9pm)</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.contactRow}>
            <Ionicons name="mail-outline" size={18} color={colors.primary[600]} />
            <Text style={styles.contactText}>support@ourapp.com</Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={sheetVisible} animationType="slide" transparent onRequestClose={closeSheet}>
        <View style={styles.sheetBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                {step !== 'category' ? (
                  <TouchableOpacity
                    onPress={() => setStep(step === 'details' ? 'subcategory' : 'category')}
                    hitSlop={8}
                  >
                    <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
                  </TouchableOpacity>
                ) : <View style={{ width: 22 }} />}
                <Text style={styles.sheetTitle}>
                  {step === 'category' ? 'What is this about?' : step === 'subcategory' ? selectedCategory?.label : 'Tell us more'}
                </Text>
                <TouchableOpacity onPress={closeSheet} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.gray[700]} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
                {step === 'category' && (
                  <View style={{ paddingBottom: spacing.lg }}>
                    {categories.length === 0 && (
                      <Text style={styles.offlineHint}>Couldn't load categories. Check your connection and reopen this sheet.</Text>
                    )}
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={styles.pickRow}
                        onPress={() => { setSelectedCategory(cat); setStep('subcategory'); }}
                      >
                        <View style={styles.pickIconWrap}>
                          <Ionicons name={cat.icon as any} size={18} color={colors.primary[600]} />
                        </View>
                        <Text style={styles.pickLabel}>{cat.label}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {step === 'subcategory' && selectedCategory && (
                  <View style={{ paddingBottom: spacing.lg }}>
                    {selectedCategory.subcategories.map((sub) => (
                      <TouchableOpacity
                        key={sub.id}
                        style={styles.pickRow}
                        onPress={() => { setSelectedSubcategory(sub); setReason(sub.label); setStep('details'); }}
                      >
                        <Text style={styles.pickLabel}>{sub.label}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {step === 'details' && (
                  <View style={{ paddingBottom: spacing.lg }}>
                    <AppInput
                      label="Reason"
                      placeholder="A short summary"
                      value={reason}
                      onChangeText={(v) => { setReason(v); if (errors.reason) setErrors((e) => ({ ...e, reason: undefined })); }}
                      error={errors.reason}
                    />
                    <AppInput
                      label="Description"
                      placeholder="Describe what happened in detail..."
                      value={description}
                      onChangeText={(v) => { setDescription(v); if (errors.description) setErrors((e) => ({ ...e, description: undefined })); }}
                      error={errors.description}
                      multiline
                      numberOfLines={4}
                      style={{ height: 100, textAlignVertical: 'top' }}
                    />
                    <AppButton
                      title="Send report"
                      onPress={handleSubmit}
                      loading={submitting}
                      disabled={submitting}
                      fullWidth
                      style={{ marginTop: spacing.md }}
                    />
                    <Text style={styles.sheetFootnote}>Our team will review this and contact you if needed.</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  reportCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.primary[500], borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.xl, ...shadows.md,
  },
  reportIconWrap: {
    width: 44, height: 44, borderRadius: borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  reportTitle: { ...typography.body1, fontFamily: fontFamily.bold, color: colors.white },
  reportSub: { ...typography.caption, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  sectionTitle: { ...typography.overline, color: colors.gray[500], marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: { backgroundColor: colors.white, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.xl, ...shadows.sm },
  divider: { height: 1, backgroundColor: colors.gray[100] },
  faqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  faqQ: { ...typography.body2, color: colors.gray[900], flex: 1, marginRight: spacing.sm, fontFamily: fontFamily.medium },
  faqA: { ...typography.caption, color: colors.gray[500], paddingBottom: spacing.md },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  contactText: { ...typography.body2, color: colors.gray[700] },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray[200], alignSelf: 'center', marginBottom: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sheetTitle: { ...typography.h4, color: colors.gray[900], flex: 1, textAlign: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray[100] },
  pickIconWrap: { width: 32, height: 32, borderRadius: borderRadius.sm, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  pickLabel: { ...typography.body1, color: colors.gray[900], flex: 1 },
  offlineHint: { ...typography.caption, color: colors.gray[400], textAlign: 'center', paddingVertical: spacing.xl },
  sheetFootnote: { ...typography.caption, color: colors.gray[400], textAlign: 'center', marginTop: spacing.md },
});

export default HelpSupportScreen;
