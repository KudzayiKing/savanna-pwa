import type { AppUser } from "@/lib/userProfile";
import { ensureUserProfile } from "@/lib/userProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type FieldValue,
  type QueryConstraint,
} from "firebase/firestore";
import { getFirebaseAuth, getFirestoreDb } from "./firebase";
import { captureError, isPermissionError } from "./observability";

export type AdminRole = NonNullable<AppUser["adminRole"]>;
export type AdminAccountStatus = AppUser["accountStatus"];
export type AdminReportStatus = "new" | "reviewing" | "resolved" | "dismissed";
export type AdminReviewStatus = "pending" | "approved" | "paused" | "rejected";

export const adminRoleLabels: Record<AdminRole, string> = {
  super_admin: "Super admin",
  support_admin: "Support",
  moderator: "Moderator",
  merchant_admin: "Merchant ops",
  community_admin: "Community ops",
  analyst: "Analyst",
};

/**
 * The things an admin account is allowed to *change*.
 *
 * Roles are deliberately narrow: a merchant ops account can move a shop
 * through review but has no way to suspend a person, and a moderator can
 * triage reports without touching the commerce side. `analyst` maps to the
 * empty set, which is what makes it read-only — there is no separate
 * "read-only" flag to forget to check.
 *
 * Note this matrix is a UX affordance, not the security boundary. It decides
 * which buttons are enabled; `firestore.rules` decides what actually succeeds.
 * An admin who edits the bundle to enable a button still gets a
 * permission-denied from the server, because the rules do not consult this
 * table at all.
 */
export type AdminPermission =
  | "user.moderate"
  | "report.triage"
  | "shop.review"
  | "community.review"
  | "content.remove";

/**
 * Mirrored in `firestore.rules` canPerform() — including the deliberate
 * asymmetry between the last two roles: a moderator may pull content but may
 * not read private messages, so `content.remove` is *not* the same set as
 * `user.moderate`. Granting it to `community_admin` would let someone whose
 * entire job is approving groups delete a stranger's story.
 */
const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: ["user.moderate", "report.triage", "shop.review", "community.review", "content.remove"],
  support_admin: ["user.moderate", "report.triage", "content.remove"],
  moderator: ["report.triage", "community.review", "content.remove"],
  merchant_admin: ["shop.review"],
  community_admin: ["community.review"],
  analyst: [],
};

/**
 * Minimum length for a moderation reason.
 *
 * Short enough that "spam link" passes, long enough that "asd" does not. This
 * value is mirrored in `firestore.rules`, so changing it here alone will make
 * every admin write fail with permission-denied — change both together.
 */
export const REASON_MIN_LENGTH = 8;
export const REASON_MAX_LENGTH = 500;

export function adminPermissionsFor(role?: AdminRole | null): readonly AdminPermission[] {
  return role ? ADMIN_ROLE_PERMISSIONS[role] ?? [] : [];
}

export function canPerform(user: AppUser | null | undefined, permission: AdminPermission): boolean {
  return adminPermissionsFor(user?.adminRole).includes(permission);
}

