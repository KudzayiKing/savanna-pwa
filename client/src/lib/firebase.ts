import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

/**
 * Firebase bootstrap for the browser.
 *
 * Deliberately does NOT call `getAnalytics()`. It adds to the bundle, needs a
 * network round trip on every load, and throws in non-browser contexts (unit
 * tests, SSR), which would take the whole app down for a feature nobody on the
 * MVP path asked for. Re-add it later, lazily, if you actually want it.
 *
 * Everything initialised here is lazy: importing this module has no side
 * effects and cannot throw. That matters because a missing env var should
 * surface as a readable error where it is *used* (or as a graceful
 * "not configured" state in the UI), not as a blank page at import time.
 */

function readConfig(): FirebaseOptions {
  const env = import.meta.env;

  const config: FirebaseOptions = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Firebase is not configured. Missing ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill in the VITE_FIREBASE_* values, then restart the dev server.`
    );
  }

  return config;
}

/**
 * True when the web config is present. Lets the UI render a helpful message
 * instead of crashing when someone runs the app without a .env.
 */
export function isFirebaseConfigured(): boolean {
  try {
    readConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * App Check is what makes a direct-to-Firestore architecture safe.
 *
 * The web config above is public — it ships in the bundle — so without App
 * Check anyone can lift it from the browser and drive your Firestore on your
 * bill. Security rules still authorise *who* may read a document; App Check
 * answers the prior question of whether the caller is your app at all.
 */
function setupAppCheck(app: FirebaseApp): void {
  const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;

  if (!siteKey) {
    if (import.meta.env.PROD) {
      console.warn(
        "[Firebase] App Check is DISABLED (VITE_FIREBASE_APP_CHECK_SITE_KEY is unset). " +
          "Your Firebase config is public, so anyone can query this backend. " +
          "Create a reCAPTCHA v3 key and set the variable before going live."
      );
    }
    return;
  }

  if (import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "1") {
    // Must be set BEFORE initializeAppCheck, otherwise the SDK never prints
    // the token you need to register in the console.
    (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    console.warn(
      "[Firebase] App Check debug token ENABLED. Local development only — " +
        "a debug token lets any machine impersonate your app."
    );
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

let cachedApp: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  cachedApp = initializeApp(readConfig());
  setupAppCheck(cachedApp);
  return cachedApp;
}

let cachedAuth: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(getFirebaseApp());
  return cachedAuth;
}

let cachedDb: Firestore | null = null;

export function getFirestoreDb(): Firestore {
  if (!cachedDb) cachedDb = getFirestore(getFirebaseApp());
  return cachedDb;
}

let cachedStorage: FirebaseStorage | null = null;

export function getFirebaseStorage(): FirebaseStorage {
  if (!cachedStorage) cachedStorage = getStorage(getFirebaseApp());
  return cachedStorage;
}
