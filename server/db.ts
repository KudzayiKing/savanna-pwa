import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditEvents,
  blocks,
  consents,
  conversationMembers,
  conversations,
  courseEnrollments,
  courseLessons,
  courseModules,
  courses,
  deviceSessions,
  InsertUser,
  privacySettings,
  profiles,
  reports,
  messageDeliveryReceipts,
  messageAttachments,
  messages,
  merchantOnboarding,
  merchantSettlementProfiles,
  lessonProgress,
  orderItems,
  orders,
  orderStatusEvents,
  paymentIntents,
  paymentProviderEvents,
  paymentReceipts,
  productMedia,
  products,
  storefronts,
  stories,
  storyMedia,
  storyAudienceMembers,
  storyReactions,
  storyViews,
  type PrivacySettings,
  type Profile,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { bytesMatchMimeType } from "./media";
import { storageGetSignedUrl, storagePut } from "./storage";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { canAccessLesson, canMerchantAdvanceOrder, canTransitionPaymentIntent, canViewStory, resolveReceiptStatus } from "../shared/domainRules";
import { createDiscoveryBadge } from "../shared/discovery";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Fails the process at startup if required configuration is missing.
 *
 * Without this the server booted happily with no database and no session
 * secret: `getDb()` logged a warning and returned null, `upsertUser()` became
 * a no-op, and every request silently succeeded while persisting nothing. That
 * is the worst possible failure mode — it looks healthy and loses data.
 *
 * Call this from both entry points before listening.
 */