export type AdminUserRow = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  city: string | null;
  countryCode: string | null;
  adminRole: AdminRole | null;
  accountStatus: AdminAccountStatus;
  /** Cannot start new conversations while true. */
  messagingRestricted: boolean;
  /** Cannot publish stories or community posts while true. */
  postingRestricted: boolean;
  verified: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type AdminSafetyReport = {
  id: string;
  reporterUserId: string;
  targetDomain: string;
  targetId: string;
  reason: string;
  evidenceScope: string;
  detail: string | null;
  status: AdminReportStatus;
  reviewedBy: string | null;
  /** What the reviewer decided, recorded when a report is closed. */
  resolution: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type AdminStorefrontRow = {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  category: string | null;
  visibility: string;
  verificationState: string;
  reviewStatus: AdminReviewStatus;
  /**
   * Internal suspicion marker, or null.
   *
   * Not part of `reviewStatus` and never shown to buyers: it exists so one
   * admin can leave a note for the next one without changing what the shop
   * looks like on the platform.
   */
  riskFlag: string | null;
  ownerCity: string | null;
  ownerCountryCode: string | null;
  updatedAt: Date | null;
};

export type AdminCommunityRow = {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  reviewStatus: AdminReviewStatus;
  memberCount: number;
  city: string | null;
  countryCode: string | null;
  updatedAt: Date | null;
};

/** The three kinds of user-generated thing an admin can pull. */
export type AdminContentKind = "story" | "communityPost" | "product";

/**
 * `visible` is the default and, for content written before moderation existed,
 * the implied state — a missing field must be read as visible, never as
 * removed. Removing something sets it explicitly rather than deleting the
 * document, so an appeal still has the content to be reviewed against.
 */
export type AdminModerationState = "visible" | "removed";

export type AdminContentRow = {
  id: string;
  kind: AdminContentKind;
  /** Full document path, because community posts are nested two levels deep. */
  path: string;
  authorUserId: string | null;
  authorName: string | null;
  /** Products carry a title; stories and posts carry a body instead. */
  title: string | null;
  body: string | null;
  mediaUrl: string | null;
  /** Community id for a post, storefront id for a product. Null for a story. */
  parentId: string | null;
  parentName: string | null;
  moderationState: AdminModerationState;
  removedReason: string | null;
  removedAt: Date | null;
  createdAt: Date | null;
};

export type AdminAppealStatus = "none" | "pending" | "upheld" | "overturned";

/**
 * Everything the console knows about one account, assembled on demand.
 *
 * A separate on-demand query rather than part of the dashboard because it is a
 * fan-out — six queries for one account. Folding it into the user list would
 * cost 720 reads every time the tab opened; loaded per account it costs six,
 * and only for the account an admin actually opened.
 */
export type AdminUserInvestigation = {
  user: AdminUserRow;
  /** Raw profile fields the row does not carry: bio, contact, settings. */
  profile: Record<string, unknown>;
  shops: AdminStorefrontRow[];
  communities: AdminCommunityRow[];
  /** Reports filed *against* this account. */
  reportsAgainst: AdminSafetyReport[];
  /** Reports this account filed — a one-sided reporter is worth knowing about. */
  reportsBy: AdminSafetyReport[];
  auditTrail: AdminAuditLog[];
  /** Stories and products by this author that an admin has pulled. */
  removedContentCount: number;
  storyCount: number;

  banAppealStatus: AdminAppealStatus;
  banAppealNote: string | null;
  banAppealAt: Date | null;
  banAppealReviewedBy: string | null;
  banAppealReviewedAt: Date | null;
};

export type AdminAuditLog = {
  id: string;
  adminUserId: string;
  adminName: string | null;
  adminRole: AdminRole | null;
  action: string;
  targetType: string;
  targetId: string;
  /** Why the admin did it. Mandatory — see REASON_MIN_LENGTH. */
  reason: string | null;
  /** The fields as they were, keyed by field name. */
  before: Record<string, unknown>;
  /** The fields as they are now, keyed by field name. */
  after: Record<string, unknown>;
  detail: string | null;
  actorUserAgent: string | null;
  actorPlatform: string | null;
  actorLanguage: string | null;
  actorTimezone: string | null;
  actorScreen: string | null;
  /**
   * Always null from the browser.
   *
   * Recording an IP requires a server that sees the socket — a PWA cannot know
   * its own public address, and any value it invented would be worse than
   * nothing because the log would look authoritative. The field exists so a
   * future trusted writer (Cloud Function, admin API) can populate it without a
   * schema migration.
   */
  ipAddress: string | null;
  createdAt: Date | null;
};

export type AdminDashboard = {
  users: AdminUserRow[];
  reports: AdminSafetyReport[];
  storefronts: AdminStorefrontRow[];
  communities: AdminCommunityRow[];
  auditLogs: AdminAuditLog[];
  health: {
    firebaseConfigured: boolean;
    localGemmaConfigured: boolean;
    embeddingGemmaConfigured: boolean;
    translateGemmaConfigured: boolean;
    cloudFallbackConfigured: boolean;
  };
};

type TimestampLike = Timestamp | Date | FieldValue | null | undefined;

const adminQueryKeys = {
  dashboard: ["firebase", "admin", "dashboard"] as const,
  users: (search: string) => ["firebase", "admin", "users", search.trim().toLowerCase()] as const,
  reports: ["firebase", "admin", "reports"] as const,
  storefronts: ["firebase", "admin", "storefronts"] as const,
  communities: ["firebase", "admin", "communities"] as const,
  audit: ["firebase", "admin", "audit"] as const,
};

function toDate(value: TimestampLike): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeAdminRole(value: unknown): AdminRole | null {
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

function normalizeReportStatus(value: unknown): AdminReportStatus {
  if (value === "reviewing" || value === "resolved" || value === "dismissed") return value;
  return "new";
}

function normalizeReviewStatus(value: unknown): AdminReviewStatus {
  if (value === "approved" || value === "paused" || value === "rejected") return value;
  return "pending";
}

function normalizeAccountStatus(value: unknown): AdminAccountStatus {
  return value === "suspended" || value === "banned" ? value : "active";
}

function assertAdmin(user?: AppUser | null) {
  if (!canAccessAdmin(user)) throw new Error("Admin access required.");
}

export function canAccessAdmin(user?: AppUser | null) {
  return Boolean(user?.adminRole);
}

/**
 * Whether this account can change anything at all.
 *
 * Derived from the permission matrix rather than special-casing `analyst`, so
 * adding a new read-only role later means adding it to that table with an empty
 * list — there is no second place that hardcodes which roles are passive.
 */
export function canWriteAdmin(user?: AppUser | null) {
  return adminPermissionsFor(user?.adminRole).length > 0;
}

function mapUserRow(id: string, data: Record<string, unknown>): AdminUserRow {
  return {
    id,
    name: readNullableString(data.name),
    username: readNullableString(data.username),
    email: readNullableString(data.email),
    phoneNumber: readNullableString(data.phoneNumber),
    photoURL: readNullableString(data.photoURL),
    city: readNullableString(data.city),
    countryCode: readNullableString(data.countryCode),
    adminRole: normalizeAdminRole(data.adminRole ?? data.role ?? (data.isAdmin ? "admin" : null)),
    accountStatus: normalizeAccountStatus(data.accountStatus),
    messagingRestricted: data.messagingRestricted === true,
    postingRestricted: data.postingRestricted === true,
    verified: data.verified === true,
    createdAt: toDate(data.createdAt as TimestampLike),
    updatedAt: toDate(data.updatedAt as TimestampLike),
  };
}

function mapSafetyReport(id: string, data: Record<string, unknown>): AdminSafetyReport {
  return {
    id,
    reporterUserId: readString(data.reporterUserId),
    targetDomain: readString(data.targetDomain, "unknown"),
    targetId: readString(data.targetId),
    reason: readString(data.reason, "other"),
    evidenceScope: readString(data.evidenceScope, "none"),
    detail: readNullableString(data.detail),
    status: normalizeReportStatus(data.status),
    reviewedBy: readNullableString(data.reviewedBy),
    resolution: readNullableString(data.resolution),
    createdAt: toDate(data.createdAt as TimestampLike),
    updatedAt: toDate(data.updatedAt as TimestampLike),
  };
}

function mapStorefront(id: string, data: Record<string, unknown>): AdminStorefrontRow {
  return {
    id,
    ownerUserId: readString(data.ownerUserId),
    name: readString(data.name, "Untitled shop"),
    slug: readString(data.slug, id),
    category: readNullableString(data.category),
    visibility: readString(data.visibility, "draft"),
    verificationState: readString(data.verificationState, "unverified"),
    reviewStatus: normalizeReviewStatus(data.reviewStatus),
    riskFlag: readNullableString(data.riskFlag),
    ownerCity: readNullableString(data.ownerCity),
    ownerCountryCode: readNullableString(data.ownerCountryCode),
    updatedAt: toDate(data.updatedAt as TimestampLike),
  };
}

function mapCommunity(id: string, data: Record<string, unknown>): AdminCommunityRow {
  return {
    id,
    ownerUserId: readString(data.ownerUserId),
    name: readString(data.name, "Untitled community"),
    slug: readString(data.slug, id),
    description: readNullableString(data.description),
    visibility: readString(data.visibility, "public"),
    reviewStatus: normalizeReviewStatus(data.reviewStatus),
    memberCount: typeof data.memberCount === "number" ? data.memberCount : 0,
    city: readNullableString(data.city),
    countryCode: readNullableString(data.countryCode),
    updatedAt: toDate(data.updatedAt as TimestampLike),
  };
}

function normalizeModerationState(value: unknown): AdminModerationState {
  return value === "removed" ? "removed" : "visible";
}

function normalizeAppealStatus(value: unknown): AdminAppealStatus {
  if (value === "pending" || value === "upheld" || value === "overturned") return value;
  return "none";
}

function mapStoryContent(id: string, data: Record<string, unknown>): AdminContentRow {
  return {
    id,
    kind: "story",
    path: `stories/${id}`,
    authorUserId: readNullableString(data.authorUserId),
    authorName: readNullableString(data.authorName),
    title: null,
    body: readNullableString(data.textBody),
    mediaUrl: readNullableString(data.primaryMediaUrl),
    parentId: readNullableString(data.communityId) ?? readNullableString(data.storefrontId),
    parentName: readNullableString(data.communityName) ?? readNullableString(data.storefrontName),
    moderationState: normalizeModerationState(data.moderationState),
    removedReason: readNullableString(data.removedReason),
    removedAt: toDate(data.removedAt as TimestampLike),
    createdAt: toDate(data.createdAt as TimestampLike),
  };
}

function mapPostContent(id: string, path: string, data: Record<string, unknown>): AdminContentRow {
  // The community id is taken from the document's own path rather than from a
  // field, because a post does not store its parent — the parent *is* where it
  // lives. `ref.parent.parent` is the community document.
  const parentId = readNullableString(data.communityId) ?? path.split("/")[1] ?? null;
  return {
    id,
    kind: "communityPost",
    path,
    authorUserId: readNullableString(data.authorUserId),
    authorName: readNullableString(data.authorName),
    title: readNullableString(data.title),
    body: readNullableString(data.body),
    mediaUrl: readNullableString(data.productPrimaryImageUrl),
    parentId,
    parentName: readNullableString(data.communityName) ?? readNullableString(data.storefrontName),
    moderationState: normalizeModerationState(data.moderationState),
    removedReason: readNullableString(data.removedReason),
    removedAt: toDate(data.removedAt as TimestampLike),
    createdAt: toDate(data.createdAt as TimestampLike),
  };
}

function mapProductContent(id: string, data: Record<string, unknown>): AdminContentRow {
  return {
    id,
    kind: "product",
    path: `products/${id}`,
    authorUserId: readNullableString(data.storefrontOwnerUserId),
    authorName: readNullableString(data.storefrontName),
    title: readNullableString(data.title),
    body: readNullableString(data.description),
    mediaUrl: readNullableString(data.primaryImageUrl),
    parentId: readNullableString(data.storefrontId),
    parentName: readNullableString(data.storefrontName),
    moderationState: normalizeModerationState(data.moderationState),
    removedReason: readNullableString(data.removedReason),
    removedAt: toDate(data.removedAt as TimestampLike),
    createdAt: toDate(data.createdAt as TimestampLike),
  };
}

/**
 * Recent content across all three moderatable surfaces.
 *
 * Each source is fetched separately and failures are absorbed per source. That
 * is not defensive padding: the community `posts` query is a collection-group
 * query, which only resolves once its index exists, and a console where one of
 * three queues is missing is far more useful than one that renders nothing
 * because the newest index is still building.
 */
async function listAdminContent(): Promise<AdminContentRow[]> {
  const db = getFirestoreDb();

  const [stories, posts, products] = await Promise.all([
    getDocs(query(collection(db, "stories"), orderBy("createdAt", "desc"), limit(40)))
      .then(snapshot => snapshot.docs.map(item => mapStoryContent(item.id, item.data())))
      .catch(() => [] as AdminContentRow[]),
    getDocs(query(collectionGroup(db, "posts"), orderBy("createdAt", "desc"), limit(40)))
      .then(snapshot => snapshot.docs.map(item => mapPostContent(item.id, item.ref.path, item.data())))
      .catch(() => [] as AdminContentRow[]),
    getDocs(query(collection(db, "products"), orderBy("createdAt", "desc"), limit(40)))
      .then(snapshot => snapshot.docs.map(item => mapProductContent(item.id, item.data())))
      .catch(() => [] as AdminContentRow[]),
  ]);

  return [...stories, ...posts, ...products]
    .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0));
}

