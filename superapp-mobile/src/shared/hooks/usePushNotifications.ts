/**
 * usePushNotifications
 *
 * Registers for push notification permissions, obtains the device-level FCM
 * (Android) / APNs (iOS) token via expo-notifications, and saves it to the
 * backend so the server can push order alerts even when the app is closed.
 *
 * Call this hook once from App.tsx after the user is authenticated.
 *
 * Requirements:
 *   npx expo install expo-notifications
 *   Add "expo-notifications" plugin to app.json (see below).
 *
 * app.json plugin entry:
 *   ["expo-notifications", {
 *     "icon": "./assets/notification_icon.png",   // optional
 *     "color": "#6366F1",
 *     "androidMode": "default"
 *   }]
 *
 * For production Android builds you also need google-services.json at the
 * project root (download from Firebase Console → Project settings → Android app).
 */

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from '@services/api';
import { useAuthStore } from '@auth/store/authStore';

// ── Foreground behaviour: suppress system alert (our polling modal handles it)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

// ── Channel for Android (high-priority so order alerts wake the screen)
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'Order Alerts',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#6366F1',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// ── Token registration
async function registerToken(): Promise<void> {
  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  try {
    // getDevicePushTokenAsync returns the raw FCM token (Android) or
    // APNs token (iOS) — this is what Firebase Admin SDK expects.
    const tokenData = await Notifications.getDevicePushTokenAsync();
    await api.patch('/auth/fcm-token', { fcm_token: tokenData.data });
  } catch {
    // Silently ignore: token save failure should not crash the app.
    // Common in Expo Go (no google-services.json) — will work in prod build.
  }
}

// ── Hook
export function usePushNotifications(
  onNotificationTap?: (data: Record<string, string>) => void
): void {
  const { isAuthenticated } = useAuthStore();
  const tapListenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerToken();

    // Fires when user taps a notification while app is in background or killed.
    tapListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = (response.notification.request.content.data ?? {}) as Record<
          string,
          string
        >;
        onNotificationTap?.(data);
      }
    );

    return () => {
      tapListenerRef.current?.remove();
    };
  }, [isAuthenticated]);
}
