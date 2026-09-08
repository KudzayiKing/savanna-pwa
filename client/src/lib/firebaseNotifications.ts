import type { AppUser } from "@/lib/userProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, type DocumentData } from "firebase/firestore";
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFirebaseApp, getFirestoreDb } from "./firebase";

export type SavannaNotificationCategory =
  | "directMessages"
  | "groupMessages"
  | "communityMessages"
  | "communityPosts"
  | "storyReplies";

export type SavannaNotificationSettings = Record<SavannaNotificationCategory | "enabled", boolean>;

export type SavannaNotificationEvent =
  | {
      eventType: "conversation.message";
      conversationId: string;
      messageId: string;
    }
  | {
      eventType: "community.message";
      communityId: string;
      communityMessageId: string;
    }
  | {
      eventType: "community.post";
      communityId: string;
      communityPostId: string;
    };

export type SavannaNotificationDevice = {
  id: string;
  enabled: boolean;
  permission: NotificationPermission | "unsupported";
  platform: string;
  token: string | null;
  updatedAt: Date | string | null;
};

export const SAVANNA_NOTIFICATION_DEFAULTS: SavannaNotificationSettings = {
  enabled: true,
  directMessages: true,
  groupMessages: true,
  communityMessages: true,
  communityPosts: true,
  storyReplies: true,
};

export const SAVANNA_NOTIFICATION_LABELS: Array<{
  key: SavannaNotificationCategory;
  label: string;
  description: string;
}> = [
  {
    key: "directMessages",
    label: "Direct messages",
    description: "Private chats and merchant support replies.",
  },
  {
    key: "groupMessages",
    label: "Group messages",
    description: "Messages from group conversations you belong to.",
  },
  {
    key: "communityMessages",
    label: "Community chat",
    description: "Live chat activity in your communities.",
  },
  {
    key: "communityPosts",
    label: "Community posts",
    description: "New posts, listings, questions, and announcements.",
  },
  {
    key: "storyReplies",
    label: "Story replies",
    description: "Replies that become private conversations.",
  },
];

const DEVICE_ID_KEY = "savanna.notification.deviceId";
const WORKER_URL = "/service-worker.js?v=38";

const notificationKeys = {
  settings: (uid?: string | null) => ["firebase", "notification-settings", uid ?? "guest"] as const,
  device: (uid?: string | null) => ["firebase", "notification-device", uid ?? "guest"] as const,
};

function notificationSupportedByBrowser() {
  return (
    typeof window !== "undefined"
    && "Notification" in window
    && "serviceWorker" in navigator
    && "PushManager" in window
    && (window.isSecureContext || window.location.hostname === "localhost")
  );
}

async function messagingSupported() {
  if (!notificationSupportedByBrowser()) return false;
  return isSupported().catch(() => false);
}

function deviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return `ephemeral-${crypto.randomUUID()}`;
  }
}

function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS PWA";
  if (/android/i.test(ua)) return "Android PWA";
  if (/macintosh|mac os x/i.test(ua)) return "Mac browser";
  if (/windows/i.test(ua)) return "Windows browser";
  return "This browser";
}

function settingsFromDoc(data?: DocumentData): SavannaNotificationSettings {
  return {
    enabled: data?.enabled !== false,
    directMessages: data?.directMessages !== false,
    groupMessages: data?.groupMessages !== false,
    communityMessages: data?.communityMessages !== false,
    communityPosts: data?.communityPosts !== false,
    storyReplies: data?.storyReplies !== false,
  };
}

function mapDevice(id: string, data?: DocumentData): SavannaNotificationDevice {
  return {
    id,
    enabled: data?.enabled === true,
    permission: (data?.permission as NotificationPermission | undefined) ?? Notification.permission ?? "default",
    platform: typeof data?.platform === "string" ? data.platform : deviceLabel(),
    token: typeof data?.token === "string" ? data.token : null,
    updatedAt: data?.updatedAt ?? null,
  };
}

function settingsRef(uid: string) {
  return doc(getFirestoreDb(), "users", uid, "notificationSettings", "preferences");
}

function deviceRef(uid: string, id = deviceId()) {
  return doc(getFirestoreDb(), "users", uid, "notificationDevices", id);
}

export async function getSavannaNotificationSettings(user?: AppUser | null) {
  if (!user) return SAVANNA_NOTIFICATION_DEFAULTS;
  const snapshot = await getDoc(settingsRef(user.id));
  return settingsFromDoc(snapshot.data());
}

export async function getSavannaNotificationDevice(user?: AppUser | null) {
  if (!user || !notificationSupportedByBrowser()) {
    return {
      id: "unsupported",
      enabled: false,
      permission: "unsupported",
      platform: "Unsupported browser",
      token: null,
      updatedAt: null,
    } satisfies SavannaNotificationDevice;
  }
  const id = deviceId();
  const snapshot = await getDoc(deviceRef(user.id, id));
  return mapDevice(id, snapshot.data());
}