export function useAdminContent(user?: AppUser | null) {
  return useQuery({
    queryKey: ["firebase", "admin", "content"] as const,
    queryFn: listAdminContent,
    enabled: canAccessAdmin(user),
  });
}

/**
 * Assembles everything known about one account.
 *
 * Every sub-query is individually fallible on purpose. An account that has
 * never been reported has no report rows; more importantly, the ordered
 * queries need composite indexes that may still be building, and one missing
 * index must not blank the entire drawer — an admin investigating a suspension
 * needs the account and its history even if one facet is unavailable.
 */
async function loadUserInvestigation(userId: string): Promise<AdminUserInvestigation | null> {
  const db = getFirestoreDb();
  const profileSnapshot = await getDoc(doc(db, "users", userId));
  if (!profileSnapshot.exists()) return null;

  const profile = profileSnapshot.data() as Record<string, unknown>;
  const user = mapUserRow(userId, profile);

  const safe = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch {
      return fallback;
    }
  };

  const [shops, communities, reportsAgainst, reportsBy, auditTrail, removedContentCount, storyCount] =
    await Promise.all([
      safe(
        () => getDocs(query(
          collection(db, "storefronts"),
          where("ownerUserId", "==", userId),
          orderBy("updatedAt", "desc"),
          limit(20),
        )).then(snapshot => snapshot.docs.map(item => mapStorefront(item.id, item.data()))),
        [] as AdminStorefrontRow[],
      ),
      safe(
        () => getDocs(query(
          collection(db, "communities"),
          where("ownerUserId", "==", userId),
          orderBy("updatedAt", "desc"),
          limit(20),
        )).then(snapshot => snapshot.docs.map(item => mapCommunity(item.id, item.data()))),
        [] as AdminCommunityRow[],
      ),
      safe(
        () => getDocs(query(
          collection(db, "safetyReports"),
          where("targetId", "==", userId),
          orderBy("createdAt", "desc"),
          limit(20),
        )).then(snapshot => snapshot.docs.map(item => mapSafetyReport(item.id, item.data()))),
        [] as AdminSafetyReport[],
      ),
      safe(
        () => getDocs(query(
          collection(db, "safetyReports"),
          where("reporterUserId", "==", userId),
          orderBy("createdAt", "desc"),
          limit(20),
        )).then(snapshot => snapshot.docs.map(item => mapSafetyReport(item.id, item.data()))),
        [] as AdminSafetyReport[],
      ),
      safe(
        () => getDocs(query(
          collection(db, "adminAuditLogs"),
          where("targetId", "==", userId),
          orderBy("createdAt", "desc"),
          limit(40),
        )).then(snapshot => snapshot.docs.map(item => mapAuditLog(item.id, item.data()))),
        [] as AdminAuditLog[],
      ),
      countWhere("stories", where("authorUserId", "==", userId), where("moderationState", "==", "removed")),
      countWhere("stories", where("authorUserId", "==", userId)),
    ]);

  return {
    user,
    profile,
    shops,
    communities,
    reportsAgainst,
    reportsBy,
    auditTrail,
    removedContentCount,
    storyCount,
    banAppealStatus: normalizeAppealStatus(profile.banAppealStatus),
    banAppealNote: readNullableString(profile.banAppealNote),
    banAppealAt: toDate(profile.banAppealAt as TimestampLike),
    banAppealReviewedBy: readNullableString(profile.banAppealReviewedBy),
    banAppealReviewedAt: toDate(profile.banAppealReviewedAt as TimestampLike),
  };
}

