import type { AppUser } from "@/lib/userProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getFirebaseApp, getFirebaseAuth, getFirestoreDb } from "./firebase";

/**
 * Per-device sessions.
 *
 * Firebase Auth has no per-session API: it can invalidate every refresh token
 * for a user, but it cannot list sessions or revoke one of them. So sessions
 * are app-maintained in `users/{uid}/sessions/{sessionId}`, where `sessionId`
 * is a stable id this browser generates once and keeps in `localStorage`.
 *
 * Revocation is advisory by design. The Firestore rules let a client write
 * `revokedAt` on its own document only — "sign out my other phone" has to go
 * through the `revokeSession` / `revokeOtherSessions` callables, which use the
 * Admin SDK — and each device then notices the field and signs itself out
 * (`useSessionGuard`). That is weaker than server-side token revocation, but it
 * is the strongest thing available without a session table of our own.
 */

export type FirebaseSession = {
  id: string;
  uid: string;
  label: string;
  platform: string;
  userAgent: string;
  createdAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
};

const SESSION_ID_KEY = "savanna.session.id";
const SESSION_LIMIT = 25;

const sessionKeys = {
  all: (uid?: string | null) => ["firebase", "sessions", uid ?? "guest"] as const,
};

/** Sessions already signed out by this tab, so one revocation fires only once. */
const handledRevocations = new Set<string>();

/**
 * A stable id for this browser.
 *
 * Persisted rather than derived: deriving it from the user agent would merge
 * every Chrome on macOS into a single row, and "revoke" would then sign out
 * both of them.
 */
export function sessionId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(SESSION_ID_KEY, generated);
    return generated;
  } catch {
    // Private browsing and blocked storage both throw here. Losing the stable
    // id costs a duplicate row; it must never break sign-in.
    return "ephemeral";
  }
}

function detectBrowser(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent) || /Opera/.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return "Browser";
}

function detectOs(userAgent: string, platform: string): string {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Windows|Win32|Win64/i.test(userAgent) || /^Win/i.test(platform)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent) || /^Mac/i.test(platform)) return "macOS";
  if (/Linux/i.test(userAgent) || /^Linux/i.test(platform)) return "Linux";
  return platform || "Unknown";
}

function describeDevice(): { label: string; platform: string; userAgent: string } {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent ?? "";
  const rawPlatform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    (typeof navigator === "undefined" ? "" : navigator.platform) ||
    "";
  const platform = detectOs(userAgent, rawPlatform);
  return {
    label: `${detectBrowser(userAgent)} on ${platform}`,
    platform: platform.slice(0, 80),
    userAgent: userAgent.slice(0, 400),
  };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && "toDate" in value && typeof (value as Timestamp).toDate === "function") {
    return (value as Timestamp).toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * "Active now", "12 min ago", "3 days ago".
 *
 * Deliberately not `toLocaleString()`: a device list is read to answer "is this
 * the phone I lost", and a wall-clock timestamp makes every reader do that
 * arithmetic themselves.
 */
export function formatSessionLastSeen(value: Date | null): string {
  if (!value) return "Last active unknown";
  const seconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (seconds < 60) return "Active now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Creates this browser's session document, or touches `lastSeenAt` if it is
 * already there. Call on sign-in and on any app boot that already has a user.
 *
 * Read-then-write on purpose: one blind `setDoc(..., { merge: true })` carrying
 * `revokedAt: null` would let a device that was just revoked resurrect its own
 * session on the next render. Rules require `revokedAt: null` on create, so the
 * create and update payloads cannot be the same object.
 */
export async function registerSession(user: AppUser): Promise<void> {
  const id = sessionId();
  const ref = doc(getFirestoreDb(), "users", user.id, "sessions", id);
  const existing = await getDoc(ref);

  if (existing.exists()) {
    await updateDoc(ref, { lastSeenAt: serverTimestamp() });
    return;
  }

  const device = describeDevice();
  await setDoc(ref, {
    id,
    uid: user.id,
    label: device.label,
    platform: device.platform,
    userAgent: device.userAgent,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    revokedAt: null,
  });
}

async function listSessions(user: AppUser): Promise<FirebaseSession[]> {
  const snapshot = await getDocs(
    query(collection(getFirestoreDb(), "users", user.id, "sessions"), orderBy("lastSeenAt", "desc"), limit(SESSION_LIMIT)),
  );
  return snapshot.docs.map(item => {
    const data = item.data();
    return {
      id: item.id,
      uid: typeof data.uid === "string" ? data.uid : user.id,
      label: typeof data.label === "string" ? data.label : "Unknown device",
      platform: typeof data.platform === "string" ? data.platform : "",
      userAgent: typeof data.userAgent === "string" ? data.userAgent : "",
      createdAt: toDate(data.createdAt),
      lastSeenAt: toDate(data.lastSeenAt),
      revokedAt: toDate(data.revokedAt),
    };
  });
}

export function useFirebaseSessions(user?: AppUser | null) {
  return useQuery({
    queryKey: sessionKeys.all(user?.id),
    queryFn: () => listSessions(user as AppUser),
    enabled: Boolean(user?.id),
  });
}

export type RevokeSessionInput = { user: AppUser; sessionId: string };
export type RevokeOtherSessionsInput = { user: AppUser };

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RevokeSessionInput>({
    mutationFn: async ({ sessionId: target }) => {
      const call = httpsCallable<{ sessionId: string }, { revoked: boolean }>(
        getFunctions(getFirebaseApp()),
        "revokeSession",
      );
      await call({ sessionId: target });
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(variables.user.id) });
    },
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation<{ revokedCount: number }, Error, RevokeOtherSessionsInput>({
    mutationFn: async () => {
      const call = httpsCallable<{ sessionId: string }, { revokedCount: number }>(
        getFunctions(getFirebaseApp()),
        "revokeOtherSessions",
      );
      const result = await call({ sessionId: sessionId() });
      return { revokedCount: result.data?.revokedCount ?? 0 };
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(variables.user.id) });
    },
  });
}