export async function saveSavannaNotificationSettings(user: AppUser, settings: SavannaNotificationSettings) {
  await setDoc(settingsRef(user.id), {
    ...settings,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function ensureNotificationWorker() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register(WORKER_URL);
}

/**
 * Every early `return`/`throw` in the enable flow used to leave Firestore
 * completely untouched, so "the user says they enabled push but
 * `notificationDevices` is empty" was undiagnosable — no document means no
 * signal at all. Write the failure down instead; it is the only record we get.
 * Never allowed to throw, or it would mask the real error.
 */
async function recordDeviceFailure(user: AppUser, reason: string, detail?: unknown) {
  const suffix = detail instanceof Error
    ? `: ${detail.message}`
    : typeof detail === "string" && detail
      ? `: ${detail}`
      : "";
  try {
    await setDoc(deviceRef(user.id), {
      enabled: false,
      permission: notificationSupportedByBrowser() ? Notification.permission : "unsupported",
      platform: deviceLabel(),
      userAgent: navigator.userAgent.slice(0, 500),
      disabledReason: `${reason}${suffix}`.slice(0, 300),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true });
  } catch {
    /* diagnostics must never block or mask the real error */
  }
}

export async function enableSavannaNotifications(user: AppUser) {
  if (!await messagingSupported()) {
    await recordDeviceFailure(user, "unsupported_browser");
    throw new Error("This browser does not support Savanna notifications yet.");
  }
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    await recordDeviceFailure(user, "missing_vapid_key");
    throw new Error("Web Push is missing VITE_FIREBASE_VAPID_KEY.");
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    await setDoc(deviceRef(user.id), {
      enabled: false,
      permission,
      platform: deviceLabel(),
      disabledReason: `permission_${permission}`,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    throw new Error("Notifications are not allowed for this browser.");
  }

  let token: string;
  try {
    const registration = await ensureNotificationWorker();
    const messaging = getMessaging(getFirebaseApp());
    token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (error) {
    await recordDeviceFailure(user, "token_error", error);
    throw new Error("Savanna could not create a notification token on this device.");
  }
  if (!token) {
    await recordDeviceFailure(user, "empty_token");
    throw new Error("Savanna could not create a notification token.");
  }

  const id = deviceId();
  await Promise.all([
    setDoc(settingsRef(user.id), {
      ...SAVANNA_NOTIFICATION_DEFAULTS,
      updatedAt: serverTimestamp(),
    }, { merge: true }),
    setDoc(deviceRef(user.id, id), {
      token,
      enabled: true,
      permission,
      platform: deviceLabel(),
      userAgent: navigator.userAgent.slice(0, 500),
      appVersion: import.meta.env.VITE_APP_VERSION ?? null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    }, { merge: true }),
  ]);

  return getSavannaNotificationDevice(user);
}

export async function disableSavannaNotifications(user: AppUser) {
  const id = deviceId();
  await setDoc(deviceRef(user.id, id), {
    enabled: false,
    permission: notificationSupportedByBrowser() ? Notification.permission : "unsupported",
    updatedAt: serverTimestamp(),
  }, { merge: true });

  if (await messagingSupported()) {
    await deleteToken(getMessaging(getFirebaseApp())).catch(() => false);
  }
}

export async function recordSavannaNotificationIntent(senderUserId: string, event: SavannaNotificationEvent) {
  await addDoc(collection(getFirestoreDb(), "notificationIntents"), {
    ...event,
    senderUserId,
    status: "queued",
    createdAt: serverTimestamp(),
  });
}

/**
 * Writing the intent document is the whole client-side job.
 *
 * It used to also POST to `/api/notifications/dispatch`, but Firebase Hosting
 * is static-only: `firebase.json` rewrites `** -> /index.html`, so that POST
 * came back as 29 KB of HTML and threw on `.json()`. Notifications are now
 * dispatched by the `dispatchNotificationIntent` Cloud Function in
 * `functions/index.js`, which fires on this very write. Nothing else to call.
 */
export function notifySavannaEvent(senderUserId: string | null | undefined, event: SavannaNotificationEvent) {
  if (!senderUserId) return;
  void recordSavannaNotificationIntent(senderUserId, event).catch(error => {
    console.warn("[Notifications] Could not record intent", error);
  });
}

export function useSavannaNotificationSettings(user?: AppUser | null) {
  return useQuery({
    queryKey: notificationKeys.settings(user?.id),
    queryFn: () => getSavannaNotificationSettings(user),
    enabled: Boolean(user),
  });
}

export function useSavannaNotificationDevice(user?: AppUser | null) {
  return useQuery({
    queryKey: notificationKeys.device(user?.id),
    queryFn: () => getSavannaNotificationDevice(user),
    enabled: Boolean(user),
  });
}

export function useSavannaNotificationActions(user?: AppUser | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.settings(user?.id) });
    queryClient.invalidateQueries({ queryKey: notificationKeys.device(user?.id) });
  };

  return {
    enable: useMutation({
      mutationFn: async () => {
        if (!user) throw new Error("Sign in to manage notifications");
        return enableSavannaNotifications(user);
      },
      onSuccess: invalidate,
    }),
    disable: useMutation({
      mutationFn: async () => {
        if (!user) throw new Error("Sign in to manage notifications");
        await disableSavannaNotifications(user);
      },
      onSuccess: invalidate,
    }),
    saveSettings: useMutation({
      mutationFn: async (settings: SavannaNotificationSettings) => {
        if (!user) throw new Error("Sign in to manage notifications");
        await saveSavannaNotificationSettings(user, settings);
      },
      onSuccess: invalidate,
    }),
  };
}