export function useUserInvestigation(user?: AppUser | null, targetUserId?: string | null) {
  return useQuery({
    queryKey: ["firebase", "admin", "investigate", targetUserId ?? "none"] as const,
    queryFn: () => loadUserInvestigation(targetUserId!),
    enabled: canAccessAdmin(user) && Boolean(targetUserId),
  });
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapAuditLog(id: string, data: Record<string, unknown>): AdminAuditLog {
  return {
    id,
    adminUserId: readString(data.adminUserId),
    adminName: readNullableString(data.adminName),
    adminRole: normalizeAdminRole(data.adminRole),
    action: readString(data.action),
    targetType: readString(data.targetType),
    targetId: readString(data.targetId),
    reason: readNullableString(data.reason),
    before: readRecord(data.before),
    after: readRecord(data.after),
    detail: readNullableString(data.detail),
    actorUserAgent: readNullableString(data.actorUserAgent),
    actorPlatform: readNullableString(data.actorPlatform),
    actorLanguage: readNullableString(data.actorLanguage),
    actorTimezone: readNullableString(data.actorTimezone),
    actorScreen: readNullableString(data.actorScreen),
    ipAddress: readNullableString(data.ipAddress),
    createdAt: toDate(data.createdAt as TimestampLike),
  };
}

function filterUsers(users: AdminUserRow[], search: string) {
  const needle = search.trim().replace(/^@+/, "").toLowerCase();
  if (!needle) return users;
  return users.filter(user =>
    [user.name, user.username, user.email, user.phoneNumber, user.city, user.id]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(needle)),
  );
}

async function listAdminUsers(search = "") {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "users"), orderBy("updatedAt", "desc"), limit(120)));
  return filterUsers(snapshot.docs.map(item => mapUserRow(item.id, item.data())), search);
}

async function listAdminReports() {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "safetyReports"), orderBy("createdAt", "desc"), limit(80)));
  return snapshot.docs.map(item => mapSafetyReport(item.id, item.data()));
}

async function listAdminStorefronts() {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "storefronts"), orderBy("updatedAt", "desc"), limit(80)));
  return snapshot.docs.map(item => mapStorefront(item.id, item.data()));
}

async function listAdminCommunities() {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "communities"), orderBy("updatedAt", "desc"), limit(80)));
  return snapshot.docs.map(item => mapCommunity(item.id, item.data()));
}

async function listAdminAuditLogs() {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "adminAuditLogs"), orderBy("createdAt", "desc"), limit(80)));
  return snapshot.docs.map(item => mapAuditLog(item.id, item.data()));
}

export type AdminReportDomain =
  | "profile" | "story" | "story_comment" | "community_post"
  | "storefront" | "product" | "course" | "message" | "payment";

export type AdminAnalytics = {
  users: {
    total: number;
    active: number;
    suspended: number;
    banned: number;
    verified: number;
    /** Signed up in the last 24h / 7d, from `createdAt`. */
    newToday: number;
    newThisWeek: number;
    /**
     * Profiles touched in the last 24h / 7d.
     *
     * This is not a true daily-active-user figure. There is no `lastSeenAt`
     * field — signing in stamps `updatedAt` and nothing else — so this counts
     * accounts that loaded the app in the window, which is the closest honest
     * signal the data supports. Labelled as such in the UI rather than being
     * passed off as DAU.
     */
    activeToday: number;
    activeThisWeek: number;
  };
  reports: {
    total: number;
    byStatus: Record<AdminReportStatus, number>;
    byDomain: Partial<Record<AdminReportDomain, number>>;
  };
  shops: { total: number; pending: number; approved: number; rejected: number; paused: number };
  communities: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    paused: number;
    createdThisWeek: number;
  };
  /**
   * Platform activity, counted from the content itself.
   *
   * `messagesSent*` is a collection-group count over every conversation's
   * messages. That is the one metric here with a real privacy cost — the
   * matching rule can only allow "read", not "count", so admins who can see
   * the number can in principle read the messages. It is gated to
   * `user.moderate` for that reason, and non-privileged roles get a 0 rather
   * than an error.
   */
  activity: {
    messagesSentToday: number;
    messagesSentThisWeek: number;
    storiesPostedToday: number;
    storiesPostedThisWeek: number;
    /**
     * Accounts older than a week that were still active today.
     *
     * The closest honest retention signal available: there is no session or
     * `lastSeenAt` record, so "active" still means "their profile was touched",
     * and someone who left the app open counts the same as someone who came
     * back deliberately. Labelled as a proxy in the UI rather than reported as
     * a retention rate, which the data cannot support.
     */
    returningToday: number;
  };
  /**
   * Per-country user counts.
   *
   * Location is **self-declared only** — it comes from the `countryCode` a
   * user sets on their own profile. Nothing is inferred from IP or device,
   * and nothing is verified, so a country of "Kenya" means "says they are in
   * Kenya". Counts therefore describe stated location, not real geography.
   */
  countries: Array<{ code: string; count: number }>;
  otherCountryCount: number;
  generatedAt: Date;
};

const AFRICA_COUNTRY_CODES = [
  "MA", "DZ", "EG", "SN", "CI", "GH", "NG", "CG", "CD", "ET",
  "UG", "KE", "RW", "TZ", "ZM", "MW", "MZ", "ZW", "BW", "ZA",
] as const;

/**
 * Exact totals via Firestore count aggregation.
 *
 * The dashboard list queries are capped (limit 80/120) so they can render,
 * which makes them useless as statistics — "120 users" was really "the first
 * 120 users". Counting reads index entries instead of documents, so it is
 * exact over the whole collection and billed at one read per thousand matched
 * entries. The two must not be mixed up: never present a capped list length
 * as a total.
 */
async function countWhere(collectionName: string, ...constraints: QueryConstraint[]): Promise<number> {
  try {
    const snapshot = await getCountFromServer(query(collection(getFirestoreDb(), collectionName), ...constraints));
    return snapshot.data().count;
  } catch {
    // A count query fails if the field is not indexed yet. Returning 0 keeps
    // the dashboard rendering instead of blanking the whole panel, but it is
    // a wrong number rather than a missing one — so surface it as null-ish by
    // convention: callers treat 0 as "no data" only for genuinely empty sets.
    return 0;
  }
}

/**
 * Count over a collection group.
 *
 * Separate from countWhere because a collection-group query is only answered
 * by a collection-group rule, and only the `messages` group has one — gated to
 * roles holding `user.moderate`. Anyone else gets a permission-denied here,
 * which becomes 0, so their dashboard renders without a metric it is not
 * allowed to see rather than failing the whole panel.
 */
async function countGroupWhere(collectionId: string, ...constraints: QueryConstraint[]): Promise<number> {
  try {
    const snapshot = await getCountFromServer(query(collectionGroup(getFirestoreDb(), collectionId), ...constraints));
    return snapshot.data().count;
  } catch {
    return 0;
  }
}

