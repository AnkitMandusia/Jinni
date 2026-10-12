/**
 * Firebase Phone Auth helpers.
 *
 * Flow:
 *   1. PhoneEntryScreen renders <FirebaseRecaptchaVerifierModal ref={recaptchaRef} />
 *   2. User taps "Send OTP" → sendFirebaseOTP(phone, recaptchaRef.current)
 *   3. Firebase sends SMS → confirmation stored in module variable
 *   4. OTPVerifyScreen calls confirmFirebaseOTP(otp) → gets Firebase ID token
 *   5. App calls POST /auth/firebase-login with ID token → receives our JWT
 */
import { getAuth, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { firebaseApp } from './firebase.config';

export const firebaseAuth = getAuth(firebaseApp);

let _confirmationResult: ConfirmationResult | null = null;

/** Send OTP via Firebase Phone Auth. Stores confirmation result internally. */
export async function sendFirebaseOTP(
  phone: string,
  recaptchaVerifier: any,
): Promise<void> {
  const fullPhone = phone.startsWith('+') ? phone : `+91${phone}`;
  _confirmationResult = await signInWithPhoneNumber(firebaseAuth, fullPhone, recaptchaVerifier);
}

/** Confirm OTP entered by user. Returns Firebase ID token on success. */
export async function confirmFirebaseOTP(otp: string): Promise<string> {
  if (!_confirmationResult) {
    throw new Error('No active OTP session. Please request a new code.');
  }
  const credential = await _confirmationResult.confirm(otp);
  const idToken = await credential.user.getIdToken();
  return idToken;
}

/** Reset stored confirmation result (e.g. on logout or screen unmount). */
export function clearFirebaseOTPSession(): void {
  _confirmationResult = null;
}
