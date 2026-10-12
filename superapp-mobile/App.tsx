import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from 'styled-components/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, ActivityIndicator, Text, TextInput } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { RootNavigator } from '@navigation/RootNavigator';
import { theme } from '@theme/index';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { usePushNotifications } from './src/shared/hooks/usePushNotifications';
import { jinniColors } from '@theme/jinni';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Safety net: any <Text>/<TextInput> anywhere in the app (customer, store,
// restaurant, rider, superadmin screens) that forgets to set fontFamily
// explicitly was silently falling back to the phone's default system font
// (e.g. pills/badges/labels in Food, Grocery, checkout and delivery
// screens). Setting a base defaultProps.style here guarantees Inter is
// always applied first; any screen-level style with its own fontFamily
// still wins because it's merged after this default.
const applyDefaultFont = () => {
  // @ts-expect-error - defaultProps is deprecated upstream but still the
  // only global hook RN exposes for this; narrowly scoped to font only.
  Text.defaultProps = Text.defaultProps || {};
  // @ts-expect-error see above
  Text.defaultProps.style = [{ fontFamily: 'Inter-Regular' }, Text.defaultProps.style];

  // @ts-expect-error see above
  TextInput.defaultProps = TextInput.defaultProps || {};
  // @ts-expect-error see above
  TextInput.defaultProps.style = [{ fontFamily: 'Inter-Regular' }, TextInput.defaultProps.style];
};
applyDefaultFont();

function AppInner() {
  usePushNotifications();
  return (
    <>
      <StatusBar style="dark" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={jinniColors.gold[500]} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider theme={theme}>
          <ErrorBoundary>
            <AppInner />
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: jinniColors.cream,
  },
});