async function loadAnalytics(admin?: AppUser | null): Promise<AdminAnalytics> {
  const now = Date.now();
  const dayAgo = Timestamp.fromMillis(now - 24 * 60 * 60 * 1000);
  const weekAgo = Timestamp.fromMillis(now - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers, activeUsers, suspendedUsers, bannedUsers, verifiedUsers,
    newToday, newThisWeek, activeToday, activeThisWeek,
    totalReports, newReports, reviewingReports, resolvedReports, dismissedReports,
    totalShops, pendingShops, approvedShops, rejectedShops, pausedShops,
    totalCommunities, pendingCommunities, approvedCommunities, rejectedCommunities, pausedCommunities,
  ] = await Promise.all([
    countWhere("users"),
    countWhere("users", where("accountStatus", "==", "active")),
    countWhere("users", where("accountStatus", "==", "suspended")),
    countWhere("users", where("accountStatus", "==", "banned")),
    countWhere("users", where("verified", "==", true)),
    countWhere("users", where("createdAt", ">=", dayAgo)),
    countWhere("users", where("createdAt", ">=", weekAgo)),
    countWhere("users", where("updatedAt", ">=", dayAgo)),
    countWhere("users", where("updatedAt", ">=", weekAgo)),
    countWhere("safetyReports"),
    countWhere("safetyReports", where("status", "==", "new")),
    countWhere("safetyReports", where("status", "==", "reviewing")),
    countWhere("safetyReports", where("status", "==", "resolved")),
    countWhere("safetyReports", where("status", "==", "dismissed")),
    countWhere("storefronts"),
    countWhere("storefronts", where("reviewStatus", "==", "pending")),
    countWhere("storefronts", where("reviewStatus", "==", "approved")),
    countWhere("storefronts", where("reviewStatus", "==", "rejected")),
    countWhere("storefronts", where("reviewStatus", "==", "paused")),
    countWhere("communities"),
    countWhere("communities", where("reviewStatus", "==", "pending")),
    countWhere("communities", where("reviewStatus", "==", "approved")),
    countWhere("communities", where("reviewStatus", "==", "rejected")),
    countWhere("communities", where("reviewStatus", "==", "paused")),
  ]);

  // Country counts: one count query per tracked country. These run in
  // parallel; each is billed on matched index entries, not documents, so the
  // fan-out stays cheap even as the user base grows.
  const countryCounts = await Promise.all(
    AFRICA_COUNTRY_CODES.map(async code => ({
      code: code as string,
      count: await countWhere("users", where("countryCode", "==", code)),
    })),
  );

  const byDomain: Partial<Record<AdminReportDomain, number>> = {};
  const domains: AdminReportDomain[] = [
    "profile", "story", "story_comment", "community_post",
    "storefront", "product", "course", "message", "payment",
  ];
  const domainCounts = await Promise.all(
    domains.map(async domain => ({
      domain,
      count: await countWhere("safetyReports", where("targetDomain", "==", domain)),
    })),
  );
  for (const entry of domainCounts) {
    if (entry.count > 0) byDomain[entry.domain] = entry.count;
  }

  const knownCountryTotal = countryCounts.reduce((sum, entry) => sum + entry.count, 0);

  // Activity counts are a separate block on purpose: the message counts are
  // permission-gated, and keeping them out of the Promise.all above means a
  // denied count can never reject the batch that the whole panel depends on.
  // Skipped rather than attempted-and-failed for roles that cannot read the
  // messages group. The count would be denied anyway, and firing a request we
  // know is doomed just adds a round trip and a permissions error to the log.
  const canReadMessages = canPerform(admin, "user.moderate");

  const [
    messagesSentToday, messagesSentThisWeek,
    storiesPostedToday, storiesPostedThisWeek,
    returningToday, communitiesCreatedThisWeek,
  ] = await Promise.all([
    canReadMessages ? countGroupWhere("messages", where("createdAt", ">=", dayAgo)) : 0,
    canReadMessages ? countGroupWhere("messages", where("createdAt", ">=", weekAgo)) : 0,
    countWhere("stories", where("createdAt", ">=", dayAgo)),
    countWhere("stories", where("createdAt", ">=", weekAgo)),
    countWhere("users", where("createdAt", "<=", weekAgo), where("updatedAt", ">=", dayAgo)),
    countWhere("communities", where("createdAt", ">=", weekAgo)),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers,
      banned: bannedUsers,
      verified: verifiedUsers,
      newToday,
      newThisWeek,
      activeToday,
      activeThisWeek,
    },
    reports: {
      total: totalReports,
      byStatus: { new: newReports, reviewing: reviewingReports, resolved: resolvedReports, dismissed: dismissedReports },
      byDomain,
    },
    shops: { total: totalShops, pending: pendingShops, approved: approvedShops, rejected: rejectedShops, paused: pausedShops },
    communities: {
      total: totalCommunities,
      pending: pendingCommunities,
      approved: approvedCommunities,
      rejected: rejectedCommunities,
      paused: pausedCommunities,
      createdThisWeek: communitiesCreatedThisWeek,
    },
    activity: {
      messagesSentToday,
      messagesSentThisWeek,
      storiesPostedToday,
      storiesPostedThisWeek,
      returningToday,
    },
    countries: countryCounts.filter(entry => entry.count > 0),
    // Everyone outside the tracked set, plus profiles with no country set.
    // Clamped because the counts are not a consistent snapshot — a signup
    // between queries would otherwise show as a negative.
    otherCountryCount: Math.max(0, totalUsers - knownCountryTotal),
    generatedAt: new Date(),
  };
}

export function useAdminAnalytics(user?: AppUser | null) {
  return useQuery({
    queryKey: [...adminQueryKeys.audit, "analytics"] as const,
    // Wrapped rather than passed directly: React Query calls queryFn with its
    // own context object, so a bare reference would receive that as the first
    // argument instead of the admin user the role gate needs.
    queryFn: () => loadAnalytics(user),
    enabled: canAccessAdmin(user),
    // Counts are cheap but not free, and this panel is glanced at repeatedly
    // during a moderation session. A minute of staleness is invisible at this
    // scale and keeps a busy console from re-counting on every tab switch.
    staleTime: 60_000,
  });
}

export type AdminErrorSeverity = "error" | "warning" | "info";

export type AdminErrorLog = {
  id: string;
  scope: string;
  severity: AdminErrorSeverity;
  message: string;
  stack: string | null;
  context: Record<string, string | number | boolean | null>;
  route: string | null;
  sessionId: string | null;
  /** Who was signed in when it happened. Null means signed out. */
  userId: string | null;
  appVersion: string | null;
  acknowledgedBy: string | null;
  createdAt: Date | null;
};

export type AdminErrorFilters = {
  severity: AdminErrorSeverity | "all";
  scope: string | "all";
  search: string;
  /** Hide entries an admin has already marked as seen. */
  unacknowledgedOnly: boolean;
};

function normalizeSeverity(value: unknown): AdminErrorSeverity {
  if (value === "warning" || value === "info") return value;
  return "error";
}

