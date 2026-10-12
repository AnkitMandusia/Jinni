import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { JinniLogo } from '@modules/jinni/components/JinniLogo';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAuthStore } from '@auth/store/authStore';
import { setApiToken } from '@services/api';
import { jinniColors } from '@theme/jinni';

/** Returns true only if value looks like a 3-segment JWT (eyJ...) */
const isValidJWT = (token: string | null): boolean => {
  if (!token) return false;
  const parts = token.split('.');
  return parts.length === 3 && token.startsWith('eyJ');
};

/**
 * Jinni splash (spec section 4.1): brand moment only — champagne-gold
 * wordmark on cream, a single subtle one-shot lamp glow (NOT a full
 * genie-emerge animation on every app open), fast and lightweight,
 * under ~1.5s felt time. No Chirag character here — splash isn't a
 * Jinni session.
 */
const AppSplashScreen: React.FC = () => {
  const navigation = useNavigation();
  const glow = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);

  useEffect(() => {
    glow.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
    wordmarkOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [glow, wordmarkOpacity]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const state = useAuthStore.getState();
      const { accessToken, isAuthenticated, user } = state;

      // ── Token validation ────────────────────────────────────────────────────
      // If the stored token is not a real JWT (e.g. "mock-token" from dev),
      // clear ALL auth state and force a fresh login + OTP flow.
      if (isAuthenticated && !isValidJWT(accessToken)) {
        await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'auth-store']);
        setApiToken(null);
        useAuthStore.setState({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isNewUser: false,
          isLoading: false,
          error: null,
        });
        navigation.navigate('Login' as never);
        return;
      }

      // ── Not authenticated → Login ───────────────────────────────────────────
      if (!isAuthenticated || !user) {
        navigation.navigate('Login' as never);
        return;
      }

      // ── Authenticated + valid JWT ──────────────────────────────────────────
      // Warm the api token cache (needed after cold-start before any API call)
      if (accessToken) setApiToken(accessToken);

      // If profile is incomplete, the user must redo the OTP flow.
      // We cannot trust the stored phone without fresh OTP verification.
      if (!user.profile_complete || !user.role) {
        navigation.navigate('PhoneEntry' as never);
        return;
      }

      // Fully authenticated users: RootNavigator already shows the correct screen.
    }, 1300);

    return () => clearTimeout(timer);
  }, [navigation]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.8,
    transform: [{ scale: 0.7 + glow.value * 0.5 }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: (1 - wordmarkOpacity.value) * 8 }],
  }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.logoBlock, wordmarkStyle]}>
          <Animated.View style={[styles.glow, glowStyle]} />
          <JinniLogo variant="splash" showTagline tagline="Tap the lamp. Make a wish." useImageLamp />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: jinniColors.cream,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lampWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  glow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: jinniColors.gold[200],
  },
  lampCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: jinniColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: jinniColors.gold[300],
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: jinniColors.gold[600],
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 13,
    color: jinniColors.purple[400],
    marginTop: 6,
  },
});

export { AppSplashScreen as SplashScreen };
export default AppSplashScreen;
