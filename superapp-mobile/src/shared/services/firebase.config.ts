/**
 * Firebase configuration for the SuperApp mobile client.
 *
 * Project: super-1d63d
 *
 * To get messagingSenderId and appId:
 *   Firebase Console → Project Settings → General → Your apps
 *   → Add an Android/iOS app (or use the existing web app)
 */
import { initializeApp, getApps, getApp } from 'firebase/app';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCVBmkDRDbFOX0q2U_MDx2APGoZEBxq6QI",  // Android API key from google-services.json
  authDomain: "super-1d63d.firebaseapp.com",
  projectId: "super-1d63d",
  storageBucket: "super-1d63d.firebasestorage.app",
  messagingSenderId: "680350203236",
  appId: "1:680350203236:android:9346659d2b55f4d97e0e71"  // Android mobilesdk_app_id from google-services.json
};

export const firebaseApp = getApps().length === 0
  ? initializeApp(FIREBASE_CONFIG)
  : getApp();
