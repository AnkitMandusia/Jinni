import { Alert, Linking, Platform } from 'react-native';

/**
 * Hands navigation to Google Maps (no Maps SDK, no API key, no cost). On Android the
 * `google.navigation:` intent starts turn-by-turn directly; otherwise (or if Google Maps
 * isn't installed) the https directions link opens in the maps app / browser.
 */
export async function openInGoogleMaps(lat: number, lng: number, httpsUrl?: string) {
  const web = httpsUrl || `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  try {
    if (Platform.OS === 'android') {
      try {
        await Linking.openURL(`google.navigation:q=${lat},${lng}&mode=d`);
        return;
      } catch {
        /* fall through to the https link */
      }
    }
    await Linking.openURL(web);
  } catch {
    Alert.alert('Could not open Maps', 'Install Google Maps or open this location manually.');
  }
}

export function callPhone(phone?: string | null) {
  if (!phone) return;
  void Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Could not start the call'));
}