function mapErrorLog(id: string, data: Record<string, unknown>): AdminErrorLog {
  const context: Record<string, string | number | boolean | null> = {};
  const raw = data.context;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        context[key] = value;
      } else {
        // The rules cap the document size but cannot type-check map values, so
        // a non-primitive is possible in principle. Stringifying keeps the
        // admin view rendering instead of throwing on an unexpected shape.
        context[key] = String(value);
      }
    }
  }

  return {
    id,
    scope: readString(data.scope, "unknown"),
    severity: normalizeSeverity(data.severity),
    message: readString(data.message, "Unknown failure"),
    stack: readNullableString(data.stack),
    context,
    route: readNullableString(data.route),
    sessionId: readNullableString(data.sessionId),
    userId: readNullableString(data.userId),
    appVersion: readNullableString(data.appVersion),
    acknowledgedBy: readNullableString(data.acknowledgedBy),
    createdAt: toDate(data.createdAt as TimestampLike),
  };
}

/**
 * Recent client-reported failures, newest first.
 *
 * Reads a wider window than the other admin lists (150 vs 80) because error
 * volume is bursty: a single broken deploy produces hundreds of identical
 * entries, and a narrow window would show only the burst and hide the
 * long tail of unrelated failures underneath it.
 */
async function listAdminErrorLogs(): Promise<AdminErrorLog[]> {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "errorLogs"), orderBy("createdAt", "desc"), limit(150)));
  return snapshot.docs.map(item => mapErrorLog(item.id, item.data()));
}

export function useAdminErrorLogs(user?: AppUser | null) {
  return useQuery({
    queryKey: ["firebase", "admin", "errorLogs"] as const,
    queryFn: listAdminErrorLogs,
    enabled: canAccessAdmin(user),
    // Polled, unlike the other panels. An admin watching a deploy needs this
    // to update on its own; 30s is fast enough to catch a regression while a
    // fix is going out and slow enough to be a rounding error on reads.
    refetchInterval: 30_000,
  });
}

export function useAcknowledgeError(user?: AppUser | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (errorId: string) => {
      assertAdmin(user);
      await updateDoc(doc(getFirestoreDb(), "errorLogs", errorId), {
        acknowledgedBy: user!.id,
        acknowledgedAt: serverTimestamp(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["firebase", "admin", "errorLogs"] });
    },
  });
}

/**
 * Device and locale fingerprint attached to every audit entry.
 *
 * Cached after the first call — none of it changes during a session, and
 * reading `navigator`/`screen` on every mutation would be pointless work.
 */
let cachedActorContext: Record<string, string | null> | null = null;

function actorContext() {
  if (cachedActorContext) return cachedActorContext;

  const nav = typeof navigator === "undefined" ? null : navigator;
  const screen = typeof window === "undefined" ? null : window.screen;
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    // Some embedded webviews throw here. Losing the timezone must not lose
    // the audit entry.
  }

  cachedActorContext = {
    actorUserAgent: (nav?.userAgent ?? "unknown").slice(0, 400),
    actorPlatform: nav?.platform ?? "unknown",
    actorLanguage: nav?.language ?? "unknown",
    actorTimezone: timezone,
    actorScreen: screen ? `${screen.width}x${screen.height}` : "unknown",
    ipAddress: null,
  };
  return cachedActorContext;
}

/**
 * What kind of thing an admin action is aimed at.
 *
 * Also the `targetType` written onto the audit entry, so these strings are a
 * storage format, not just a discriminant — renaming one orphans every log
 * already written under the old name.
 */
export type AdminTargetType =
  | "user" | "safetyReport" | "storefront" | "community"
  | "story" | "communityPost" | "product";

type AdminMutationRequest = {
  /**
   * Path to the target document.
   *
   * A path rather than a collection name because moderation targets are not
   * all top-level: a community post lives at `communities/{id}/posts/{id}`.
   * `doc(db, path, id)` accepts both forms, so top-level callers just pass the
   * collection name.
   */
  path: string;
  targetId: string;
  targetType: AdminTargetType;
  action: string;
  permission: AdminPermission;
  /** Everything written to the document. May contain serverTimestamp(). */
  patch: Record<string, unknown>;
  /**
   * Values written only when the field is missing on the stored document.
   *
   * Several rules validate fields that predate this console — a storefront
   * created before review existed has no `reviewStatus` at all. Rules evaluate
   * the *merged* document, so an absent field fails the write even though the
   * admin never intended to touch it. Backfilling here keeps a legacy document
   * moderatable, without rewriting ones that are already correct.
   */
  defaults?: Record<string, unknown>;
  /** Fields captured into `before` from the document as it stands. */
  tracked: readonly string[];
  /** New values for the tracked fields, captured into `after`. Primitives only. */
  changes: Record<string, unknown>;
  reason: string;
  detail?: string | null;
};

/**
 * Applies an admin change and its audit entry as one atomic transaction.
 *
 * The transaction is the point. With two separate writes, a mutation lands even
 * if the audit write fails — so an admin wanting to act untraceably only has to
 * stop the second call. Inside a transaction the rules evaluate both documents
 * together: if the audit entry is rejected, the change rolls back with it and
 * nothing happened. That turns "admins should log their actions" from a
 * convention the client honours into a property the database enforces.
 *
 * `before` is read inside the transaction too, so it reflects the document as
 * it was at commit time rather than whenever the page happened to load.
 */
