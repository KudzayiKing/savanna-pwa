import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAt,
  Timestamp,
  endAt,
  type FieldValue,
} from "firebase/firestore";
import { getIdTokenResult, type User } from "firebase/auth";
import { useQuery } from "@tanstack/react-query";
import { getFirestoreDb } from "./firebase";
import { listFirebaseBlockedUserIds } from "./firebaseSafety";

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
  username: string | null;
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
  adminRole: "super_admin" | "support_admin" | "moderator" | "merchant_admin" | "community_admin" | "analyst" | null;
  accountStatus: "active" | "suspended" | "banned";
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
  username?: string | null;
  usernameLower?: string | null;
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
  adminRole?: AppUser["adminRole"];
  role?: string | null;
  isAdmin?: boolean;
  accountStatus?: AppUser["accountStatus"];
  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};

type PublicProfileDoc = {
  userId?: string | null;
  name?: string | null;
  username?: string | null;
  usernameLower?: string | null;
  photoURL?: string | null;
  bio?: string | null;
  city?: string | null;
  countryCode?: string | null;
  profileVisibility?: AppUser["profileVisibility"];
  handleDiscoverability?: AppUser["handleDiscoverability"];
  updatedAt?: Timestamp | Date | FieldValue | null;
};

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export function normalizeUsername(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function usernameOrNull(value: string | null | undefined): string | null {
  const normalized = normalizeUsername(value);
  if (!normalized) return null;
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error("Username must be 3-24 characters using letters, numbers, or underscores.");
  }
  return normalized;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function normalizeAdminRole(value: unknown): AppUser["adminRole"] {
  if (
    value === "super_admin"
    || value === "support_admin"
    || value === "moderator"
    || value === "merchant_admin"
    || value === "community_admin"
    || value === "analyst"
  ) {
    return value;
  }
  if (value === "admin") return "super_admin";
  return null;
}

function normalizeAccountStatus(value: unknown): AppUser["accountStatus"] {
  return value === "suspended" || value === "banned" ? value : "active";
}

function usersCollection(uid: string) {
  return doc(getFirestoreDb(), "users", uid);
}

function publicProfilesCollection(uid: string) {
  return doc(getFirestoreDb(), "publicProfiles", uid);
}

function usernamesCollection(usernameLower: string) {
  return doc(getFirestoreDb(), "usernames", usernameLower);
}

function followsCollection(followerUid: string, followingUid: string) {
  return doc(getFirestoreDb(), "follows", `${followerUid}__${followingUid}`);
}

function followingCollection(followerUid: string, followingUid: string) {
  return doc(getFirestoreDb(), "users", followerUid, "following", followingUid);
}

function publicProfileWrite(uid: string, data: UserDoc) {
  return {
    userId: uid,
    name: data.name ?? null,
    username: data.username ?? null,
    usernameLower: data.usernameLower ?? null,
    photoURL: data.photoURL ?? null,
    bio: data.bio ?? null,
    city: data.city ?? null,
    countryCode: data.countryCode ?? null,
    profileVisibility: data.profileVisibility ?? "connections",
    handleDiscoverability: data.handleDiscoverability ?? "exact_match",
    updatedAt: serverTimestamp(),
  } satisfies PublicProfileDoc;
}

function mapPublicProfile(uid: string, data: PublicProfileDoc): AppUser {
  return {
    id: data.userId ?? uid,
    name: data.name ?? null,
    username: data.username ?? null,
    email: null,
    phoneNumber: null,
    photoURL: data.photoURL ?? null,
    bio: data.bio ?? null,
    city: data.city ?? null,
    countryCode: data.countryCode ?? null,
    profileVisibility: data.profileVisibility ?? "connections",
    phoneVisibility: "nobody",
    handleDiscoverability: data.handleDiscoverability ?? "exact_match",
    storyAudienceDefault: "connections",
    readReceiptsEnabled: true,
    lastSeenVisibility: "connections",
    courseProgressOptIn: false,
    adminRole: null,
    accountStatus: "active",
    createdAt: null,
    updatedAt: toDate(data.updatedAt),
  };
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
  const [snapshot, tokenResult] = await Promise.all([
    getDoc(ref),
    getIdTokenResult(firebaseUser).catch(() => null),
  ]);
  const claimRole = normalizeAdminRole(tokenResult?.claims.adminRole ?? tokenResult?.claims.role);
  const claimAdminRole = tokenResult?.claims.admin === true ? "super_admin" : claimRole;

  const now = new Date();

  if (!snapshot.exists()) {
    const created: UserDoc = {
      name: firebaseUser.displayName ?? null,
      username: null,
      usernameLower: null,
      email: firebaseUser.email ?? null,
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
    await setDoc(publicProfilesCollection(firebaseUser.uid), publicProfileWrite(firebaseUser.uid, created), { merge: true });

    return {
      id: firebaseUser.uid,
      name: created.name ?? null,
      username: created.username ?? null,
      email: created.email ?? null,
      phoneNumber: firebaseUser.phoneNumber ?? null,
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
      adminRole: claimAdminRole,
      accountStatus: "active",
      createdAt: now,
      updatedAt: now,
    };
  }

  const data = snapshot.data() as UserDoc;
  const adminRole = claimAdminRole ?? normalizeAdminRole(data.adminRole ?? data.role ?? (data.isAdmin ? "admin" : null));

  // Fire-and-forget: a stale lastSeenAt must never block or fail a sign-in.
  // The catch matters — an unhandled rejection here would surface as an
  // unhandled promise rejection in the console on every page load.
  void setDoc(ref, { updatedAt: serverTimestamp() }, { merge: true }).catch(error => {
    console.warn("[Firestore] Failed to touch user profile", error);
  });
  void setDoc(
    publicProfilesCollection(firebaseUser.uid),
    publicProfileWrite(firebaseUser.uid, {
      ...data,
      name: data.name ?? firebaseUser.displayName ?? null,
      photoURL: data.photoURL ?? firebaseUser.photoURL ?? null,
    }),
    { merge: true },
  ).catch(error => {
    console.warn("[Firestore] Failed to sync public profile", error);
  });

  return {
    id: firebaseUser.uid,
    name: data.name ?? firebaseUser.displayName ?? null,
    username: data.username ?? null,
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
    adminRole,
    accountStatus: normalizeAccountStatus(data.accountStatus),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snapshot = await getDoc(publicProfilesCollection(uid));
  if (!snapshot.exists()) return null;

  return mapPublicProfile(uid, snapshot.data() as PublicProfileDoc);
}

export async function searchUserProfilesByUsername(queryValue: string, viewer?: AppUser | null): Promise<AppUser[]> {
  if (!viewer) return [];
  const normalized = normalizeUsername(queryValue);
  if (normalized.length < 2) return [];

  const snapshot = await getDocs(
    query(
      collection(getFirestoreDb(), "publicProfiles"),
      orderBy("usernameLower"),
      startAt(normalized),
      endAt(`${normalized}\uf8ff`),
      limit(8),
    ),
  );

  const blockedUserIds = new Set(await listFirebaseBlockedUserIds(viewer));
  return snapshot.docs
    .map(item => mapPublicProfile(item.id, item.data() as PublicProfileDoc))
    .filter(profile =>
      profile.id !== viewer.id
      && !blockedUserIds.has(profile.id)
      && Boolean(profile.username)
      && profile.handleDiscoverability === "exact_match"
      && profile.profileVisibility !== "private"
    );
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<AppUser, "name" | "username" | "email" | "photoURL" | "bio" | "city" | "countryCode" | "profileVisibility" | "phoneVisibility" | "handleDiscoverability" | "storyAudienceDefault" | "readReceiptsEnabled" | "lastSeenVisibility" | "courseProgressOptIn">>
): Promise<void> {
  const nextUsername = Object.prototype.hasOwnProperty.call(patch, "username")
    ? usernameOrNull(patch.username)
    : undefined;

  await runTransaction(getFirestoreDb(), async transaction => {
    const userRef = usersCollection(uid);
    const publicRef = publicProfilesCollection(uid);
    const currentSnapshot = await transaction.get(userRef);
    const current = currentSnapshot.exists() ? currentSnapshot.data() as UserDoc : {};
    const oldUsernameLower = current.usernameLower ?? null;
    const nextPatch: UserDoc = { ...patch };

    if (nextUsername !== undefined) {
      nextPatch.username = nextUsername;
      nextPatch.usernameLower = nextUsername;

      if (nextUsername) {
        const usernameRef = usernamesCollection(nextUsername);
        const usernameSnapshot = await transaction.get(usernameRef);
        const claimedBy = usernameSnapshot.exists() ? usernameSnapshot.data().uid : null;
        if (claimedBy && claimedBy !== uid) {
          throw new Error(`@${nextUsername} is already taken.`);
        }
      }
    }

    const merged: UserDoc = { ...current, ...nextPatch };
    transaction.set(userRef, { ...nextPatch, updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(publicRef, publicProfileWrite(uid, merged), { merge: true });

    if (nextUsername !== undefined && oldUsernameLower && oldUsernameLower !== nextUsername) {
      transaction.delete(usernamesCollection(oldUsernameLower));
    }

    if (nextUsername) {
      transaction.set(usernamesCollection(nextUsername), {
        uid,
        username: nextUsername,
        usernameLower: nextUsername,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    if (nextUsername === null && oldUsernameLower) {
      transaction.delete(usernamesCollection(oldUsernameLower));
    }
  });
}

export async function isFollowingUser(followerUid: string | null | undefined, followingUid: string | null | undefined): Promise<boolean> {
  if (!followerUid || !followingUid || followerUid === followingUid) return false;
  const [legacySnapshot, privateIndexSnapshot] = await Promise.all([
    getDoc(followsCollection(followerUid, followingUid)),
    getDoc(followingCollection(followerUid, followingUid)),
  ]);
  if (legacySnapshot.exists() && !privateIndexSnapshot.exists()) {
    void setDoc(followingCollection(followerUid, followingUid), {
      followerUserId: followerUid,
      followingUserId: followingUid,
      createdAt: serverTimestamp(),
    }).catch(error => {
      console.warn("[Firestore] Failed to backfill following index", error);
    });
  }
  return legacySnapshot.exists() || privateIndexSnapshot.exists();
}

export async function listFollowedUserIds(followerUid: string | null | undefined): Promise<string[]> {
  if (!followerUid) return [];
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "users", followerUid, "following"), orderBy("createdAt", "desc"), limit(400)));
  return snapshot.docs.map(item => item.id);
}

export async function followUser(follower: AppUser, followingUid: string): Promise<void> {
  if (follower.id === followingUid) throw new Error("You cannot follow yourself.");
  const payload = {
    followerUserId: follower.id,
    followingUserId: followingUid,
    createdAt: serverTimestamp(),
  };
  await Promise.all([
    setDoc(followsCollection(follower.id, followingUid), payload),
    setDoc(followingCollection(follower.id, followingUid), payload),
  ]);
}

export async function unfollowUser(follower: AppUser, followingUid: string): Promise<void> {
  if (follower.id === followingUid) return;
  await Promise.all([
    deleteDoc(followsCollection(follower.id, followingUid)),
    deleteDoc(followingCollection(follower.id, followingUid)),
  ]);
}

export function useFollowedUserIds(user?: AppUser | null, enabled = true) {
  return useQuery({
    queryKey: ["firebase", "following", user?.id ?? "guest"],
    queryFn: () => listFollowedUserIds(user?.id),
    enabled: enabled && Boolean(user),
  });
}
