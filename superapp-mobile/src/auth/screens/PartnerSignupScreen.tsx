import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { useAuthStore } from '../store/authStore';
import {
  EMPTY_FORM, PartnerForm, VEHICLES, maskDate, toPayload, validateStep,
} from '../utils/partnerKyc';

const P = jinniColors.purple;
const G = jinniColors.gold;
const STEPS = ['Vehicle', 'Vehicle details', 'You & licence', 'Contact & finish'];

type FieldProps = {
  label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string; hint?: string;
  keyboard?: 'default' | 'numeric' | 'phone-pad' | 'email-address'; caps?: 'none' | 'words' | 'characters'; secure?: boolean;
  maxLength?: number; date?: boolean;
};

const Field: React.FC<FieldProps> = ({ label, value, onChange, error, placeholder, hint, keyboard, caps = 'none', secure, maxLength, date }) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={[styles.input, !!error && styles.inputErr]}
      value={value}
      onChangeText={(t) => onChange(date ? maskDate(t) : t)}
      placeholder={date ? 'DD/MM/YYYY' : placeholder}
      placeholderTextColor="#98A2B3"
      keyboardType={date ? 'number-pad' : keyboard ?? 'default'}
      autoCapitalize={caps}
      autoCorrect={false}
      secureTextEntry={secure}
      maxLength={date ? 10 : maxLength}
    />
    {error ? <Text style={styles.err}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>
);

/**
 * Rider/partner onboarding wizard (Indian rules): vehicle type, registration + RC + insurance validity,
 * driving licence (format + expiry), age by vehicle, emergency contact. Accounts stay "pending" until Jinni
 * verifies the original documents in person and approves them in the admin console.
 */