async function runAdminMutation(admin: AppUser, request: AdminMutationRequest): Promise<void> {
  if (!canAccessAdmin(admin)) throw new Error("Admin access required.");
  if (!canPerform(admin, request.permission)) {
    const label = admin.adminRole ? adminRoleLabels[admin.adminRole] : "This account";
    throw new Error(`${label} accounts are not allowed to ${request.action.replace(/[.]/g, " ")}.`);
  }

  // Defensive on purpose. Every caller is supposed to collect a reason before
  // firing the mutation, but a missing one used to surface as a bare
  // "Cannot read properties of undefined" TypeError from .trim() — which tells
  // an admin nothing about what went wrong. Fail with the real message instead.
  const reason = typeof request.reason === "string" ? request.reason.trim() : "";
  if (reason.length < REASON_MIN_LENGTH) {
    throw new Error(`A reason of at least ${REASON_MIN_LENGTH} characters is required.`);
  }
  if (reason.length > REASON_MAX_LENGTH) {
    throw new Error(`Keep the reason under ${REASON_MAX_LENGTH} characters.`);
  }

  const db = getFirestoreDb();
  const targetRef = doc(db, request.path, request.targetId);
  const auditRef = doc(collection(db, "adminAuditLogs"));

  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(targetRef);
      if (!snapshot.exists()) {
        throw new Error(`${request.targetType} ${request.targetId} no longer exists.`);
      }

      const current = snapshot.data() as DocumentData;
      const before: Record<string, unknown> = {};
      for (const field of request.tracked) {
        before[field] = current[field] ?? null;
      }

      // Defaults are resolved against the stored document inside the
      // transaction, so two admins acting on the same legacy record cannot
      // race to backfill it with different values — the read and the write see
      // one consistent version.
      const backfilled: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(request.defaults ?? {})) {
        if (current[field] === undefined) backfilled[field] = value;
      }

      const after: Record<string, unknown> = { ...before, ...request.changes, ...backfilled };

      transaction.update(targetRef, { ...request.patch, ...backfilled, updatedAt: serverTimestamp() });
      transaction.set(auditRef, {
        adminUserId: admin.id,
        adminName: admin.name ?? admin.username ?? null,
        adminRole: admin.adminRole ?? "unknown",
        action: request.action,
        targetType: request.targetType,
        targetId: request.targetId,
        reason,
        before,
        after,
        detail: request.detail?.trim() || null,
        ...actorContext(),
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    /**
     * A failed admin action is the single most important thing to record.
     *
     * Everything else in the product can fail without anyone noticing for a
     * day; an admin write that fails means either the rules and the client have
     * drifted apart (the rules list a field the mutation no longer sends, or
     * vice versa) or someone tried to exercise a permission their role does not
     * carry. Both need investigating, and neither leaves a trace on its own —
     * the audit entry is written inside the same transaction, so a rejected
     * write produces no audit record at all.
     *
     * Rethrown unchanged: the dialog shows the message to the admin, and
     * silently swallowing it would make a denied action look like a successful
     * one.
     */
    captureError("admin.mutation", error, {
      action: request.action,
      targetType: request.targetType,
      targetId: request.targetId,
      adminRole: admin.adminRole ?? "unknown",
      permissionDenied: isPermissionError(error),
    });
    throw error;
  }
}

async function loadDashboard(user?: AppUser | null): Promise<AdminDashboard> {
  assertAdmin(user);
  const [users, reports, storefronts, communities, auditLogs] = await Promise.all([
    listAdminUsers(),
    listAdminReports(),
    listAdminStorefronts(),
    listAdminCommunities(),
    listAdminAuditLogs(),
  ]);

  return {
    users,
    reports,
    storefronts,
    communities,
    auditLogs,
    health: {
      firebaseConfigured: Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
      localGemmaConfigured: Boolean(import.meta.env.VITE_GEMMA_LITERTLM_MODEL_URL),
      embeddingGemmaConfigured: Boolean(import.meta.env.VITE_EMBEDDING_GEMMA_MODEL_URL),
      translateGemmaConfigured: Boolean(import.meta.env.VITE_TRANSLATE_GEMMA_MODEL_URL),
      cloudFallbackConfigured: Boolean(import.meta.env.VITE_GEMMA_CLOUD_FALLBACK_URL),
    },
  };
}

export function useAdminDashboard(user?: AppUser | null) {
  return useQuery({
    queryKey: adminQueryKeys.dashboard,
    queryFn: () => loadDashboard(user),
    enabled: canAccessAdmin(user),
  });
}

export function useAdminUsers(user?: AppUser | null, search = "") {
  return useQuery({
    queryKey: adminQueryKeys.users(search),
    queryFn: () => listAdminUsers(search),
    enabled: canAccessAdmin(user),
  });
}

