// Native autolinking exclusions.
//
// expo-firebase-core: abandoned Expo package (pulled in by expo-firebase-recaptcha) whose Android
// code no longer compiles against current expo-modules-core. Phone-auth recaptcha only needs its JS
// side (the app passes firebaseConfig explicitly), so it is excluded from native builds on both
// autolinkers (see also "expo.autolinking.exclude" in package.json).
//
// paytm_allinone_react-native (opt-in, SKIP_PAYTM_NATIVE=1): Paytm's Android SDK is hosted on
// artifactory.paytm.in, which can be unreachable (503). With the flag, the module is left out of
// the Android build; only "Pay online (UPI)" then fails, COD/wallet are unaffected.
// Release builds must NOT set SKIP_PAYTM_NATIVE.
const dependencies = {
  'expo-firebase-core': { platforms: { android: null, ios: null } },
};
if (process.env.SKIP_PAYTM_NATIVE === '1') {
  dependencies['paytm_allinone_react-native'] = { platforms: { android: null } };
}
module.exports = { dependencies };
