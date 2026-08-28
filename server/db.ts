import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
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
  products,
  storefronts,
  stories,
  storyAudienceMembers,
  storyReactions,
  storyViews,
  type PrivacySettings,
  type Profile,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { storageGetSignedUrl, storagePut } from "./storage";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { canAccessLesson, canMerchantAdvanceOrder, canTransitionPaymentIntent, canViewStory, resolveReceiptStatus } from "../shared/domainRules";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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

export async function listStoriesForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const now = new Date();
  const candidates = await db.select({ story: stories, authorName: profiles.displayName }).from(stories).leftJoin(profiles, eq(profiles.userId, stories.authorUserId)).where(and(isNull(stories.deletedAt), gt(stories.expiresAt, now))).orderBy(desc(stories.publishedAt));
  const memberships = await db.select().from(storyAudienceMembers).where(eq(storyAudienceMembers.userId, userId));
  const allowedCustomStoryIds = new Set(memberships.map(membership => membership.storyId));
  return candidates.filter(({ story }) => canViewStory({ isAuthor: story.authorUserId === userId, isAudienceMember: allowedCustomStoryIds.has(story.id), audience: story.audience })).map(({ story, authorName }) => ({ ...story, authorName: authorName?.trim() || "Savanna member" }));
}

export async function publishTextStory(input: { authorUserId: number; textBody: string; audience: "public" | "custom" | "private"; customAudienceUserIds?: number[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const audienceUserIds = Array.from(new Set((input.customAudienceUserIds ?? []).filter(userId => userId !== input.authorUserId)));
  if (input.audience === "custom" && audienceUserIds.length === 0) throw new Error("Select at least one Savanna account for a custom Story");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const storyId = await db.transaction(async tx => {
    const result = await tx.insert(stories).values({ authorUserId: input.authorUserId, textBody: input.textBody, audience: input.audience, expiresAt });
    const id = Number(result[0].insertId);
    if (input.audience === "custom") await tx.insert(storyAudienceMembers).values(audienceUserIds.map(userId => ({ storyId: id, userId })));
    return id;
  });
  await logAuditEvent(input.authorUserId, "story.published", "story", String(storyId), { audience: input.audience, expiresAt: expiresAt.toISOString() });
  return { id: storyId, expiresAt };
}

export async function recordStoryView(userId: number, storyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [story] = await db.select().from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story || story.deletedAt || story.expiresAt <= new Date()) throw new Error("Story is unavailable");
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
  return { storefront: storefront ?? null, onboarding: onboarding ?? null, settlement: safeSettlement, products: catalog };
}

export async function getPublicProfile(viewerUserId: number | null, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile) throw new Error("Profile unavailable");
  if (profile.userId !== viewerUserId && profile.profileVisibility !== "public") throw new Error("This profile is not public");
  const avatarUrl = profile.userId === viewerUserId && profile.avatarKey ? await storageGetSignedUrl(profile.avatarKey) : null;
  return { id: profile.id, userId: profile.userId, displayName: profile.displayName, bio: profile.bio, countryCode: profile.countryCode, city: profile.city, profileVisibility: profile.profileVisibility, avatarUrl };
}

function encryptSettlementReference(value: string) {
  if (!ENV.cookieSecret) throw new Error("Server encryption configuration is unavailable");
  const key = createHash("sha256").update(ENV.cookieSecret).digest();
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

export async function listPublicStorefronts(query?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const all = await db.select().from(storefronts).where(eq(storefronts.visibility, "public")).orderBy(desc(storefronts.updatedAt));
  const needle = query?.trim().toLowerCase();
  return needle ? all.filter(storefront => [storefront.name, storefront.category, storefront.bio].some(value => value?.toLowerCase().includes(needle))) : all;
}

export async function listPublicProducts(query?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
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
    })
    .from(products)
    .innerJoin(storefronts, eq(storefronts.id, products.storefrontId))
    .where(and(eq(products.status, "active"), eq(storefronts.visibility, "public")))
    .orderBy(desc(products.createdAt));
  const needle = query?.trim().toLowerCase();
  return needle ? all.filter(product => [product.title, product.description, product.category, product.storefrontName].some(value => value?.toLowerCase().includes(needle))) : all;
}

export async function getStorefrontBySlug(userId: number | null, slug: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [storefront] = await db.select().from(storefronts).where(eq(storefronts.slug, slug)).limit(1);
  if (!storefront || (storefront.visibility !== "public" && storefront.ownerUserId !== userId)) throw new Error("Storefront unavailable");
  const catalog = await db.select().from(products).where(and(eq(products.storefrontId, storefront.id), userId === storefront.ownerUserId ? undefined : eq(products.status, "active"))).orderBy(desc(products.createdAt));
  return { storefront, products: catalog };
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

export async function getPaymentIntentForProviderReference(paymentReference: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.paymentReference, paymentReference)).limit(1);
  return intent ?? null;
}

export async function recordVerifiedProviderResult(input: { providerCode: string; providerEventId: string; paymentIntentId: number; providerTransactionId?: string; state: Extract<PaymentState, "succeeded" | "failed" | "cancelled">; redactedPayload?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existingEvent] = await db.select().from(paymentProviderEvents).where(and(eq(paymentProviderEvents.providerCode, input.providerCode), eq(paymentProviderEvents.providerEventId, input.providerEventId))).limit(1);
  if (existingEvent) return { replay: true, paymentIntentId: existingEvent.paymentIntentId };
  const [intent] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.id, input.paymentIntentId), eq(paymentIntents.providerCode, input.providerCode))).limit(1);
  if (!intent) throw new Error("Payment intent unavailable for this provider");
  if (!canTransitionPaymentIntent(intent.state, input.state)) throw new Error("Invalid payment state transition");
  await db.transaction(async tx => {
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