export const PartnerSignupScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { completeProfile, error, clearError, isLoading, accessToken } = useAuthStore();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof PartnerForm) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const next = () => {
    const e = validateStep(step, form);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  };

  const submit = async () => {
    clearError();
    if (!accessToken) {
      Alert.alert('Session expired', 'Please verify your phone number again.', [{ text: 'OK', onPress: () => navigation.navigate('PhoneEntry') }]);
      return;
    }
    // Re-validate every step so nothing slips through if someone navigated oddly.
    for (let s = 0; s <= 3; s++) {
      const e = validateStep(s, form);
      if (Object.keys(e).length) { setErrors(e); setStep(s); return; }
    }
    await completeProfile('delivery', toPayload(form));
  };

  const vehicle = VEHICLES.find((v) => v.key === form.vehicle_class);

  return (
    <View style={{ flex: 1, backgroundColor: '#FBF9FF' }}>
      <LinearGradient colors={[P[900], P[600]]} style={styles.hero}>
        <SafeAreaView edges={['top']}>
          <View style={styles.heroTop}>
            <TouchableOpacity onPress={() => (step === 0 ? navigation.goBack() : setStep(step - 1))} style={styles.back}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>Become a Jinni partner</Text>
            <View style={{ width: 36 }} />
          </View>
          <Text style={styles.stepTxt}>Step {step + 1} of {STEPS.length} · {STEPS[step]}</Text>
          <View style={styles.bar}>{STEPS.map((_, i) => <View key={i} style={[styles.seg, i <= step && { backgroundColor: G[400] }]} />)}</View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!!error && <View style={styles.errorBanner}><Text style={styles.errorBannerTxt}>{error}</Text></View>}

          {step === 0 && (
            <>
              <Text style={styles.h}>What will you drive?</Text>
              <Text style={styles.p}>This decides which jobs you get. You can’t mix — pick the vehicle you’ll actually use.</Text>
              {VEHICLES.map((v) => {
                const on = form.vehicle_class === v.key;
                return (
                  <TouchableOpacity key={v.key} style={[styles.vCard, on && styles.vCardOn]} onPress={() => { set('vehicle_class')(v.key); }} activeOpacity={0.85}>
                    <Text style={styles.vEmoji}>{v.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.vTitle, on && { color: P[700] }]}>{v.title}</Text>
                      <Text style={styles.vBlurb}>{v.blurb}</Text>
                      <Text style={styles.vAge}>Minimum age {v.minAge}</Text>
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? P[500] : '#D0D5DD'} />
                  </TouchableOpacity>
                );
              })}
              {!!errors.vehicle_class && <Text style={styles.err}>{errors.vehicle_class}</Text>}
              <View style={styles.note}><Ionicons name="document-text-outline" size={18} color={P[500]} /><Text style={styles.noteTxt}>Keep your <Text style={styles.b}>driving licence, RC (registration certificate) and insurance</Text> handy — we’ll ask for their numbers and expiry dates.</Text></View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.h}>{vehicle?.emoji} Your {vehicle?.title.toLowerCase()}</Text>
              <Field label="Registration number" value={form.vehicle_number} onChange={set('vehicle_number')} error={errors.vehicle_number} caps="characters" placeholder="RJ14 AB 1234" maxLength={14} hint="As printed on the number plate / RC" />
              <Field label="Make & model" value={form.vehicle_make_model} onChange={set('vehicle_make_model')} error={errors.vehicle_make_model} caps="words" placeholder={form.vehicle_class === 'cab' ? 'Maruti Dzire' : form.vehicle_class === 'auto' ? 'Bajaj RE Compact' : 'Honda Activa'} />
              <Field label="Colour (optional)" value={form.vehicle_color} onChange={set('vehicle_color')} caps="words" placeholder="Black" />
              <Field label="Registration (RC) valid till" value={form.rc_expiry} onChange={set('rc_expiry')} error={errors.rc_expiry} date />
              <Field label="Insurance valid till" value={form.insurance_expiry} onChange={set('insurance_expiry')} error={errors.insurance_expiry} date />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.h}>About you</Text>
              <Field label="Full name (as on licence)" value={form.name} onChange={set('name')} error={errors.name} caps="words" />
              <Field label="Date of birth" value={form.dob} onChange={set('dob')} error={errors.dob} date />
              <Field label="Driving licence number" value={form.license_no} onChange={set('license_no')} error={errors.license_no} caps="characters" placeholder="RJ14 2019 0012345" maxLength={20} hint="State code · RTO · year · 7 digits" />
              <Field label="Licence valid till" value={form.dl_expiry} onChange={set('dl_expiry')} error={errors.dl_expiry} date />
              <Field label="Aadhaar — last 4 digits (optional)" value={form.aadhaar_last4} onChange={(t) => set('aadhaar_last4')(t.replace(/\D/g, '').slice(0, 4))} error={errors.aadhaar_last4} keyboard="numeric" maxLength={4} hint="We never store your full Aadhaar number" />
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.h}>Safety & payments</Text>
              <Field label="Emergency contact name" value={form.emergency_name} onChange={set('emergency_name')} error={errors.emergency_name} caps="words" placeholder="Parent / spouse" />
              <Field label="Emergency contact mobile" value={form.emergency_phone} onChange={set('emergency_phone')} error={errors.emergency_phone} keyboard="phone-pad" maxLength={13} />
              <Field label="UPI id (optional)" value={form.upi_id} onChange={set('upi_id')} error={errors.upi_id} placeholder="name@okaxis" hint="Customers who pay by UPI send it here" />
              <Field label="Create password" value={form.password} onChange={set('password')} error={errors.password} secure />
              <Field label="Confirm password" value={form.confirm_password} onChange={set('confirm_password')} error={errors.confirm_password} secure />
              <View style={styles.summary}>
                <Text style={styles.sumTitle}>Review</Text>
                <Text style={styles.sumLine}>{vehicle?.emoji} {vehicle?.title} · {form.vehicle_number.toUpperCase()}</Text>
                <Text style={styles.sumLine}>{form.vehicle_make_model}{form.vehicle_color ? ` · ${form.vehicle_color}` : ''}</Text>
                <Text style={styles.sumLine}>Licence {form.license_no.toUpperCase()} · valid till {form.dl_expiry}</Text>
              </View>
              <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={18} color={P[500]} /><Text style={styles.noteTxt}>After you submit, <Text style={styles.b}>visit the Jinni office with your original licence, RC and insurance</Text>. Your account goes live once we verify them and approve you.</Text></View>
            </>
          )}
        </ScrollView>

        <SafeAreaView edges={['bottom']} style={styles.footer}>
          {step < 3 ? (
            <TouchableOpacity onPress={next} activeOpacity={0.9}>
              <LinearGradient colors={[G[400], G[500]]} style={styles.cta}><Text style={styles.ctaTxt}>Continue</Text></LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={submit} disabled={isLoading} activeOpacity={0.9} style={{ opacity: isLoading ? 0.6 : 1 }}>
              <LinearGradient colors={[G[400], G[500]]} style={styles.cta}><Text style={styles.ctaTxt}>{isLoading ? 'Submitting…' : 'Submit for approval'}</Text></LinearGradient>
            </TouchableOpacity>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: { paddingBottom: 16, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 17 },
  stepTxt: { color: P[100], fontFamily: fontFamily.medium, fontSize: 12, textAlign: 'center', marginTop: 8 },
  bar: { flexDirection: 'row', gap: 6, marginHorizontal: 24, marginTop: 10 },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  body: { padding: 20, paddingBottom: 30 },
  h: { fontFamily: fontFamily.bold, fontSize: 22, color: P[900], marginBottom: 6 },
  p: { fontFamily: fontFamily.regular, fontSize: 13, color: '#667085', marginBottom: 16 },
  vCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EAECF0', marginBottom: 12 },
  vCardOn: { borderColor: P[400], backgroundColor: P[50] },
  vEmoji: { fontSize: 38 },
  vTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: '#101828' },
  vBlurb: { fontFamily: fontFamily.regular, fontSize: 12, color: '#475467', marginTop: 2 },
  vAge: { fontFamily: fontFamily.medium, fontSize: 11, color: P[500], marginTop: 4 },
  fieldWrap: { marginBottom: 14 },
  label: { fontFamily: fontFamily.semiBold, fontSize: 13, color: '#344054', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EAECF0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fontFamily.medium, fontSize: 15, color: '#101828' },
  inputErr: { borderColor: '#F04438' },
  err: { color: '#D92D20', fontFamily: fontFamily.medium, fontSize: 12, marginTop: 4 },
  hint: { color: '#98A2B3', fontFamily: fontFamily.regular, fontSize: 11, marginTop: 4 },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: P[50], marginTop: 10 },
  noteTxt: { flex: 1, fontFamily: fontFamily.regular, fontSize: 12, color: '#475467', lineHeight: 18 },
  b: { fontFamily: fontFamily.bold, color: P[800] },
  summary: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginTop: 6 },
  sumTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: P[600], marginBottom: 6, letterSpacing: 1 },
  sumLine: { fontFamily: fontFamily.medium, fontSize: 13, color: '#344054', marginBottom: 3 },
  errorBanner: { backgroundColor: '#FEF3F2', padding: 12, borderRadius: 12, marginBottom: 14 },
  errorBannerTxt: { color: '#B42318', fontFamily: fontFamily.medium, fontSize: 13 },
  footer: { paddingHorizontal: 20, paddingTop: 10, backgroundColor: 'rgba(251,249,255,0.96)' },
  cta: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { color: P[900], fontFamily: fontFamily.bold, fontSize: 16 },
});

export default PartnerSignupScreen;