export function assertRuntimeConfig(): void {
  const missing = (
    [
      ["DATABASE_URL", process.env.DATABASE_URL],
      ["JWT_SECRET", ENV.cookieSecret],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill it in.`
    );
  }
}

/**
 * Returns the database handle, throwing if it cannot be obtained.
 *
 * Previously this returned `null` when `DATABASE_URL` was unset, and every
 * caller had a `if (!db)` branch that turned writes into silent no-ops. Failing
 * loudly is strictly better: a 500 the operator can see beats a "success" that
 * persisted nothing.
 */
export async function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not configured. Call assertRuntimeConfig() at startup."
      );
    }
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      throw new Error("Database connection could not be established");
    }
  }
  return _db;
}

/**
 * Proves the database actually answers, and returns how long it took.
 *
 * Drizzle opens its connection lazily, so a process that has never served a
 * query looks perfectly healthy right up until real traffic arrives. A
 * readiness probe has to touch the database to mean anything — that is the one
 * dependency Savanna cannot degrade without.
 *
 * Throws on failure; callers decide whether that means 503 or a degraded flag.
 */
export async function pingDatabase(): Promise<number> {
  const startedAt = Date.now();
  const db = await getDb();
  await db.execute(sql`select 1`);
  return Date.now() - startedAt;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  const fields = ["name", "email", "loginMethod"] as const;
  for (const field of fields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  // Owner bootstrap: the Supabase user id named by OWNER_SUPABASE_USER_ID is
  // promoted to admin on its first sign-in. Leave the variable empty to disable.
  const ownerOpenId = ENV.ownerSupabaseUserId
    ? `supabase:${ENV.ownerSupabaseUserId}`
    : "";
  values.role =
    user.role ?? (ownerOpenId && user.openId === ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

type AccountProfileInput = {
  displayName: string;
  bio?: string | null;
  countryCode?: string | null;
  city?: string | null;
  profileVisibility: "public" | "connections" | "private";
};

type AccountPrivacyInput = {
  phoneVisibility: "nobody" | "connections";
  handleDiscoverability: "exact_match" | "invite_only";
  storyAudienceDefault: "connections" | "custom" | "private";
  readReceiptsEnabled: boolean;
  lastSeenVisibility: "nobody" | "connections";
  courseProgressOptIn: boolean;
};

function defaultProfile(displayName: string): AccountProfileInput {
  return {
    displayName,
    bio: null,
    countryCode: null,
    city: null,
    profileVisibility: "connections",
  };
}

const defaultPrivacy: AccountPrivacyInput = {
  phoneVisibility: "nobody",
  handleDiscoverability: "exact_match",
  storyAudienceDefault: "connections",
  readReceiptsEnabled: true,
  lastSeenVisibility: "connections",
  courseProgressOptIn: false,
};

export async function ensureAccountProfile(userId: number, fallbackDisplayName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const [existingProfile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!existingProfile) {
    await db.insert(profiles).values({ userId, ...defaultProfile(fallbackDisplayName) });
  }

  const [existingPrivacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1);
  if (!existingPrivacy) {
    await db.insert(privacySettings).values({ userId, ...defaultPrivacy });
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1);
  return { profile: profile as Profile, privacy: privacy as PrivacySettings };
}

export async function touchDeviceSession(userId: number, sessionFingerprint: string, deviceLabel: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existing] = await db
    .select()
    .from(deviceSessions)
    .where(and(eq(deviceSessions.userId, userId), eq(deviceSessions.sessionFingerprint, sessionFingerprint)))
    .limit(1);
  if (existing) {
    await db.update(deviceSessions).set({ lastSeenAt: new Date(), revokedAt: null, deviceLabel }).where(eq(deviceSessions.id, existing.id));
  } else {
    await db.insert(deviceSessions).values({ userId, sessionFingerprint, deviceLabel, lastSeenAt: new Date() });
  }
}

export async function resolveDeviceSession(userId: number, sessionFingerprint: string, deviceLabel: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existing] = await db
    .select()
    .from(deviceSessions)
    .where(and(eq(deviceSessions.userId, userId), eq(deviceSessions.sessionFingerprint, sessionFingerprint)))
    .limit(1);

  if (existing) {
    if (existing.revokedAt) return { sessionId: existing.id, revoked: true };
    await db.update(deviceSessions).set({ lastSeenAt: new Date(), deviceLabel }).where(eq(deviceSessions.id, existing.id));
    return { sessionId: existing.id, revoked: false };
  }

  const result = await db.insert(deviceSessions).values({ userId, sessionFingerprint, deviceLabel, lastSeenAt: new Date() });
  return { sessionId: Number(result[0].insertId), revoked: false };
}

export async function listDeviceSessions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(deviceSessions).where(eq(deviceSessions.userId, userId)).orderBy(desc(deviceSessions.lastSeenAt));
}

export async function revokeDeviceSession(userId: number, sessionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(deviceSessions).set({ revokedAt: new Date() }).where(and(eq(deviceSessions.id, sessionId), eq(deviceSessions.userId, userId)));
  await logAuditEvent(userId, "device_session.revoked", "device_session", String(sessionId), {});
}

export async function updateAccountProfile(userId: number, input: AccountProfileInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(profiles).set(input).where(eq(profiles.userId, userId));
  await logAuditEvent(userId, "profile.updated", "profile", String(userId), { profileVisibility: input.profileVisibility });
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return profile as Profile;
}

export async function updateAccountPrivacy(userId: number, input: AccountPrivacyInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.update(privacySettings).set(input).where(eq(privacySettings.userId, userId));
  await logAuditEvent(userId, "privacy.updated", "privacy", String(userId), { storyAudienceDefault: input.storyAudienceDefault });
  const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1);
  return privacy as PrivacySettings;
}

export async function recordConsent(userId: number, scope: "payment_provider" | "marketing" | "course_progress" | "analytics" | "story_audience", policyVersion: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(consents).values({ userId, scope, policyVersion });
  await logAuditEvent(userId, "consent.granted", "consent", scope, { policyVersion });
}

export async function withdrawConsent(userId: number, scope: "payment_provider" | "marketing" | "course_progress" | "analytics" | "story_audience") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [latest] = await db.select().from(consents).where(and(eq(consents.userId, userId), eq(consents.scope, scope))).orderBy(desc(consents.grantedAt)).limit(1);
  if (latest && !latest.withdrawnAt) {
    await db.update(consents).set({ withdrawnAt: new Date() }).where(eq(consents.id, latest.id));
  }
  await logAuditEvent(userId, "consent.withdrawn", "consent", scope, {});
}

export async function blockAccount(blockerUserId: number, blockedUserId: number) {
  if (blockerUserId === blockedUserId) throw new Error("You cannot block your own account");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(blocks).values({ blockerUserId, blockedUserId }).onDuplicateKeyUpdate({ set: { blockerUserId } });
  await logAuditEvent(blockerUserId, "account.blocked", "account", String(blockedUserId), {});
}

export async function createSafetyReport(input: {
  reporterUserId: number;
  targetDomain: "profile" | "story" | "storefront" | "product" | "course" | "message" | "payment";
  targetId: string;
  reason: "spam" | "impersonation" | "scam" | "harassment" | "unsafe_content" | "other";
  detail?: string;
  evidenceScope: "none" | "selected_item" | "user_submitted";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.insert(reports).values(input);
  await logAuditEvent(input.reporterUserId, "safety.reported", input.targetDomain, input.targetId, { reason: input.reason, evidenceScope: input.evidenceScope });
}

async function logAuditEvent(actorUserId: number | null, action: string, domain: string, targetId: string | null, metadata: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditEvents).values({ actorUserId, action, domain, targetId, metadata: JSON.stringify(metadata) });
}

export async function requireConversationMember(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [member] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.status, "active")))
    .limit(1);
  if (!member) throw new Error("You do not have access to this conversation");
  return member;
}

export async function listConversationsForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db
    .select({
      id: conversations.id,
      kind: conversations.kind,
      title: conversations.title,
      updatedAt: conversations.updatedAt,
      role: conversationMembers.role,
      mutedUntil: conversationMembers.mutedUntil,
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.status, "active")))
    .orderBy(desc(conversations.updatedAt));
}

export async function createConversation(input: { createdByUserId: number; kind: "direct" | "group" | "merchant_support"; title?: string; memberIds: number[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const memberIds = Array.from(new Set([input.createdByUserId, ...input.memberIds]));
  if (input.kind === "direct" && memberIds.length !== 2) throw new Error("A direct conversation needs exactly two members");
  if (input.kind === "group" && memberIds.length < 2) throw new Error("A group needs at least two members");
  const result = await db.insert(conversations).values({ createdByUserId: input.createdByUserId, kind: input.kind, title: input.title?.trim() || null });
  const conversationId = Number(result[0].insertId);
  await db.insert(conversationMembers).values(memberIds.map(userId => ({
    conversationId,
    userId,
    role: userId === input.createdByUserId ? "owner" as const : "member" as const,
  })));
  await logAuditEvent(input.createdByUserId, "conversation.created", "conversation", String(conversationId), { kind: input.kind, memberCount: memberIds.length });
  return { id: conversationId };
}

export async function listConversationMessages(userId: number, conversationId: number) {
  await requireConversationMember(userId, conversationId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  const attachmentRows = rows.length ? await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, rows.map(row => row.id))) : [];
  return rows.map(row => ({ ...row, attachments: attachmentRows.filter(attachment => attachment.messageId === row.id).map(({ storageKey: _storageKey, ...attachment }) => attachment) }));
}

export async function sendConversationMessage(input: { userId: number; conversationId: number; clientMessageId: string; payload: string }) {
  await requireConversationMember(input.userId, input.conversationId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const result = await db
    .insert(messages)
    .values({ conversationId: input.conversationId, senderUserId: input.userId, clientMessageId: input.clientMessageId, payload: input.payload, contentType: "text", status: "sent" })
    .onDuplicateKeyUpdate({ set: { payload: input.payload, status: "sent" } });
  const messageId = Number(result[0].insertId);
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
  return { id: messageId, status: "sent" as const };
}

export async function sendMessageAttachment(input: { userId: number; conversationId: number; clientMessageId: string; fileName: string; mimeType: string; base64Data: string; byteSize: number }) {
  await requireConversationMember(input.userId, input.conversationId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const bytes = Buffer.from(input.base64Data, "base64");
  if (bytes.byteLength !== input.byteSize || bytes.byteLength > 8 * 1024 * 1024) throw new Error("Attachment size could not be verified");
  // The declared type is client-supplied; check it against the actual bytes so
  // a mislabelled file cannot be stored and later served under a type it isn't.
  if (!bytesMatchMimeType(bytes, input.mimeType)) throw new Error("Attachment contents do not match the declared file type");
  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
  const upload = await storagePut(`private/conversations/${input.conversationId}/${input.userId}/${safeFileName}`, bytes, input.mimeType);
  const result = await db.insert(messages).values({ conversationId: input.conversationId, senderUserId: input.userId, clientMessageId: input.clientMessageId, payload: `Attachment: ${safeFileName}`, contentType: "attachment", status: "sent" });
  const messageId = Number(result[0].insertId);
  await db.insert(messageAttachments).values({ messageId, storageKey: upload.key, mimeType: input.mimeType, fileName: safeFileName, byteSize: bytes.byteLength });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, input.conversationId));
  await logAuditEvent(input.userId, "message.attachment_uploaded", "message", String(messageId), { mimeType: input.mimeType, byteSize: bytes.byteLength });
  return { id: messageId, status: "sent" as const };
}

export async function getMessageAttachmentDownloadUrl(userId: number, attachmentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [attachment] = await db.select().from(messageAttachments).where(eq(messageAttachments.id, attachmentId)).limit(1);
  if (!attachment) throw new Error("Attachment not found");
  const [message] = await db.select().from(messages).where(eq(messages.id, attachment.messageId)).limit(1);
  if (!message) throw new Error("Message not found");
  await requireConversationMember(userId, message.conversationId);
  const url = await storageGetSignedUrl(attachment.storageKey);
  return { url, fileName: attachment.fileName, mimeType: attachment.mimeType };
}

export async function recordMessageDelivery(userId: number, messageId: number, status: "delivered" | "read") {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!message) throw new Error("Message not found");
  await requireConversationMember(userId, message.conversationId);
  if (message.senderUserId === userId) throw new Error("A sender cannot acknowledge their own delivery");
  const [recipientPrivacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1);
  const resolvedStatus = resolveReceiptStatus({ requestedStatus: status, recipientAllowsReadReceipts: recipientPrivacy?.readReceiptsEnabled ?? true });
  await db.insert(messageDeliveryReceipts).values({ messageId, recipientUserId: userId, status: resolvedStatus }).onDuplicateKeyUpdate({ set: { status: resolvedStatus, recordedAt: new Date() } });
  if (resolvedStatus === "read") await db.update(messages).set({ status: "read" }).where(eq(messages.id, messageId));
  else await db.update(messages).set({ status: "delivered" }).where(eq(messages.id, messageId));
}

async function withStoryMedia<T extends { id: number }>(storyRows: T[]) {
  if (!storyRows.length) {
    return storyRows.map(row => ({
      ...row,
      media: [] as Array<{ id: number; url: string | null; mimeType: string; type: "image" | "video" }>,
      primaryMediaUrl: null as string | null,
      primaryMediaType: null as "image" | "video" | null,
    }));
  }
  const db = await getDb();
  const mediaRows = await db.select().from(storyMedia).where(inArray(storyMedia.storyId, storyRows.map(row => row.id)));
  const grouped = new Map<number, typeof mediaRows>();
  for (const media of mediaRows) {
    const existing = grouped.get(media.storyId);
    if (existing) existing.push(media);
    else grouped.set(media.storyId, [media]);
  }
  return Promise.all(storyRows.map(async row => {
    const media = await Promise.all((grouped.get(row.id) ?? []).map(async item => ({
      id: item.id,
      url: await signedUrlOrNull(item.storageKey),
      mimeType: item.mimeType,
      type: item.mimeType.startsWith("video/") ? "video" as const : "image" as const,
    })));
    return {
      ...row,
      media,
      primaryMediaUrl: media[0]?.url ?? null,
      primaryMediaType: media[0]?.type ?? null,
    };
  }));
}

type StoryPublishInput = {
  authorUserId: number;
  textBody?: string | null;
  audience: "public" | "custom" | "private";
  customAudienceUserIds?: number[];
  saveToMemories?: boolean;
  storefrontId?: number | null;
  productName?: string | null;
  productDescription?: string | null;
  productPriceMinor?: number | null;
  productCurrencyCode?: string | null;
};

async function createStoryRecord(input: StoryPublishInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const audienceUserIds = Array.from(new Set((input.customAudienceUserIds ?? []).filter(userId => userId !== input.authorUserId)));
  if (input.audience === "custom" && audienceUserIds.length === 0) throw new Error("Select at least one Savanna account for a custom Story");
  if (input.storefrontId) {
    await requireStorefrontOwner(input.authorUserId, input.storefrontId);
    if (!input.saveToMemories) throw new Error("Business product stories must be saved as Memories");
    if (input.audience !== "public") throw new Error("Business Memories must be public");
    if (!input.productName?.trim()) throw new Error("Add a product name for this Memory");
    if (!input.productDescription?.trim()) throw new Error("Add a short product description for this Memory");
    if (!input.productPriceMinor || input.productPriceMinor <= 0) throw new Error("Add a valid product price for this Memory");
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const storyId = await db.transaction(async tx => {
    const result = await tx.insert(stories).values({
      authorUserId: input.authorUserId,
      textBody: input.textBody?.trim() || null,
      audience: input.audience,
      isMemory: Boolean(input.saveToMemories),
      storefrontId: input.storefrontId ?? null,
      productName: input.productName?.trim() || null,
      productDescription: input.productDescription?.trim() || null,
      productPriceMinor: input.productPriceMinor ?? null,
      productCurrencyCode: input.productCurrencyCode?.trim().toUpperCase() || null,
      expiresAt,
    });
    const id = Number(result[0].insertId);
    if (input.audience === "custom") await tx.insert(storyAudienceMembers).values(audienceUserIds.map(userId => ({ storyId: id, userId })));
    return id;
  });
  return { storyId, expiresAt };
}

export async function listStoriesForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  const [viewerProfile] = await db.select({ city: profiles.city, countryCode: profiles.countryCode }).from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const candidates = await db
    .select({
      story: stories,
      authorName: profiles.displayName,
      authorCity: profiles.city,
      authorCountryCode: profiles.countryCode,
    })
    .from(stories)
    .leftJoin(profiles, eq(profiles.userId, stories.authorUserId))
    .where(and(isNull(stories.deletedAt), gt(stories.expiresAt, now)))
    .orderBy(desc(stories.publishedAt));
  const memberships = await db.select().from(storyAudienceMembers).where(eq(storyAudienceMembers.userId, userId));
  const allowedCustomStoryIds = new Set(memberships.map(membership => membership.storyId));
  const visibleStories = candidates
    .filter(({ story }) => canViewStory({ isAuthor: story.authorUserId === userId, isAudienceMember: allowedCustomStoryIds.has(story.id), audience: story.audience }))
    .map(({ story, authorName, authorCity, authorCountryCode }) => ({
      ...story,
      authorName: authorName?.trim() || "Savanna member",
      discovery: createDiscoveryBadge({
        surface: "stories",
        viewerUserId: userId,
        ownerUserId: story.authorUserId,
        viewerCity: viewerProfile?.city,
        viewerCountryCode: viewerProfile?.countryCode,
        itemCity: authorCity,
        itemCountryCode: authorCountryCode,
        isProductMemory: Boolean(story.storefrontId && story.isMemory),
        title: story.productName ?? story.textBody,
        description: story.productDescription,
      }),
    }))
    .sort((left, right) => right.discovery.score - left.discovery.score);
  return withStoryMedia(visibleStories);
}

export async function publishTextStory(input: StoryPublishInput & { textBody: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const { storyId, expiresAt } = await createStoryRecord(input);
  await logAuditEvent(input.authorUserId, "story.published", "story", String(storyId), { audience: input.audience, isMemory: Boolean(input.saveToMemories), storefrontId: input.storefrontId ?? null, expiresAt: expiresAt.toISOString() });
  return { id: storyId, expiresAt };
}

export async function publishMediaStory(input: StoryPublishInput & { fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp" | "video/mp4"; base64Data: string; byteSize: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const isImage = productImageTypes.has(input.mimeType);
  const isVideo = productVideoTypes.has(input.mimeType);
  if (!isImage && !isVideo) throw new Error("Stories support JPG, PNG, WebP, or MP4 media");
  const bytes = Buffer.from(input.base64Data, "base64");
  const maxSize = isVideo ? 20 * 1024 * 1024 : 6 * 1024 * 1024;
  if (bytes.byteLength !== input.byteSize || bytes.byteLength > maxSize) throw new Error("Story media size could not be verified");
  if (!bytesMatchMimeType(bytes, input.mimeType)) throw new Error("Story media contents do not match the selected file type");
  const { storyId, expiresAt } = await createStoryRecord(input);
  const safeFileName = safeStorageFileName(input.fileName, isVideo ? "story-video.mp4" : "story-image");
  const upload = await storagePut(`private/stories/${storyId}/${input.authorUserId}/${safeFileName}`, bytes, input.mimeType);
  await db.insert(storyMedia).values({ storyId, storageKey: upload.key, mimeType: input.mimeType });
  await logAuditEvent(input.authorUserId, "story.media_published", "story", String(storyId), { audience: input.audience, isMemory: Boolean(input.saveToMemories), storefrontId: input.storefrontId ?? null, mimeType: input.mimeType, byteSize: bytes.byteLength, expiresAt: expiresAt.toISOString() });
  return { id: storyId, expiresAt, url: upload.url };
}

export async function recordStoryView(userId: number, storyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story || story.deletedAt || (!story.isMemory && story.expiresAt <= new Date())) throw new Error("Story is unavailable");
  const [membership] = await db.select().from(storyAudienceMembers).where(and(eq(storyAudienceMembers.storyId, story.id), eq(storyAudienceMembers.userId, userId))).limit(1);
  if (!canViewStory({ isAuthor: story.authorUserId === userId, isAudienceMember: Boolean(membership), audience: story.audience })) throw new Error("You do not have access to this Story");
  await db.insert(storyViews).values({ storyId, viewerUserId: userId }).onDuplicateKeyUpdate({ set: { viewedAt: new Date() } });
}

export async function reactToStory(userId: number, storyId: number, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await recordStoryView(userId, storyId);
  await db.insert(storyReactions).values({ storyId, userId, emoji }).onDuplicateKeyUpdate({ set: { emoji } });
}

export async function replyToStory(userId: number, storyId: number, payload: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await recordStoryView(userId, storyId);
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story) throw new Error("Story is unavailable");
  if (story.authorUserId === userId) throw new Error("You cannot reply to your own Story");

  const directConversations = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.userId, userId), eq(conversationMembers.status, "active"), eq(conversations.kind, "direct")));
  const candidateIds = directConversations.map(item => item.conversationId);
  const [existingDirect] = candidateIds.length
    ? await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(and(inArray(conversationMembers.conversationId, candidateIds), eq(conversationMembers.userId, story.authorUserId), eq(conversationMembers.status, "active")))
      .limit(1)
    : [];
  const conversationId = existingDirect?.conversationId ?? (await createConversation({ createdByUserId: userId, kind: "direct", memberIds: [story.authorUserId] })).id;
  await sendConversationMessage({ userId, conversationId, clientMessageId: crypto.randomUUID(), payload: `Replied to your Story: ${payload}` });
  return { conversationId };
}

type StorefrontInput = {
  name: string;
  bio?: string | null;
  category?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  visibility: "draft" | "public" | "paused";
};

type ProductInput = {
  title: string;
  description?: string | null;
  category?: string | null;
  currencyCode: string;
  priceMinor: number;
  inventoryQuantity?: number | null;
  status: "draft" | "active" | "archived" | "sold_out";
};

type CommerceUploadInput = {
  fileName: string;
  mimeType: string;
  base64Data: string;
  byteSize: number;
};

const productImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const productVideoTypes = new Set(["video/mp4"]);

function safeStorageFileName(fileName: string, fallback: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || fallback;
}

async function signedUrlOrNull(storageKey: string | null | undefined) {
  if (!storageKey) return null;
  try {
    return await storageGetSignedUrl(storageKey);
  } catch (error) {
    console.warn("[Storage] Could not sign media URL", error);
    return null;
  }
}

async function withStorefrontCover<T extends { coverKey?: string | null }>(storefront: T) {
  return { ...storefront, coverUrl: await signedUrlOrNull(storefront.coverKey) };
}

async function withProductMedia<T extends { id: number }>(rows: T[]) {
  if (!rows.length) return rows.map(row => ({ ...row, media: [] as Array<{ id: number; url: string | null; mimeType: string; sortOrder: number; type: "image" | "video" }>, primaryImageUrl: null as string | null, videoUrl: null as string | null }));
  const db = await getDb();
  const mediaRows = await db
    .select()
    .from(productMedia)
    .where(inArray(productMedia.productId, rows.map(row => row.id)));
  const grouped = new Map<number, typeof mediaRows>();
  for (const media of mediaRows) {
    const existing = grouped.get(media.productId);
    if (existing) existing.push(media);
    else grouped.set(media.productId, [media]);
  }
  return Promise.all(rows.map(async row => {
    const media = await Promise.all((grouped.get(row.id) ?? [])
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(async item => ({
        id: item.id,
        url: await signedUrlOrNull(item.storageKey),
        mimeType: item.mimeType,
        sortOrder: item.sortOrder,
        type: item.mimeType.startsWith("video/") ? "video" as const : "image" as const,
      })));
    return {
      ...row,
      media,
      primaryImageUrl: media.find(item => item.type === "image")?.url ?? null,
      videoUrl: media.find(item => item.type === "video")?.url ?? null,
    };
  }));
}

function slugify(value: string) {
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 62);
  return normalized || "savanna-shop";
}

async function requireStorefrontOwner(userId: number, storefrontId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [storefront] = await db.select().from(storefronts).where(and(eq(storefronts.id, storefrontId), eq(storefronts.ownerUserId, userId))).limit(1);
  if (!storefront) throw new Error("You do not have permission to manage this storefront");
  return storefront;
}

export async function getMyStorefront(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [storefront] = await db.select().from(storefronts).where(eq(storefronts.ownerUserId, userId)).limit(1);
  const [onboarding] = await db.select().from(merchantOnboarding).where(eq(merchantOnboarding.userId, userId)).limit(1);
  const catalog = storefront ? await db.select().from(products).where(eq(products.storefrontId, storefront.id)).orderBy(desc(products.createdAt)) : [];
  const [settlement] = storefront ? await db.select().from(merchantSettlementProfiles).where(eq(merchantSettlementProfiles.storefrontId, storefront.id)).limit(1) : [];
  const safeSettlement = settlement ? { countryCode: settlement.countryCode, providerCode: settlement.providerCode, recipientAlias: settlement.recipientAlias, status: settlement.status } : null;
  return { storefront: storefront ? await withStorefrontCover(storefront) : null, onboarding: onboarding ?? null, settlement: safeSettlement, products: await withProductMedia(catalog) };
}

export async function getPublicProfile(viewerUserId: number | null, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile) throw new Error("Profile unavailable");
  if (profile.userId !== viewerUserId && profile.profileVisibility !== "public") throw new Error("This profile is not public");
  const avatarUrl = await signedUrlOrNull(profile.avatarKey);
  const [storefront] = await db.select().from(storefronts).where(eq(storefronts.ownerUserId, userId)).limit(1);
  const business = storefront && (storefront.visibility === "public" || storefront.ownerUserId === viewerUserId)
    ? await withStorefrontCover(storefront)
    : null;
  const storyFilters = [
    eq(stories.authorUserId, userId),
    isNull(stories.storefrontId),
    isNull(stories.deletedAt),
    gt(stories.expiresAt, new Date()),
  ];
  if (profile.userId !== viewerUserId) storyFilters.push(eq(stories.audience, "public"));
  const profileStoryRows = await db
    .select({
      id: stories.id,
      authorUserId: stories.authorUserId,
      textBody: stories.textBody,
      audience: stories.audience,
      isMemory: stories.isMemory,
      storefrontId: stories.storefrontId,
      productName: stories.productName,
      productDescription: stories.productDescription,
      productPriceMinor: stories.productPriceMinor,
      productCurrencyCode: stories.productCurrencyCode,
      publishedAt: stories.publishedAt,
      expiresAt: stories.expiresAt,
      createdAt: stories.createdAt,
      deletedAt: stories.deletedAt,
    })
    .from(stories)
    .where(and(...storyFilters))
    .orderBy(desc(stories.publishedAt))
    .limit(12);
  const memoryFilters = [
    eq(stories.authorUserId, userId),
    eq(stories.isMemory, true),
    isNull(stories.storefrontId),
    isNull(stories.deletedAt),
  ];
  if (profile.userId !== viewerUserId) memoryFilters.push(eq(stories.audience, "public"));
  const profileMemoryRows = await db
    .select({
      id: stories.id,
      authorUserId: stories.authorUserId,
      textBody: stories.textBody,
      audience: stories.audience,
      isMemory: stories.isMemory,
      storefrontId: stories.storefrontId,
      productName: stories.productName,
      productDescription: stories.productDescription,
      productPriceMinor: stories.productPriceMinor,
      productCurrencyCode: stories.productCurrencyCode,
      publishedAt: stories.publishedAt,
      expiresAt: stories.expiresAt,
      createdAt: stories.createdAt,
      deletedAt: stories.deletedAt,
    })
    .from(stories)
    .where(and(...memoryFilters))
    .orderBy(desc(stories.publishedAt))
    .limit(24);
  const profileStories = await withStoryMedia(profileStoryRows);
  const profileMemories = await withStoryMedia(profileMemoryRows);
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    bio: profile.bio,
    countryCode: profile.countryCode,
    city: profile.city,
    profileVisibility: profile.profileVisibility,
    avatarUrl,
    business: business
      ? {
        id: business.id,
        slug: business.slug,
        name: business.name,
        category: business.category,
        coverUrl: business.coverUrl,
        visibility: business.visibility,
      }
      : null,
    stories: profileStories,
    memories: profileMemories,
  };
}

/**
 * Derives the key used to encrypt merchant settlement references at rest.
 *
 * This must NOT be the session secret. Rotating `JWT_SECRET` is a routine
 * security operation — you do it after any suspicion of compromise — but it
 * also has to invalidate every live session. Tying settlement encryption to the
 * same value means that operation silently destroys the ability to decrypt
 * stored payout details, so the two can never be rotated independently.
 */
function settlementKey(): Buffer {
  const dedicated = process.env.SETTLEMENT_ENCRYPTION_KEY;
  if (dedicated) return createHash("sha256").update(dedicated).digest();

  // Development convenience only. In production a missing key is a hard error
  // rather than a silent fallback, so the coupling cannot creep back in.
  if (ENV.isProduction) {
    throw new Error(
      "SETTLEMENT_ENCRYPTION_KEY is required in production. " +
        "Generate one with `openssl rand -base64 48`."
    );
  }

  if (!ENV.cookieSecret) throw new Error("Server encryption configuration is unavailable");
  console.warn(
    "[Settlement] SETTLEMENT_ENCRYPTION_KEY is unset; falling back to JWT_SECRET. " +
      "Set a dedicated key before deploying."
  );
  return createHash("sha256").update(ENV.cookieSecret).digest();
}

function encryptSettlementReference(value: string) {
  const key = settlementKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export async function saveMerchantSettlementProfile(userId: number, input: { storefrontId: number; countryCode: string; providerCode: string; recipientAlias: string; recipientReference: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await requireStorefrontOwner(userId, input.storefrontId);
  const encryptedRecipientReference = encryptSettlementReference(input.recipientReference);
  await db.insert(merchantSettlementProfiles).values({ storefrontId: input.storefrontId, countryCode: input.countryCode, providerCode: input.providerCode, recipientAlias: input.recipientAlias, encryptedRecipientReference, status: "pending" }).onDuplicateKeyUpdate({ set: { countryCode: input.countryCode, providerCode: input.providerCode, recipientAlias: input.recipientAlias, encryptedRecipientReference, status: "pending" } });
  await db.update(merchantOnboarding).set({ settlementComplete: true, status: "submitted" }).where(eq(merchantOnboarding.storefrontId, input.storefrontId));
  await logAuditEvent(userId, "merchant_settlement.submitted", "storefront", String(input.storefrontId), { countryCode: input.countryCode, providerCode: input.providerCode });
  return { success: true, status: "pending" as const };
}

export async function createStorefront(userId: number, input: StorefrontInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existing] = await db.select().from(storefronts).where(eq(storefronts.ownerUserId, userId)).limit(1);
  if (existing) throw new Error("You already have a Savanna storefront");
  const baseSlug = slugify(input.name);
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await db.insert(storefronts).values({ ownerUserId: userId, slug, ...input });
  const storefrontId = Number(result[0].insertId);
  await db.insert(merchantOnboarding).values({ userId, storefrontId, profileComplete: true, status: "in_progress" });
  await logAuditEvent(userId, "storefront.created", "storefront", String(storefrontId), { visibility: input.visibility });
  return { id: storefrontId, slug };
}

export async function updateStorefront(userId: number, storefrontId: number, input: StorefrontInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await requireStorefrontOwner(userId, storefrontId);
  await db.update(storefronts).set(input).where(eq(storefronts.id, storefrontId));
  await db.update(merchantOnboarding).set({ profileComplete: true, status: "in_progress" }).where(eq(merchantOnboarding.storefrontId, storefrontId));
  return { success: true } as const;
}

export async function uploadStorefrontCover(userId: number, input: CommerceUploadInput & { storefrontId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await requireStorefrontOwner(userId, input.storefrontId);
  if (!productImageTypes.has(input.mimeType)) throw new Error("Shop banner must be a JPG, PNG, or WebP image");
  const bytes = Buffer.from(input.base64Data, "base64");
  if (bytes.byteLength !== input.byteSize || bytes.byteLength > 6 * 1024 * 1024) throw new Error("Shop banner size could not be verified");
  if (!bytesMatchMimeType(bytes, input.mimeType)) throw new Error("Shop banner contents do not match the selected image type");
  const safeFileName = safeStorageFileName(input.fileName, "shop-banner");
  const upload = await storagePut(`public/storefronts/${input.storefrontId}/banner/${safeFileName}`, bytes, input.mimeType);
  await db.update(storefronts).set({ coverKey: upload.key }).where(eq(storefronts.id, input.storefrontId));
  await logAuditEvent(userId, "storefront.banner_uploaded", "storefront", String(input.storefrontId), { mimeType: input.mimeType, byteSize: bytes.byteLength });
  return { url: upload.url };
}

export async function submitStorefrontVerification(userId: number, storefrontId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const storefront = await requireStorefrontOwner(userId, storefrontId);
  if (storefront.verificationState === "verified") throw new Error("This storefront is already verified");
  await db.update(storefronts).set({ verificationState: "pending" }).where(eq(storefronts.id, storefrontId));
  await logAuditEvent(userId, "storefront.verification_submitted", "storefront", String(storefrontId), {});
  return { status: "pending" as const };
}

export async function reviewStorefrontVerification(adminUserId: number, storefrontId: number, decision: "verified" | "rejected", note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
  if (!storefront) throw new Error("Storefront unavailable");
  await db.update(storefronts).set({ verificationState: decision }).where(eq(storefronts.id, storefrontId));
  await logAuditEvent(adminUserId, "storefront.verification_reviewed", "storefront", String(storefrontId), { decision, note: note?.slice(0, 500) ?? null });
  return { status: decision };
}

export async function createProduct(userId: number, storefrontId: number, input: ProductInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await requireStorefrontOwner(userId, storefrontId);
  const result = await db.insert(products).values({ storefrontId, ...input });
  const productId = Number(result[0].insertId);
  await db.update(merchantOnboarding).set({ catalogComplete: true, status: "in_progress" }).where(eq(merchantOnboarding.storefrontId, storefrontId));
  await logAuditEvent(userId, "product.created", "product", String(productId), { status: input.status, priceMinor: input.priceMinor, currencyCode: input.currencyCode });
  return { id: productId };
}

export async function uploadProductMedia(userId: number, input: CommerceUploadInput & { productId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [product] = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product) throw new Error("Product unavailable");
  await requireStorefrontOwner(userId, product.storefrontId);

  const isImage = productImageTypes.has(input.mimeType);
  const isVideo = productVideoTypes.has(input.mimeType);
  if (!isImage && !isVideo) throw new Error("Product media must be a JPG, PNG, WebP, or MP4 file");

  const existing = await db.select().from(productMedia).where(eq(productMedia.productId, input.productId));
  const imageCount = existing.filter(item => item.mimeType.startsWith("image/")).length;
  const videoCount = existing.filter(item => item.mimeType.startsWith("video/")).length;
  if (isImage && imageCount >= 5) throw new Error("Each product can have up to 5 images");
  if (isVideo && videoCount >= 1) throw new Error("Each product can have 1 product video");

  const bytes = Buffer.from(input.base64Data, "base64");
  const maxSize = isVideo ? 20 * 1024 * 1024 : 6 * 1024 * 1024;
  if (bytes.byteLength !== input.byteSize || bytes.byteLength > maxSize) throw new Error("Product media size could not be verified");
  if (!bytesMatchMimeType(bytes, input.mimeType)) throw new Error("Product media contents do not match the selected file type");

  const safeFileName = safeStorageFileName(input.fileName, isVideo ? "product-video.mp4" : "product-image");
  const upload = await storagePut(`public/storefronts/${product.storefrontId}/products/${input.productId}/${safeFileName}`, bytes, input.mimeType);
  const result = await db.insert(productMedia).values({ productId: input.productId, storageKey: upload.key, mimeType: input.mimeType, sortOrder: existing.length });
  await logAuditEvent(userId, "product.media_uploaded", "product", String(input.productId), { mimeType: input.mimeType, byteSize: bytes.byteLength });
  return { id: Number(result[0].insertId), url: upload.url };
}

export async function listPublicStorefronts(query?: string, userId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [viewerProfile] = userId ? await db.select({ city: profiles.city, countryCode: profiles.countryCode }).from(profiles).where(eq(profiles.userId, userId)).limit(1) : [];
  const all = await db
    .select({
      storefront: storefronts,
      ownerCity: profiles.city,
      ownerCountryCode: profiles.countryCode,
    })
    .from(storefronts)
    .leftJoin(profiles, eq(profiles.userId, storefronts.ownerUserId))
    .where(eq(storefronts.visibility, "public"))
    .orderBy(desc(storefronts.updatedAt));
  const needle = query?.trim().toLowerCase();
  const filtered = needle ? all.filter(({ storefront }) => [storefront.name, storefront.category, storefront.bio].some(value => value?.toLowerCase().includes(needle))) : all;
  const ranked = await Promise.all(filtered.map(async ({ storefront, ownerCity, ownerCountryCode }) => ({
    ...(await withStorefrontCover(storefront)),
    discovery: createDiscoveryBadge({
      surface: "shops",
      viewerUserId: userId,
      ownerUserId: storefront.ownerUserId,
      viewerCity: viewerProfile?.city,
      viewerCountryCode: viewerProfile?.countryCode,
      itemCity: ownerCity,
      itemCountryCode: ownerCountryCode,
      title: storefront.name,
      description: storefront.bio,
      category: storefront.category,
      query,
    }),
  })));
  return ranked.sort((left, right) => right.discovery.score - left.discovery.score);
}

export async function listPublicProducts(query?: string, userId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [viewerProfile] = userId ? await db.select({ city: profiles.city, countryCode: profiles.countryCode }).from(profiles).where(eq(profiles.userId, userId)).limit(1) : [];
  const all = await db
    .select({
      id: products.id,
      title: products.title,
      description: products.description,
      category: products.category,
      currencyCode: products.currencyCode,
      priceMinor: products.priceMinor,
      inventoryQuantity: products.inventoryQuantity,
      createdAt: products.createdAt,
      storefrontName: storefronts.name,
      storefrontSlug: storefronts.slug,
      storefrontOwnerUserId: storefronts.ownerUserId,
      storefrontCategory: storefronts.category,
      ownerCity: profiles.city,
      ownerCountryCode: profiles.countryCode,
    })
    .from(products)
    .innerJoin(storefronts, eq(storefronts.id, products.storefrontId))
    .leftJoin(profiles, eq(profiles.userId, storefronts.ownerUserId))
    .where(and(eq(products.status, "active"), eq(storefronts.visibility, "public")))
    .orderBy(desc(products.createdAt));
  const needle = query?.trim().toLowerCase();
  const filtered = needle ? all.filter(product => [product.title, product.description, product.category, product.storefrontName].some(value => value?.toLowerCase().includes(needle))) : all;
  const ranked = filtered.map(product => ({
    ...product,
    discovery: createDiscoveryBadge({
      surface: "shops",
      viewerUserId: userId,
      ownerUserId: product.storefrontOwnerUserId,
      viewerCity: viewerProfile?.city,
      viewerCountryCode: viewerProfile?.countryCode,
      itemCity: product.ownerCity,
      itemCountryCode: product.ownerCountryCode,
      title: product.title,
      description: product.description,
      category: product.category ?? product.storefrontCategory,
      query,
    }),
  })).sort((left, right) => right.discovery.score - left.discovery.score);
  return withProductMedia(ranked);
}

export async function listPublicProductMemories(query?: string, userId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [viewerProfile] = userId ? await db.select({ city: profiles.city, countryCode: profiles.countryCode }).from(profiles).where(eq(profiles.userId, userId)).limit(1) : [];
  const all = await db
    .select({
      id: stories.id,
      authorUserId: stories.authorUserId,
      textBody: stories.textBody,
      audience: stories.audience,
      isMemory: stories.isMemory,
      storefrontId: stories.storefrontId,
      productName: stories.productName,
      productDescription: stories.productDescription,
      productPriceMinor: stories.productPriceMinor,
      productCurrencyCode: stories.productCurrencyCode,
      publishedAt: stories.publishedAt,
      expiresAt: stories.expiresAt,
      createdAt: stories.createdAt,
      deletedAt: stories.deletedAt,
      storefrontName: storefronts.name,
      storefrontSlug: storefronts.slug,
      storefrontOwnerUserId: storefronts.ownerUserId,
      storefrontCategory: storefronts.category,
      ownerCity: profiles.city,
      ownerCountryCode: profiles.countryCode,
    })
    .from(stories)
    .innerJoin(storefronts, eq(storefronts.id, stories.storefrontId))
    .leftJoin(profiles, eq(profiles.userId, storefronts.ownerUserId))
    .where(and(eq(stories.isMemory, true), eq(stories.audience, "public"), isNull(stories.deletedAt), eq(storefronts.visibility, "public")))
    .orderBy(desc(stories.publishedAt))
    .limit(30);
  const needle = query?.trim().toLowerCase();
  const filtered = needle ? all.filter(memory => [memory.productName, memory.productDescription, memory.textBody, memory.storefrontName, memory.storefrontCategory].some(value => value?.toLowerCase().includes(needle))) : all;
  const ranked = filtered.map(memory => ({
    ...memory,
    authorName: memory.storefrontName,
    discovery: createDiscoveryBadge({
      surface: "shops",
      viewerUserId: userId,
      ownerUserId: memory.storefrontOwnerUserId,
      viewerCity: viewerProfile?.city,
      viewerCountryCode: viewerProfile?.countryCode,
      itemCity: memory.ownerCity,
      itemCountryCode: memory.ownerCountryCode,
      isProductMemory: true,
      title: memory.productName,
      description: memory.productDescription ?? memory.textBody,
      category: memory.storefrontCategory,
      query,
    }),
  })).sort((left, right) => right.discovery.score - left.discovery.score);
  return withStoryMedia(ranked);
}

export async function getStorefrontBySlug(userId: number | null, slug: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [storefront] = await db.select().from(storefronts).where(eq(storefronts.slug, slug)).limit(1);
  if (!storefront || (storefront.visibility !== "public" && storefront.ownerUserId !== userId)) throw new Error("Storefront unavailable");
  const catalog = await db.select().from(products).where(and(eq(products.storefrontId, storefront.id), userId === storefront.ownerUserId ? undefined : eq(products.status, "active"))).orderBy(desc(products.createdAt));
  const memoryFilters = [
    eq(stories.storefrontId, storefront.id),
    eq(stories.isMemory, true),
    isNull(stories.deletedAt),
  ];
  if (userId !== storefront.ownerUserId) memoryFilters.push(eq(stories.audience, "public"));
  const memoryRows = await db
    .select({
      id: stories.id,
      authorUserId: stories.authorUserId,
      textBody: stories.textBody,
      audience: stories.audience,
      isMemory: stories.isMemory,
      storefrontId: stories.storefrontId,
      productName: stories.productName,
      productDescription: stories.productDescription,
      productPriceMinor: stories.productPriceMinor,
      productCurrencyCode: stories.productCurrencyCode,
      publishedAt: stories.publishedAt,
      expiresAt: stories.expiresAt,
      createdAt: stories.createdAt,
      deletedAt: stories.deletedAt,
    })
    .from(stories)
    .where(and(...memoryFilters))
    .orderBy(desc(stories.publishedAt));
  return { storefront: await withStorefrontCover(storefront), products: await withProductMedia(catalog), memories: await withStoryMedia(memoryRows) };
}

export async function createOrder(userId: number, items: Array<{ productId: number; quantity: number }>, buyerNote?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  if (!items.length) throw new Error("Your order needs at least one item");
  const productRows = await db.select().from(products).where(inArray(products.id, items.map(item => item.productId)));
  if (productRows.length !== items.length) throw new Error("One or more products are unavailable");
  const storefrontId = productRows[0]?.storefrontId;
  if (!storefrontId || productRows.some(product => product.storefrontId !== storefrontId || product.status !== "active")) throw new Error("An order can only contain active products from one storefront");
  if (productRows.some(product => product.currencyCode !== productRows[0]?.currencyCode)) throw new Error("Products must have the same currency");
  const subtotalMinor = productRows.reduce((total, product) => total + product.priceMinor * (items.find(item => item.productId === product.id)?.quantity ?? 0), 0);
  const feeMinor = 0;
  const reference = `SV-${crypto.randomUUID().split("-")[0]?.toUpperCase()}`;
  const orderId = await db.transaction(async tx => {
    const result = await tx.insert(orders).values({ orderReference: reference, buyerUserId: userId, storefrontId, currencyCode: productRows[0]?.currencyCode ?? "", subtotalMinor, feeMinor, totalMinor: subtotalMinor + feeMinor, buyerNote: buyerNote?.trim() || null });
    const id = Number(result[0].insertId);
    await tx.insert(orderItems).values(productRows.map(product => ({ orderId: id, productId: product.id, productTitleSnapshot: product.title, unitPriceMinor: product.priceMinor, quantity: items.find(item => item.productId === product.id)?.quantity ?? 1 })));
    await tx.insert(orderStatusEvents).values({ orderId: id, actorUserId: userId, status: "awaiting_payment", note: "Order created" });
    return id;
  });
  await logAuditEvent(userId, "order.created", "order", String(orderId), { reference, totalMinor: subtotalMinor + feeMinor });
  return { id: orderId, reference };
}

export async function listOrdersForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(orders).where(eq(orders.buyerUserId, userId)).orderBy(desc(orders.createdAt));
}

export async function listOrdersForMerchant(userId: number, storefrontId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await requireStorefrontOwner(userId, storefrontId);
  return db.select().from(orders).where(eq(orders.storefrontId, storefrontId)).orderBy(desc(orders.createdAt));
}

export async function updateMerchantOrderStatus(userId: number, orderId: number, status: "accepted" | "preparing" | "ready" | "completed" | "cancelled", note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Order not found");
  await requireStorefrontOwner(userId, order.storefrontId);
  if (!canMerchantAdvanceOrder(order.status)) throw new Error("This order cannot be updated before payment confirmation");
  await db.update(orders).set({ status }).where(eq(orders.id, orderId));
  await db.insert(orderStatusEvents).values({ orderId, actorUserId: userId, status, note: note?.trim() || null });
  return { success: true } as const;
}

export async function createMerchantSupportConversation(buyerUserId: number, storefrontId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [publicStorefront] = await db.select().from(storefronts).where(eq(storefronts.id, storefrontId)).limit(1);
  if (!publicStorefront) throw new Error("Storefront unavailable");
  return createConversation({ createdByUserId: buyerUserId, kind: "merchant_support", title: `Support: ${publicStorefront.name}`, memberIds: [publicStorefront.ownerUserId] });
}

type CourseInput = {
  title: string;
  description?: string | null;
  category?: string | null;
  currencyCode: string;
  priceMinor: number;
  visibility: "draft" | "public" | "paused";
  storefrontId?: number | null;
};

export async function listPublicCourses(query?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const all = await db.select().from(courses).where(eq(courses.visibility, "public")).orderBy(desc(courses.updatedAt));
  const needle = query?.trim().toLowerCase();
  return needle ? all.filter(course => [course.title, course.category, course.description].some(value => value?.toLowerCase().includes(needle))) : all;
}

export async function listPublicPreviewLessons(query?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const all = await db
    .select({
      id: courseLessons.id,
      title: courseLessons.title,
      summary: courseLessons.summary,
      sortOrder: courseLessons.sortOrder,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      courseCategory: courses.category,
    })
    .from(courseLessons)
    .innerJoin(courses, eq(courses.id, courseLessons.courseId))
    .where(and(eq(courses.visibility, "public"), eq(courseLessons.isPreview, true)))
    .orderBy(desc(courses.updatedAt), courseLessons.sortOrder);
  const needle = query?.trim().toLowerCase();
  return needle ? all.filter(lesson => [lesson.title, lesson.summary, lesson.courseTitle, lesson.courseCategory].some(value => value?.toLowerCase().includes(needle))) : all;
}

export async function getMyCourses(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(courses).where(eq(courses.creatorUserId, userId)).orderBy(desc(courses.updatedAt));
}

export async function createCourse(userId: number, input: CourseInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  if (input.storefrontId) await requireStorefrontOwner(userId, input.storefrontId);
  const slug = `${slugify(input.title)}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await db.insert(courses).values({ creatorUserId: userId, slug, ...input });
  const courseId = Number(result[0].insertId);
  await logAuditEvent(userId, "course.created", "course", String(courseId), { visibility: input.visibility, priceMinor: input.priceMinor });
  return { id: courseId, slug };
}

async function requireCourseCreator(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [course] = await db.select().from(courses).where(and(eq(courses.id, courseId), eq(courses.creatorUserId, userId))).limit(1);
  if (!course) throw new Error("You do not have permission to manage this course");
  return course;
}

export async function createCourseModule(userId: number, input: { courseId: number; title: string; description?: string | null; sortOrder: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await requireCourseCreator(userId, input.courseId);
  const result = await db.insert(courseModules).values(input);
  const moduleId = Number(result[0].insertId);
  return { id: moduleId };
}

export async function createCourseLesson(userId: number, input: { courseId: number; moduleId: number; title: string; summary?: string | null; sortOrder: number; isPreview: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await requireCourseCreator(userId, input.courseId);
  const [module] = await db.select().from(courseModules).where(and(eq(courseModules.id, input.moduleId), eq(courseModules.courseId, input.courseId))).limit(1);
  if (!module) throw new Error("Module not found in this course");
  const result = await db.insert(courseLessons).values(input);
  return { id: Number(result[0].insertId) };
}

export async function uploadCourseLessonVideo(userId: number, input: { lessonId: number; fileName: string; base64Data: string; byteSize: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [lesson] = await db.select().from(courseLessons).where(eq(courseLessons.id, input.lessonId)).limit(1);
  if (!lesson) throw new Error("Lesson not found");
  await requireCourseCreator(userId, lesson.courseId);
  const bytes = Buffer.from(input.base64Data, "base64");
  if (bytes.byteLength !== input.byteSize || bytes.byteLength > 8 * 1024 * 1024) throw new Error("Video size could not be verified");
  // Paid content is gated on enrollment, so the stored type must be real — a
  // mislabelled file served as video/mp4 is a stored-XSS vector for learners.
  if (!bytesMatchMimeType(bytes, "video/mp4")) throw new Error("Video contents are not a valid MP4 file");
  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "lesson.mp4";
  const upload = await storagePut(`private/courses/${lesson.courseId}/${lesson.id}/${safeFileName}`, bytes, "video/mp4");
  await db.update(courseLessons).set({ videoStorageKey: upload.key, videoMimeType: "video/mp4" }).where(eq(courseLessons.id, lesson.id));
  await logAuditEvent(userId, "course_lesson.video_uploaded", "course_lesson", String(lesson.id), { byteSize: bytes.byteLength });
  return { success: true } as const;
}

type PaymentSubject = "order" | "course_enrollment";
type PaymentState = "draft" | "awaiting_authorization" | "pending_provider" | "succeeded" | "failed" | "cancelled" | "expired";

async function getActiveSettlementForStorefront(storefrontId: number, countryCode: string, providerCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [settlement] = await db.select().from(merchantSettlementProfiles).where(and(eq(merchantSettlementProfiles.storefrontId, storefrontId), eq(merchantSettlementProfiles.countryCode, countryCode), eq(merchantSettlementProfiles.providerCode, providerCode), eq(merchantSettlementProfiles.status, "active"))).limit(1);
  if (!settlement) throw new Error("This merchant does not yet have an active settlement profile for the selected payment partner");
  return settlement;
}

export async function getOrderPaymentQuote(userId: number, input: { orderId: number; countryCode: string; providerCode: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.buyerUserId, userId))).limit(1);
  if (!order || order.status !== "awaiting_payment") throw new Error("Order is not awaiting payment");
  const settlement = await getActiveSettlementForStorefront(order.storefrontId, input.countryCode, input.providerCode);
  return { subjectType: "order" as const, subjectId: order.id, currencyCode: order.currencyCode, subtotalMinor: order.subtotalMinor, feeMinor: order.feeMinor, totalMinor: order.totalMinor, recipientLabel: settlement.recipientAlias, providerCode: input.providerCode };
}

export async function getEnrollmentPaymentQuote(userId: number, input: { enrollmentId: number; countryCode: string; providerCode: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [enrollment] = await db.select().from(courseEnrollments).where(and(eq(courseEnrollments.id, input.enrollmentId), eq(courseEnrollments.learnerUserId, userId))).limit(1);
  if (!enrollment || enrollment.accessState !== "pending_payment") throw new Error("Enrollment is not awaiting payment");
  const [course] = await db.select().from(courses).where(eq(courses.id, enrollment.courseId)).limit(1);
  if (!course?.storefrontId) throw new Error("The creator has not connected an eligible settlement profile for this course");
  const settlement = await getActiveSettlementForStorefront(course.storefrontId, input.countryCode, input.providerCode);
  return { subjectType: "course_enrollment" as const, subjectId: enrollment.id, currencyCode: enrollment.currencyCode, subtotalMinor: enrollment.amountPaidMinor, feeMinor: 0, totalMinor: enrollment.amountPaidMinor, recipientLabel: settlement.recipientAlias, providerCode: input.providerCode };
}

export async function createOrderPaymentIntent(userId: number, input: { orderId: number; countryCode: string; providerCode: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), eq(orders.buyerUserId, userId))).limit(1);
  if (!order) throw new Error("Order not found");
  if (order.status !== "awaiting_payment") throw new Error("This order is no longer awaiting payment");
  const [storefront] = await db.select().from(storefronts).where(eq(storefronts.id, order.storefrontId)).limit(1);
  if (!storefront) throw new Error("Storefront unavailable");
  const settlement = await getActiveSettlementForStorefront(storefront.id, input.countryCode, input.providerCode);
  const existing = await db.select().from(paymentIntents).where(and(eq(paymentIntents.subjectType, "order"), eq(paymentIntents.subjectId, order.id), inArray(paymentIntents.state, ["awaiting_authorization", "pending_provider"]))).limit(1);
  if (existing[0]) return existing[0];
  const reference = `PAY-${crypto.randomUUID().split("-")[0]?.toUpperCase()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const result = await db.insert(paymentIntents).values({ paymentReference: reference, payerUserId: userId, subjectType: "order", subjectId: order.id, countryCode: input.countryCode, providerCode: input.providerCode, currencyCode: order.currencyCode, subtotalMinor: order.subtotalMinor, feeMinor: order.feeMinor, totalMinor: order.totalMinor, recipientLabel: settlement.recipientAlias, encryptedRecipientReference: settlement.encryptedRecipientReference, consentRecordedAt: now, state: "awaiting_authorization", expiresAt });
  const paymentIntentId = Number(result[0].insertId);
  await logAuditEvent(userId, "payment.intent_created", "payment_intent", String(paymentIntentId), { subjectType: "order", subjectId: order.id, providerCode: input.providerCode, totalMinor: order.totalMinor });
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, paymentIntentId)).limit(1);
  return intent!;
}

export async function createEnrollmentPaymentIntent(userId: number, input: { enrollmentId: number; countryCode: string; providerCode: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [enrollment] = await db.select().from(courseEnrollments).where(and(eq(courseEnrollments.id, input.enrollmentId), eq(courseEnrollments.learnerUserId, userId))).limit(1);
  if (!enrollment || enrollment.accessState !== "pending_payment") throw new Error("Enrollment is not awaiting payment");
  const [course] = await db.select().from(courses).where(eq(courses.id, enrollment.courseId)).limit(1);
  if (!course?.storefrontId) throw new Error("The creator has not connected an eligible settlement profile for this course");
  const settlement = await getActiveSettlementForStorefront(course.storefrontId, input.countryCode, input.providerCode);
  const existing = await db.select().from(paymentIntents).where(and(eq(paymentIntents.subjectType, "course_enrollment"), eq(paymentIntents.subjectId, enrollment.id), inArray(paymentIntents.state, ["awaiting_authorization", "pending_provider"]))).limit(1);
  if (existing[0]) return existing[0];
  const reference = `PAY-${crypto.randomUUID().split("-")[0]?.toUpperCase()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const result = await db.insert(paymentIntents).values({ paymentReference: reference, payerUserId: userId, subjectType: "course_enrollment", subjectId: enrollment.id, countryCode: input.countryCode, providerCode: input.providerCode, currencyCode: enrollment.currencyCode, subtotalMinor: enrollment.amountPaidMinor, feeMinor: 0, totalMinor: enrollment.amountPaidMinor, recipientLabel: settlement.recipientAlias, encryptedRecipientReference: settlement.encryptedRecipientReference, consentRecordedAt: now, state: "awaiting_authorization", expiresAt });
  const paymentIntentId = Number(result[0].insertId);
  await logAuditEvent(userId, "payment.intent_created", "payment_intent", String(paymentIntentId), { subjectType: "course_enrollment", subjectId: enrollment.id, providerCode: input.providerCode, totalMinor: enrollment.amountPaidMinor });
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, paymentIntentId)).limit(1);
  return intent!;
}

export async function listPaymentIntentsForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.select().from(paymentIntents).where(eq(paymentIntents.payerUserId, userId)).orderBy(desc(paymentIntents.createdAt));
}

