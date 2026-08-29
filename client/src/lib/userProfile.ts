import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  type FieldValue,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getFirestoreDb } from "./firebase";

/**
 * The application's view of a signed-in user.
 *
 * This shape is a contract: `useAuth` returns it and pages read `user.id`,
 * `user.name` and `user.email` off it. It is deliberately kept identical to the
 * object the old `trpc.auth.me` endpoint returned, so that moving identity from
 * the Express API to Firebase Auth did not require touching every page.
 *
 * Note `name` and `email` are nullable. Phone Auth produces neither — there is
 * no email address and no display name until the user sets one — so anything
 * greeting the user must handle both being absent rather than assuming a name.
 */
export type AppUser = {
  id: string;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  profileVisibility: "public" | "connections" | "private";
  phoneVisibility: "nobody" | "connections";
  handleDiscoverability: "exact_match" | "invite_only";
  storyAudienceDefault: "connections" | "custom" | "private";
  readReceiptsEnabled: boolean;
  lastSeenVisibility: "nobody" | "connections";
  courseProgressOptIn: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

/**
 * Compares a user id from MySQL-era data against a Firebase UID.
 *
 * Identity moved from numeric MySQL ids to string Firebase UIDs, but the
 * surfaces still backed by the Express API (learning, commerce, stories)
 * continue to hand back numeric ids. A UID can never equal one of those, so
 * this always answers `false` for them.
 *
 * That direction is deliberate: every place this is used gates access or
 * decides whether a message is "mine", and failing closed denies rather than
 * grants. These call sites become genuinely correct as each surface migrates to
 * Firestore and starts carrying UIDs.
 */
export function isSameUser(
  candidate: number | string | null | undefined,
  uid: string | null | undefined
): boolean {
  if (candidate == null || uid == null) return false;
  return String(candidate) === uid;
}

/**
 * The numeric MySQL-era id for this user, or null if there isn't one.
 *
 * A handful of tRPC procedures still key on the old numeric `users.id`. A
 * Firebase UID is an opaque string, so it maps to no such row — calling those
 * procedures with a UID would be a guaranteed miss. Callers use this to
 * `skipToken` the query instead, which keeps a known-dead request off the wire
 * rather than firing one that can only fail.
 *
 * Returns null for every real Firebase UID today. That is the point: those
 * surfaces are dormant until they migrate to Firestore.
 */
export function legacyNumericUserId(uid: string | number | null | undefined): number | null {
  if (typeof uid === "number") return Number.isInteger(uid) && uid > 0 ? uid : null;
  if (typeof uid !== "string") return null;
  const parsed = Number(uid);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Fields as stored in Firestore, where timestamps may still be unresolved. */
type UserDoc = {
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  photoURL?: string | null;
  bio?: string | null;
  city?: string | null;
  countryCode?: string | null;
  profileVisibility?: AppUser["profileVisibility"];
  phoneVisibility?: AppUser["phoneVisibility"];
  handleDiscoverability?: AppUser["handleDiscoverability"];
  storyAudienceDefault?: AppUser["storyAudienceDefault"];
  readReceiptsEnabled?: boolean;
  lastSeenVisibility?: AppUser["lastSeenVisibility"];
  courseProgressOptIn?: boolean;
  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function usersCollection(uid: string) {
  return doc(getFirestoreDb(), "users", uid);
}

/**
 * Reads the profile, creating it on first sign-in.
 *
 * The create is deliberately not awaited against a transaction: two concurrent
 * first-sign-ins would race, but both write the same defaults and the last
 * write wins, so the outcome is identical either way. Chasing that race with a
 * transaction would add a round trip to every sign-in for no benefit.
 */
export async function ensureUserProfile(firebaseUser: User): Promise<AppUser> {
  const ref = usersCollection(firebaseUser.uid);
  const snapshot = await getDoc(ref);

  const now = new Date();

  if (!snapshot.exists()) {
    const created: UserDoc = {
      name: firebaseUser.displayName ?? null,
      email: firebaseUser.email ?? null,
      phoneNumber: firebaseUser.phoneNumber ?? null,
      photoURL: firebaseUser.photoURL ?? null,
      bio: null,
      city: null,
      countryCode: null,
      profileVisibility: "connections",
      phoneVisibility: "nobody",
      handleDiscoverability: "exact_match",
      storyAudienceDefault: "connections",
      readReceiptsEnabled: true,
      lastSeenVisibility: "connections",
      courseProgressOptIn: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, created).catch(error => {
      // A permission-denied here means the security rules don't allow the
      // profile create — the single most common first-run misconfiguration.
      // Surface it loudly instead of letting the user fall through as a
      // half-authenticated ghost.
      console.error("[Firestore] Failed to create user profile", error);
      throw error;
    });

    return {
      id: firebaseUser.uid,
      name: created.name ?? null,
      email: created.email ?? null,
      phoneNumber: created.phoneNumber ?? null,
      photoURL: created.photoURL ?? null,
      bio: created.bio ?? null,
      city: created.city ?? null,
      countryCode: created.countryCode ?? null,
      profileVisibility: created.profileVisibility ?? "connections",
      phoneVisibility: created.phoneVisibility ?? "nobody",
      handleDiscoverability: created.handleDiscoverability ?? "exact_match",
      storyAudienceDefault: created.storyAudienceDefault ?? "connections",
      readReceiptsEnabled: created.readReceiptsEnabled ?? true,
      lastSeenVisibility: created.lastSeenVisibility ?? "connections",
      courseProgressOptIn: created.courseProgressOptIn ?? false,
      createdAt: now,
      updatedAt: now,
    };
  }

  const data = snapshot.data() as UserDoc;

  // Fire-and-forget: a stale lastSeenAt must never block or fail a sign-in.
  // The catch matters — an unhandled rejection here would surface as an
  // unhandled promise rejection in the console on every page load.
  void setDoc(ref, { updatedAt: serverTimestamp() }, { merge: true }).catch(error => {
    console.warn("[Firestore] Failed to touch user profile", error);
  });

  return {
    id: firebaseUser.uid,
    name: data.name ?? firebaseUser.displayName ?? null,
    email: data.email ?? firebaseUser.email ?? null,
    phoneNumber: data.phoneNumber ?? firebaseUser.phoneNumber ?? null,
    photoURL: data.photoURL ?? firebaseUser.photoURL ?? null,
    bio: data.bio ?? null,
    city: data.city ?? null,
    countryCode: data.countryCode ?? null,
    profileVisibility: data.profileVisibility ?? "connections",
    phoneVisibility: data.phoneVisibility ?? "nobody",
    handleDiscoverability: data.handleDiscoverability ?? "exact_match",
    storyAudienceDefault: data.storyAudienceDefault ?? "connections",
    readReceiptsEnabled: data.readReceiptsEnabled ?? true,
    lastSeenVisibility: data.lastSeenVisibility ?? "connections",
    courseProgressOptIn: data.courseProgressOptIn ?? false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snapshot = await getDoc(usersCollection(uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data() as UserDoc;
  return {
    id: uid,
    name: data.name ?? null,
    email: data.email ?? null,
    phoneNumber: data.phoneNumber ?? null,
    photoURL: data.photoURL ?? null,
    bio: data.bio ?? null,
    city: data.city ?? null,
    countryCode: data.countryCode ?? null,
    profileVisibility: data.profileVisibility ?? "connections",
    phoneVisibility: data.phoneVisibility ?? "nobody",
    handleDiscoverability: data.handleDiscoverability ?? "exact_match",
    storyAudienceDefault: data.storyAudienceDefault ?? "connections",
    readReceiptsEnabled: data.readReceiptsEnabled ?? true,
    lastSeenVisibility: data.lastSeenVisibility ?? "connections",
    courseProgressOptIn: data.courseProgressOptIn ?? false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<AppUser, "name" | "email" | "photoURL" | "bio" | "city" | "countryCode" | "profileVisibility" | "phoneVisibility" | "handleDiscoverability" | "storyAudienceDefault" | "readReceiptsEnabled" | "lastSeenVisibility" | "courseProgressOptIn">>
): Promise<void> {
  await setDoc(
    usersCollection(uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
