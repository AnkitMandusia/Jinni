import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TextInput, KeyboardAvoidingView, Platform, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { useAuthStore } from '@auth/store/authStore';
import { confirmFirebaseOTP, sendFirebaseOTP } from '@services/firebaseAuth.service';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { FIREBASE_CONFIG } from '@services/firebase.config';
import { AuthStackParamList } from '@navigation/stacks/AuthStack';

type OTPVerifyNavProp = NativeStackNavigationProp<AuthStackParamList, 'OTPVerify'>;

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.white};
`;

const Content = styled.View`
  flex: 1;
  padding: ${spacing.xl}px;
`;

const Header = styled.View`
  margin-bottom: ${spacing.xxxl}px;
  margin-top: ${spacing.xxxl}px;
`;

const Title = styled.Text`
  ${typography.h2}
  color: ${colors.gray[900]};
  margin-bottom: ${spacing.sm}px;
`;

const Subtitle = styled.Text`
  ${typography.body1}
  color: ${colors.gray[500]};
`;

const PhoneText = styled.Text`
  ${typography.body1}
  color: ${colors.primary[500]};
  font-weight: 600;
`;

const OTPContainer = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: ${spacing.xl}px;
  padding-horizontal: ${spacing.lg}px;
`;

const OTPInput = styled.TextInput<{ isFocused: boolean }>`
  width: 56px;
  height: 56px;
  border-width: 2px;
  border-color: ${(props: { isFocused: boolean }) => (props.isFocused ? colors.primary[500] : colors.gray[300])};
  border-radius: 12px;
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  color: ${colors.gray[900]};
  background-color: ${colors.white};
`;

const ErrorText = styled.Text`
  ${typography.body2}
  color: ${colors.error.DEFAULT};
  margin-bottom: ${spacing.md}px;
  text-align: center;
`;

const ResendContainer = styled.View`
  flex-direction: row;
  justify-content: center;
  align-items: center;
  margin-top: ${spacing.lg}px;
`;

const ResendText = styled.Text`
  ${typography.body2}
  color: ${colors.gray[500]};
`;

const ResendButton = styled.TouchableOpacity`
  margin-left: ${spacing.xs}px;
`;

const ResendButtonText = styled.Text`
  ${typography.body2}
  color: ${colors.primary[500]};
  font-weight: 600;
`;

const TimerText = styled.Text`
  ${typography.body2}
  color: ${colors.gray[400]};
  margin-left: ${spacing.xs}px;
`;

export const OTPVerifyScreen: React.FC = () => {
  const navigation = useNavigation<OTPVerifyNavProp>();
  const route = useRoute<RouteProp<AuthStackParamList, 'OTPVerify'>>();
  const { phone } = route.params;
  const { verifyFirebaseToken, error, clearError } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [localError, setLocalError] = useState('');

  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => {
        setTimer(t => t - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCanResend(true);
    }
  }, [timer]);

  const handleOtpChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every(digit => digit) && index === 5) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (otpString: string) => {
    if (otpString.length < 6) return;
    clearError();
    setLocalError('');
    setVerifying(true);
    try {
      const idToken = await confirmFirebaseOTP(otpString);
      const result = await verifyFirebaseToken(idToken);
      if (result.success && result.isNewUser) {
        navigation.navigate('RoleSelect');
      }
      // Existing user with complete profile → RootNavigator switches automatically
    } catch (e: any) {
      setLocalError(e?.message ?? 'Invalid OTP. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setCanResend(false);
    setTimer(30);
    setOtp(['', '', '', '', '', '']);
    setFocusedIndex(0);
    setLocalError('');
    inputRefs.current[0]?.focus();
    try {
      await sendFirebaseOTP(phone, recaptchaRef.current);
    } catch (e: any) {
      setLocalError(e?.message ?? 'Failed to resend OTP.');
    }
  };

  const formatTimer = (seconds: number): string => {
    return `(${seconds}s)`;
  };

  const displayError = error || localError;

  return (
    <Container>
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaRef}
        firebaseConfig={FIREBASE_CONFIG}
        attemptInvisibleVerification={true}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Content>
          <Header>
            <Title>Verify OTP</Title>
            <Subtitle>
              Enter the 6-digit code sent to{' '}
              <PhoneText>+91 {phone}</PhoneText>
            </Subtitle>
          </Header>

          {displayError ? <ErrorText>{displayError}</ErrorText> : null}

          <OTPContainer>
            {otp.map((digit, index) => (
              <OTPInput
                key={index}
                ref={(ref: TextInput | null) => (inputRefs.current[index] = ref)}
                value={digit}
                onChangeText={(text: string) => handleOtpChange(text.replace(/\D/g, ''), index)}
                onKeyPress={(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => handleKeyPress(e, index)}
                onFocus={() => setFocusedIndex(index)}
                isFocused={focusedIndex === index}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            ))}
          </OTPContainer>

          <AppButton
            title="Verify"
            onPress={() => handleVerify(otp.join(''))}
            loading={verifying}
            disabled={verifying || otp.some(d => !d)}
            size="large"
          />

          <ResendContainer>
            <ResendText>Didn't receive code?</ResendText>
            {canResend ? (
              <ResendButton onPress={handleResend}>
                <ResendButtonText>Resend</ResendButtonText>
              </ResendButton>
            ) : (
              <TimerText>{formatTimer(timer)}</TimerText>
            )}
          </ResendContainer>
        </Content>
      </KeyboardAvoidingView>
    </Container>
  );
};

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
});

export default OTPVerifyScreen;