export async function getPaymentIntentForUser(userId: number, paymentIntentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [intent] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.id, paymentIntentId), eq(paymentIntents.payerUserId, userId))).limit(1);
  if (!intent) throw new Error("Payment request unavailable");
  const [receipt] = await db.select().from(paymentReceipts).where(eq(paymentReceipts.paymentIntentId, intent.id)).limit(1);
  return { intent, receipt: receipt ?? null };
}

/**
 * True when a write was rejected by a unique index.
 *
 * MySQL reports this as `ER_DUP_ENTRY` (errno 1062). Drizzle surfaces the
 * driver's error object unchanged, so both the string code and the numeric
 * errno are checked — different mysql2 versions populate them differently.
 */
function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}

export async function getPaymentIntentForProviderReference(paymentReference: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.paymentReference, paymentReference)).limit(1);
  return intent ?? null;
}

export async function recordVerifiedProviderResult(input: { providerCode: string; providerEventId: string; paymentIntentId: number; providerTransactionId?: string; state: Extract<PaymentState, "succeeded" | "failed" | "cancelled">; redactedPayload?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  // Fast path for the common case (a provider retrying after we already
  // succeeded). This is an optimisation only — the authoritative check below is
  // the insert, because two concurrent deliveries can both pass this SELECT.
  const [existingEvent] = await db.select().from(paymentProviderEvents).where(and(eq(paymentProviderEvents.providerCode, input.providerCode), eq(paymentProviderEvents.providerEventId, input.providerEventId))).limit(1);
  if (existingEvent) return { replay: true, paymentIntentId: existingEvent.paymentIntentId };
  const [intent] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.id, input.paymentIntentId), eq(paymentIntents.providerCode, input.providerCode))).limit(1);
  if (!intent) throw new Error("Payment intent unavailable for this provider");
  if (!canTransitionPaymentIntent(intent.state, input.state)) throw new Error("Invalid payment state transition");

  try {
    await db.transaction(async tx => {
      // Insert the event FIRST, inside the transaction. The unique index on
      // (providerCode, providerEventId) is what actually serialises concurrent
      // deliveries of the same webhook: the loser gets ER_DUP_ENTRY and its
      // transaction rolls back, so the order is never marked paid twice and no
      // second receipt is issued. Checking with a SELECT first cannot do this —
      // both requests read "absent" and both proceed.
      await tx.insert(paymentProviderEvents).values({ providerCode: input.providerCode, providerEventId: input.providerEventId, paymentIntentId: intent.id, eventType: input.state, verificationState: "verified", redactedPayload: input.redactedPayload?.slice(0, 5000) ?? null, processedAt: new Date() });
      await tx.update(paymentIntents).set({ state: input.state, providerTransactionId: input.providerTransactionId ?? null, completedAt: input.state === "succeeded" ? new Date() : null, failureCode: input.state === "failed" ? "provider_declined" : null }).where(eq(paymentIntents.id, intent.id));
      if (input.state === "succeeded") {
        const receiptReference = `RCT-${crypto.randomUUID().split("-")[0]?.toUpperCase()}`;
        await tx.insert(paymentReceipts).values({ paymentIntentId: intent.id, receiptReference, issuedAt: new Date(), amountMinor: intent.totalMinor, currencyCode: intent.currencyCode, providerCode: intent.providerCode, providerTransactionId: input.providerTransactionId ?? null });
        if (intent.subjectType === "order") {
          await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, intent.subjectId));
          await tx.insert(orderStatusEvents).values({ orderId: intent.subjectId, actorUserId: null, status: "paid", note: "Verified partner payment" });
        } else {
          await tx.update(courseEnrollments).set({ accessState: "active", activatedAt: new Date() }).where(eq(courseEnrollments.id, intent.subjectId));
        }
      }
    });
  } catch (error) {
    // Another request committed this provider event while we were working.
    // Throwing here rolls back our transaction, so the duplicate has no effect.
    if (isDuplicateKeyError(error)) {
      const [committed] = await db
        .select()
        .from(paymentProviderEvents)
        .where(
          and(
            eq(paymentProviderEvents.providerCode, input.providerCode),
            eq(paymentProviderEvents.providerEventId, input.providerEventId)
          )
        )
        .limit(1);
      if (committed) return { replay: true, paymentIntentId: committed.paymentIntentId ?? input.paymentIntentId };
    }
    throw error;
  }
  return { replay: false, paymentIntentId: intent.id };
}