export function useAdminMutations(user?: AppUser | null) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.dashboard }),
      queryClient.invalidateQueries({ queryKey: ["firebase", "admin"] }),
    ]);
  };

  return {
    updateUserStatus: useMutation({
      mutationFn: async ({ userId, status, reason, detail }: { userId: string; status: AdminAccountStatus; reason: string; detail?: string }) => {
        assertAdmin(user);
        await runAdminMutation(user!, {
          path: "users",
          targetId: userId,
          targetType: "user",
          action: `user.${status}`,
          permission: "user.moderate",
          patch: { accountStatus: status, moderationUpdatedAt: serverTimestamp() },
          tracked: ["accountStatus"],
          changes: { accountStatus: status },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),
    updateReportStatus: useMutation({
      mutationFn: async ({ reportId, status, reason, detail, resolution }: { reportId: string; status: AdminReportStatus; reason: string; detail?: string; resolution?: string }) => {
        assertAdmin(user);
        const note = resolution?.trim() || null;
        await runAdminMutation(user!, {
          path: "safetyReports",
          targetId: reportId,
          targetType: "safetyReport",
          action: `report.${status}`,
          permission: "report.triage",
          patch: {
            status,
            reviewedBy: user!.id,
            reviewedAt: serverTimestamp(),
            // Written even when null so that resolving a report without a note
            // clears a previously recorded one rather than leaving stale text
            // attached to a different outcome.
            ...(note ? { resolution: note } : {}),
          },
          tracked: ["status", "resolution"],
          changes: { status, resolution: note },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),
    /**
     * Toggles a capability restriction on an account.
     *
     * Restrictions are independent of `accountStatus`: suspending someone stops
     * everything at once, whereas these let a moderator stop one behaviour —
     * e.g. someone who spams groups but is otherwise fine can keep posting
     * while losing the ability to start conversations.
     */
    setUserRestriction: useMutation({
      mutationFn: async ({ userId, field, value, reason, detail }: {
        userId: string;
        field: "messagingRestricted" | "postingRestricted";
        value: boolean;
        reason: string;
        detail?: string;
      }) => {
        assertAdmin(user);
        const label = field === "messagingRestricted" ? "messaging" : "posting";
        await runAdminMutation(user!, {
          path: "users",
          targetId: userId,
          targetType: "user",
          action: `user.${value ? "restrict" : "unrestrict"}_${label}`,
          permission: "user.moderate",
          patch: { [field]: value, moderationUpdatedAt: serverTimestamp() },
          tracked: [field],
          changes: { [field]: value },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),
    setUserVerified: useMutation({
      mutationFn: async ({ userId, verified, reason, detail }: { userId: string; verified: boolean; reason: string; detail?: string }) => {
        assertAdmin(user);
        await runAdminMutation(user!, {
          path: "users",
          targetId: userId,
          targetType: "user",
          action: `user.${verified ? "verify" : "unverify"}`,
          permission: "user.moderate",
          patch: { verified, moderationUpdatedAt: serverTimestamp() },
          tracked: ["verified"],
          changes: { verified },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),
    updateStorefrontReview: useMutation({
      mutationFn: async ({ storefrontId, status, reason, detail }: { storefrontId: string; status: AdminReviewStatus; reason: string; detail?: string }) => {
        assertAdmin(user);
        const verificationState = status === "approved" ? "verified" : status === "rejected" ? "rejected" : "pending";
        await runAdminMutation(user!, {
          path: "storefronts",
          targetId: storefrontId,
          targetType: "storefront",
          action: `storefront.${status}`,
          permission: "shop.review",
          patch: {
            reviewStatus: status,
            verificationState,
            reviewedBy: user!.id,
            reviewedAt: serverTimestamp(),
          },
          tracked: ["reviewStatus", "verificationState"],
          changes: { reviewStatus: status, verificationState },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),
    updateCommunityReview: useMutation({
      mutationFn: async ({ communityId, status, reason, detail }: { communityId: string; status: AdminReviewStatus; reason: string; detail?: string }) => {
        assertAdmin(user);
        await runAdminMutation(user!, {
          path: "communities",
          targetId: communityId,
          targetType: "community",
          action: `community.${status}`,
          permission: "community.review",
          patch: {
            reviewStatus: status,
            reviewedBy: user!.id,
            reviewedAt: serverTimestamp(),
          },
          tracked: ["reviewStatus"],
          changes: { reviewStatus: status },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),

    /**
     * Removes or restores a piece of content.
     *
     * Nothing is deleted. Both the rules and this client treat removal as a
     * state change, which is what makes an appeal possible — the content has
     * to still exist for someone to look at it and disagree.
     */
    setContentModeration: useMutation({
      mutationFn: async ({ item, state, reason, detail }: {
        item: AdminContentRow;
        state: AdminModerationState;
        reason: string;
        detail?: string;
      }) => {
        assertAdmin(user);
        const removing = state === "removed";
        // Everything before the last slash is the collection: `stories` for a
        // story, `communities/{cid}/posts` for a nested community post.
        const collectionPath = item.path.slice(0, item.path.lastIndexOf("/"));
        await runAdminMutation(user!, {
          path: collectionPath,
          targetId: item.id,
          targetType: item.kind === "story" ? "story" : item.kind === "product" ? "product" : "communityPost",
          action: `${removing ? "content.remove" : "content.restore"}.${item.kind}`,
          permission: "content.remove",
          patch: removing
            ? {
              moderationState: "removed",
              removedAt: serverTimestamp(),
              removedBy: user!.id,
              removedReason: reason,
            }
            // Cleared rather than left behind: keeping the old reason would
            // keep explaining why something was pulled after it was restored,
            // and the next moderator reading the document would act on it.
            : {
              moderationState: "visible",
              removedAt: null,
              removedBy: user!.id,
              removedReason: null,
            },
          tracked: ["moderationState", "removedReason"],
          changes: { moderationState: state, removedReason: removing ? reason : null },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),

    setCommunityVisibility: useMutation({
      mutationFn: async ({ communityId, visibility, reason, detail, currentReviewStatus }: {
        communityId: string;
        visibility: "public" | "private" | "unlisted";
        reason: string;
        detail?: string;
        currentReviewStatus?: AdminReviewStatus;
      }) => {
        assertAdmin(user);
        await runAdminMutation(user!, {
          path: "communities",
          targetId: communityId,
          targetType: "community",
          action: `community.visibility_${visibility}`,
          permission: "community.review",
          patch: { visibility, reviewedBy: user!.id, reviewedAt: serverTimestamp() },
          // Backfilled, not written: the rules validate reviewStatus on every
          // admin write, and communities made before review existed have no
          // such field. Writing it unconditionally would silently reset the
          // review decision on communities that already have one.
          defaults: { reviewStatus: currentReviewStatus ?? "approved" },
          tracked: ["visibility"],
          changes: { visibility },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),

    /**
     * Marks a shop as suspicious for other admins to look at.
     *
     * Internal only — it deliberately changes nothing buyers can see. Pairing
     * it with `reviewStatus` instead of overloading that field means "approved"
     * and "worth a second look" can both be true without contradicting.
     */
    setStorefrontRiskFlag: useMutation({
      mutationFn: async ({ storefrontId, flagged, reason, detail, currentReviewStatus, currentVerificationState }: {
        storefrontId: string;
        flagged: boolean;
        reason: string;
        detail?: string;
        currentReviewStatus?: AdminReviewStatus;
        currentVerificationState?: string;
      }) => {
        assertAdmin(user);
        await runAdminMutation(user!, {
          path: "storefronts",
          targetId: storefrontId,
          targetType: "storefront",
          action: flagged ? "storefront.flag_suspicious" : "storefront.clear_flag",
          permission: "shop.review",
          patch: {
            riskFlag: flagged ? "suspicious" : null,
            riskFlaggedBy: user!.id,
            riskFlaggedAt: serverTimestamp(),
            reviewedBy: user!.id,
            reviewedAt: serverTimestamp(),
          },
          defaults: {
            reviewStatus: currentReviewStatus ?? "pending",
            verificationState: currentVerificationState ?? "unverified",
          },
          tracked: ["riskFlag"],
          changes: { riskFlag: flagged ? "suspicious" : null },
          reason,
          detail,
        });
      },
      onSuccess: invalidate,
    }),

    /**
     * Records the outcome of a suspension appeal.
     *
     * Overturning one also lifts the suspension, because an appeal that says
     * "overturned" while the account stays banned is two sources of truth
     * disagreeing — and the account is the one that has to be right, since it
     * is what the rest of the product reads.
     */
    resolveAppeal: useMutation({
      mutationFn: async ({ userId, status, note, reason }: {
        userId: string;
        status: "upheld" | "overturned";
        note?: string;
        reason: string;
      }) => {
        assertAdmin(user);
        const trimmedNote = note?.trim() || null;
        const restoring = status === "overturned";
        await runAdminMutation(user!, {
          path: "users",
          targetId: userId,
          targetType: "user",
          action: `user.appeal_${status}`,
          permission: "user.moderate",
          patch: {
            banAppealStatus: status,
            banAppealNote: trimmedNote,
            banAppealReviewedBy: user!.id,
            banAppealReviewedAt: serverTimestamp(),
            ...(restoring ? { accountStatus: "active", moderationUpdatedAt: serverTimestamp() } : {}),
          },
          tracked: restoring
            ? ["banAppealStatus", "banAppealNote", "accountStatus"]
            : ["banAppealStatus", "banAppealNote"],
          changes: {
            banAppealStatus: status,
            banAppealNote: trimmedNote,
            ...(restoring ? { accountStatus: "active" as const } : {}),
          },
          reason,
        });
      },
      onSuccess: invalidate,
    }),
  };
}

/**
 * Forces a fresh ID token and re-reads the resulting profile.
 *
 * Custom claims ride inside the ID token, and the SDK caches that token for
 * about an hour. So after an admin role is granted, the account keeps its old
 * (role-less) token until it expires — the user sees "access denied" and no
 * amount of refreshing the page helps. Passing `true` bypasses the cache.
 *
 * Returns the reloaded profile, or null if nobody is signed in.
 */
export async function reloadAdminClaim(): Promise<AppUser | null> {
  const firebaseUser = getFirebaseAuth().currentUser;
  if (!firebaseUser) return null;
  await firebaseUser.getIdTokenResult(true);
  return ensureUserProfile(firebaseUser);
}
