import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { ENV } from "./env";

let cachedAdminApp: App | null | undefined;

type FirebaseServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

export function normalizeFirebasePrivateKey(value: string) {
  let key = value.trim();
  if (!key) return "";

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    try {
      key = JSON.parse(key);
    } catch {
      key = key.slice(1, -1);
    }
  }

  key = key
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();

  const endMarker = "-----END PRIVATE KEY-----";
  const endIndex = key.indexOf(endMarker);
  if (endIndex >= 0) {
    key = key.slice(0, endIndex + endMarker.length);
  }

  return `${key}\n`;
}

function adminPrivateKey() {
  return ENV.firebasePrivateKey ? normalizeFirebasePrivateKey(ENV.firebasePrivateKey) : "";
}

function serviceAccountFromJson(value: string): FirebaseServiceAccount | null {
  if (!value.trim()) return null;

  const parsed = JSON.parse(value) as {
    projectId?: string;
    project_id?: string;
    clientEmail?: string;
    client_email?: string;
    privateKey?: string;
    private_key?: string;
  };

  const projectId = parsed.projectId ?? parsed.project_id ?? ENV.firebaseProjectId;
  const clientEmail = parsed.clientEmail ?? parsed.client_email;
  const privateKey = parsed.privateKey ?? parsed.private_key;

  if (!projectId || !clientEmail || !privateKey) return null;

  return {
    projectId,
    clientEmail,
    privateKey: normalizeFirebasePrivateKey(privateKey),
  };
}

function adminServiceAccount(): FirebaseServiceAccount | null {
  try {
    if (ENV.firebaseServiceAccountBase64) {
      return serviceAccountFromJson(
        Buffer.from(ENV.firebaseServiceAccountBase64, "base64").toString("utf8"),
      );
    }

    if (ENV.firebaseServiceAccountJson) {
      return serviceAccountFromJson(ENV.firebaseServiceAccountJson);
    }
  } catch (error) {
    console.warn("[Firebase Admin] Could not parse service account env", error);
  }

  const privateKey = adminPrivateKey();
  if (!ENV.firebaseClientEmail || !privateKey) return null;

  return {
    projectId: ENV.firebaseProjectId,
    clientEmail: ENV.firebaseClientEmail,
    privateKey,
  };
}

export function getFirebaseAdminApp(): App | null {
  if (cachedAdminApp !== undefined) return cachedAdminApp;

  const existing = getApps()[0];
  if (existing) {
    cachedAdminApp = existing;
    return cachedAdminApp;
  }

  if (!ENV.firebaseProjectId) {
    cachedAdminApp = null;
    return cachedAdminApp;
  }

  try {
    const serviceAccount = adminServiceAccount();

    if (serviceAccount) {
      cachedAdminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });
    } else {
      cachedAdminApp = initializeApp({
        credential: applicationDefault(),
        projectId: ENV.firebaseProjectId,
      });
    }
    return cachedAdminApp;
  } catch (error) {
    console.warn("[Firebase Admin] Could not initialize notifications", error);
    cachedAdminApp = null;
    return cachedAdminApp;
  }
}

export function getFirebaseAdminAuth() {
  const app = getFirebaseAdminApp();
  return app ? getAuth(app) : null;
}

export function getFirebaseAdminDb() {
  const app = getFirebaseAdminApp();
  return app ? getFirestore(app) : null;
}

export function getFirebaseAdminMessaging() {
  const app = getFirebaseAdminApp();
  return app ? getMessaging(app) : null;
}