export async function getCourseBySlug(userId: number | null, slug: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course || (course.visibility !== "public" && course.creatorUserId !== userId)) throw new Error("Course unavailable");
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, course.id)).orderBy(courseModules.sortOrder);
  const lessons = await db.select().from(courseLessons).where(eq(courseLessons.courseId, course.id)).orderBy(courseLessons.sortOrder);
  const [enrollment] = userId ? await db.select().from(courseEnrollments).where(and(eq(courseEnrollments.courseId, course.id), eq(courseEnrollments.learnerUserId, userId))).limit(1) : [];
  return { course, modules, lessons, enrollment: enrollment ?? null };
}

export async function createCourseEnrollment(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [course] = await db.select().from(courses).where(and(eq(courses.id, courseId), eq(courses.visibility, "public"))).limit(1);
  if (!course) throw new Error("Course unavailable");
  const [existing] = await db.select().from(courseEnrollments).where(and(eq(courseEnrollments.courseId, courseId), eq(courseEnrollments.learnerUserId, userId))).limit(1);
  if (existing) return { id: existing.id, reference: existing.enrollmentReference, accessState: existing.accessState };
  const reference = `EN-${crypto.randomUUID().split("-")[0]?.toUpperCase()}`;
  const result = await db.insert(courseEnrollments).values({ courseId, learnerUserId: userId, enrollmentReference: reference, amountPaidMinor: course.priceMinor, currencyCode: course.currencyCode, accessState: "pending_payment" });
  return { id: Number(result[0].insertId), reference, accessState: "pending_payment" as const };
}