/**
 * Signs this device out when its session is revoked elsewhere.
 *
 * Two documents are watched, because "revoke" arrives two different ways:
 *
 *  - `users/{uid}/sessions/{sessionId}.revokedAt` — a single device was revoked.
 *  - `users/{uid}.sessionsRevokedAt` — "sign out all other devices". Compared
 *    against this session's `createdAt` so that a device signing in *after* the
 *    stamp is not immediately signed out by it.
 *
 * The second one carries `sessionsRevokedBySessionId` so the device that asked
 * for the sign-out is not signed out by its own request.
 *
 * Also registers this session: mounting the guard is the signal that a user is
 * present, and a device that never registers never appears in the list at all.
 */
export function useSessionGuard(user?: AppUser | null) {
  const uid = user?.id;
  // Read once: the user object is recreated on every profile refresh, and
  // re-subscribing on identity alone would tear down both listeners each time.
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    const current = userRef.current;
    if (!uid || !current) return;

    const db = getFirestoreDb();
    const id = sessionId();
    const handledKey = `${uid}:${id}`;
    let createdAtMs = 0;
    let settled = false;

    const signOutLocally = async (message: string) => {
      if (handledRevocations.has(handledKey)) return;
      handledRevocations.add(handledKey);
      try {
        await signOut(getFirebaseAuth());
      } catch {
        // Already signed out, or offline. Either way the local session is
        // gone; the field stays set so a later boot signs out again.
      }
      // Drop the stored id so the next sign-in on this device gets a fresh
      // session instead of reusing the revoked one.
      try {
        window.localStorage.removeItem(SESSION_ID_KEY);
      } catch {
        /* storage unavailable — the id is regenerated on the next boot anyway */
      }
      toast.error(message);
    };

    void registerSession(current).catch(() => undefined);

    const unsubscribeSession = onSnapshot(
      doc(db, "users", uid, "sessions", id),
      snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const createdAt = toDate(data.createdAt);
        if (createdAt) createdAtMs = createdAt.getTime();
        settled = true;
        if (toDate(data.revokedAt)) {
          void signOutLocally("This device was signed out.");
        }
      },
      () => undefined,
    );

    const unsubscribeUser = onSnapshot(
      doc(db, "users", uid),
      snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const revokedAt = toDate(data.sessionsRevokedAt);
        if (!revokedAt) return;
        // A brand-new session doc may not have flushed `createdAt` yet; failing
        // the comparison is the safe direction only if we have seen the doc.
        if (!settled || createdAtMs === 0) return;
        if (revokedAt.getTime() <= createdAtMs) return;
        if (data.sessionsRevokedBySessionId === id) return;
        void signOutLocally("You were signed out on all other devices.");
      },
      () => undefined,
    );

    return () => {
      unsubscribeSession();
      unsubscribeUser();
    };
  }, [uid]);
}