export async function requireLessonAccess(userId: number, lessonId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [lesson] = await db.select().from(courseLessons).where(eq(courseLessons.id, lessonId)).limit(1);
  if (!lesson) throw new Error("Lesson unavailable");
  const [course] = await db.select().from(courses).where(eq(courses.id, lesson.courseId)).limit(1);
  if (!course) throw new Error("Course unavailable");
  if (canAccessLesson({ isCreator: course.creatorUserId === userId, isPreview: lesson.isPreview, enrollmentState: null })) return { lesson, course, enrollment: null };
  const [enrollment] = await db.select().from(courseEnrollments).where(and(eq(courseEnrollments.courseId, course.id), eq(courseEnrollments.learnerUserId, userId), eq(courseEnrollments.accessState, "active"))).limit(1);
  if (!canAccessLesson({ isCreator: false, isPreview: false, enrollmentState: enrollment?.accessState ?? null })) throw new Error("This lesson requires a confirmed enrollment");
  return { lesson, course, enrollment };
}

export async function getLessonVideoUrl(userId: number, lessonId: number) {
  const access = await requireLessonAccess(userId, lessonId);
  if (!access.lesson.videoStorageKey) throw new Error("This lesson does not have a video yet");
  return { url: await storageGetSignedUrl(access.lesson.videoStorageKey), title: access.lesson.title };
}

export async function updateLessonProgress(userId: number, input: { lessonId: number; watchedSeconds: number; completed: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const access = await requireLessonAccess(userId, input.lessonId);
  if (!access.enrollment) return { saved: false, reason: "preview_or_creator" as const };
  const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, userId)).limit(1);
  if (!privacy?.courseProgressOptIn) return { saved: false, reason: "progress_opt_in_required" as const };
  await db.insert(lessonProgress).values({ enrollmentId: access.enrollment.id, lessonId: input.lessonId, watchedSeconds: input.watchedSeconds, completedAt: input.completed ? new Date() : null, lastViewedAt: new Date() }).onDuplicateKeyUpdate({ set: { watchedSeconds: input.watchedSeconds, completedAt: input.completed ? new Date() : null, lastViewedAt: new Date() } });
  return { saved: true } as const;
}
