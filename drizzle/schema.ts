import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Every timestamp in Savanna is persisted as a UTC timestamp. The client is
 * responsible only for local-time presentation, never for storage semantics.
 */
const utcCreatedAt = timestamp("createdAt").defaultNow().notNull();
const utcUpdatedAt = timestamp("updatedAt").defaultNow().onUpdateNow().notNull();

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "support", "finance"]).default("user").notNull(),
  createdAt: utcCreatedAt,
  updatedAt: utcUpdatedAt,
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const profiles = mysqlTable(
  "profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    displayName: varchar("displayName", { length: 100 }).notNull(),
    bio: varchar("bio", { length: 500 }),
    avatarKey: varchar("avatarKey", { length: 512 }),
    countryCode: varchar("countryCode", { length: 2 }),
    city: varchar("city", { length: 120 }),
    profileVisibility: mysqlEnum("profileVisibility", ["public", "connections", "private"]).default("connections").notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [uniqueIndex("profiles_user_id_unique").on(table.userId)]
);

export const privacySettings = mysqlTable(
  "privacySettings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    phoneVisibility: mysqlEnum("phoneVisibility", ["nobody", "connections"]).default("nobody").notNull(),
    handleDiscoverability: mysqlEnum("handleDiscoverability", ["exact_match", "invite_only"]).default("exact_match").notNull(),
    storyAudienceDefault: mysqlEnum("storyAudienceDefault", ["connections", "custom", "private"]).default("connections").notNull(),
    readReceiptsEnabled: boolean("readReceiptsEnabled").default(true).notNull(),
    lastSeenVisibility: mysqlEnum("lastSeenVisibility", ["nobody", "connections"]).default("connections").notNull(),
    courseProgressOptIn: boolean("courseProgressOptIn").default(false).notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [uniqueIndex("privacy_settings_user_id_unique").on(table.userId)]
);

export const userHandles = mysqlTable(
  "userHandles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    handle: varchar("handle", { length: 48 }).notNull(),
    normalizedHandle: varchar("normalizedHandle", { length: 48 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: utcCreatedAt,
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    uniqueIndex("user_handles_normalized_handle_unique").on(table.normalizedHandle),
    index("user_handles_user_id_idx").on(table.userId),
  ]
);

export const deviceSessions = mysqlTable(
  "deviceSessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    deviceLabel: varchar("deviceLabel", { length: 140 }).notNull(),
    sessionFingerprint: varchar("sessionFingerprint", { length: 128 }).notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
    createdAt: utcCreatedAt,
  },
  table => [index("device_sessions_user_id_idx").on(table.userId)]
);

export const blocks = mysqlTable(
  "blocks",
  {
    id: int("id").autoincrement().primaryKey(),
    blockerUserId: int("blockerUserId").notNull(),
    blockedUserId: int("blockedUserId").notNull(),
    createdAt: utcCreatedAt,
  },
  table => [
    uniqueIndex("blocks_pair_unique").on(table.blockerUserId, table.blockedUserId),
    index("blocks_blocked_user_id_idx").on(table.blockedUserId),
  ]
);

export const reports = mysqlTable(
  "reports",
  {
    id: int("id").autoincrement().primaryKey(),
    reporterUserId: int("reporterUserId").notNull(),
    targetDomain: mysqlEnum("targetDomain", ["profile", "story", "storefront", "product", "course", "message", "payment"]).notNull(),
    targetId: varchar("targetId", { length: 96 }).notNull(),
    reason: mysqlEnum("reason", ["spam", "impersonation", "scam", "harassment", "unsafe_content", "other"]).notNull(),
    detail: varchar("detail", { length: 1200 }),
    evidenceScope: mysqlEnum("evidenceScope", ["none", "selected_item", "user_submitted"]).default("none").notNull(),
    status: mysqlEnum("status", ["open", "in_review", "resolved", "dismissed"]).default("open").notNull(),
    createdAt: utcCreatedAt,
    resolvedAt: timestamp("resolvedAt"),
  },
  table => [
    index("reports_status_created_at_idx").on(table.status, table.createdAt),
    index("reports_target_idx").on(table.targetDomain, table.targetId),
  ]
);

export const consents = mysqlTable(
  "consents",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    scope: mysqlEnum("scope", ["payment_provider", "marketing", "course_progress", "analytics", "story_audience"]).notNull(),
    policyVersion: varchar("policyVersion", { length: 32 }).notNull(),
    grantedAt: timestamp("grantedAt").defaultNow().notNull(),
    withdrawnAt: timestamp("withdrawnAt"),
    createdAt: utcCreatedAt,
  },
  table => [index("consents_user_scope_idx").on(table.userId, table.scope)]
);

export const auditEvents = mysqlTable(
  "auditEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId"),
    action: varchar("action", { length: 120 }).notNull(),
    domain: varchar("domain", { length: 64 }).notNull(),
    targetId: varchar("targetId", { length: 96 }),
    metadata: text("metadata"),
    createdAt: utcCreatedAt,
  },
  table => [
    index("audit_events_actor_created_at_idx").on(table.actorUserId, table.createdAt),
    index("audit_events_domain_target_idx").on(table.domain, table.targetId),
  ]
);

export const conversations = mysqlTable(
  "conversations",
  {
    id: int("id").autoincrement().primaryKey(),
    createdByUserId: int("createdByUserId").notNull(),
    kind: mysqlEnum("kind", ["direct", "group", "merchant_support"]).notNull(),
    title: varchar("title", { length: 160 }),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [index("conversations_creator_created_at_idx").on(table.createdByUserId, table.createdAt)]
);

export const conversationMembers = mysqlTable(
  "conversationMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    userId: int("userId").notNull(),
    role: mysqlEnum("role", ["owner", "admin", "member"]).default("member").notNull(),
    status: mysqlEnum("status", ["active", "left", "removed"]).default("active").notNull(),
    mutedUntil: timestamp("mutedUntil"),
    joinedAt: utcCreatedAt,
  },
  table => [
    uniqueIndex("conversation_members_pair_unique").on(table.conversationId, table.userId),
    index("conversation_members_user_status_idx").on(table.userId, table.status),
  ]
);

export const messages = mysqlTable(
  "messages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    senderUserId: int("senderUserId").notNull(),
    clientMessageId: varchar("clientMessageId", { length: 64 }).notNull(),
    payload: text("payload").notNull(),
    contentType: mysqlEnum("contentType", ["text", "attachment", "system"]).default("text").notNull(),
    status: mysqlEnum("status", ["sending", "sent", "delivered", "read", "failed", "deleted"]).default("sent").notNull(),
    createdAt: utcCreatedAt,
    editedAt: timestamp("editedAt"),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    uniqueIndex("messages_conversation_client_id_unique").on(table.conversationId, table.clientMessageId),
    index("messages_conversation_created_at_idx").on(table.conversationId, table.createdAt),
  ]
);

export const messageAttachments = mysqlTable(
  "messageAttachments",
  {
    id: int("id").autoincrement().primaryKey(),
    messageId: int("messageId").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    byteSize: int("byteSize").notNull(),
    createdAt: utcCreatedAt,
  },
  table => [index("message_attachments_message_id_idx").on(table.messageId)]
);

export const messageDeliveryReceipts = mysqlTable(
  "messageDeliveryReceipts",
  {
    id: int("id").autoincrement().primaryKey(),
    messageId: int("messageId").notNull(),
    recipientUserId: int("recipientUserId").notNull(),
    status: mysqlEnum("status", ["delivered", "read"]).notNull(),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("message_delivery_receipts_pair_unique").on(table.messageId, table.recipientUserId),
    index("message_delivery_recipient_idx").on(table.recipientUserId, table.recordedAt),
  ]
);

export const stories = mysqlTable(
  "stories",
  {
    id: int("id").autoincrement().primaryKey(),
    authorUserId: int("authorUserId").notNull(),
    textBody: varchar("textBody", { length: 700 }),
    audience: mysqlEnum("audience", ["public", "connections", "custom", "private"]).default("connections").notNull(),
    isMemory: boolean("isMemory").default(false).notNull(),
    storefrontId: int("storefrontId"),
    productName: varchar("productName", { length: 160 }),
    productDescription: varchar("productDescription", { length: 280 }),
    productPriceMinor: int("productPriceMinor"),
    productCurrencyCode: varchar("productCurrencyCode", { length: 3 }),
    createdAt: utcCreatedAt,
    publishedAt: timestamp("publishedAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    deletedAt: timestamp("deletedAt"),
  },
  table => [
    index("stories_author_created_at_idx").on(table.authorUserId, table.createdAt),
    index("stories_expiry_idx").on(table.expiresAt, table.deletedAt),
    index("stories_memory_author_idx").on(table.authorUserId, table.isMemory, table.createdAt),
    index("stories_storefront_memory_idx").on(table.storefrontId, table.isMemory, table.createdAt),
  ]
);

export const storyMedia = mysqlTable(
  "storyMedia",
  {
    id: int("id").autoincrement().primaryKey(),
    storyId: int("storyId").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    width: int("width"),
    height: int("height"),
    durationSeconds: int("durationSeconds"),
    createdAt: utcCreatedAt,
  },
  table => [index("story_media_story_id_idx").on(table.storyId)]
);

export const storyAudienceMembers = mysqlTable(
  "storyAudienceMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    storyId: int("storyId").notNull(),
    userId: int("userId").notNull(),
    createdAt: utcCreatedAt,
  },
  table => [uniqueIndex("story_audience_members_pair_unique").on(table.storyId, table.userId)]
);

export const storyViews = mysqlTable(
  "storyViews",
  {
    id: int("id").autoincrement().primaryKey(),
    storyId: int("storyId").notNull(),
    viewerUserId: int("viewerUserId").notNull(),
    viewedAt: timestamp("viewedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("story_views_pair_unique").on(table.storyId, table.viewerUserId)]
);

export const storyReactions = mysqlTable(
  "storyReactions",
  {
    id: int("id").autoincrement().primaryKey(),
    storyId: int("storyId").notNull(),
    userId: int("userId").notNull(),
    emoji: varchar("emoji", { length: 16 }).notNull(),
    createdAt: utcCreatedAt,
  },
  table => [uniqueIndex("story_reactions_pair_unique").on(table.storyId, table.userId)]
);

export const storefronts = mysqlTable(
  "storefronts",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerUserId: int("ownerUserId").notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    bio: varchar("bio", { length: 700 }),
    category: varchar("category", { length: 100 }),
    avatarKey: varchar("avatarKey", { length: 512 }),
    coverKey: varchar("coverKey", { length: 512 }),
    contactPhone: varchar("contactPhone", { length: 40 }),
    contactEmail: varchar("contactEmail", { length: 320 }),
    verificationState: mysqlEnum("verificationState", ["unverified", "pending", "verified", "rejected"]).default("unverified").notNull(),
    visibility: mysqlEnum("visibility", ["draft", "public", "paused"]).default("draft").notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [
    uniqueIndex("storefronts_slug_unique").on(table.slug),
    index("storefronts_owner_idx").on(table.ownerUserId),
    index("storefronts_visibility_category_idx").on(table.visibility, table.category),
  ]
);

export const merchantOnboarding = mysqlTable(
  "merchantOnboarding",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    storefrontId: int("storefrontId"),
    profileComplete: boolean("profileComplete").default(false).notNull(),
    catalogComplete: boolean("catalogComplete").default(false).notNull(),
    settlementComplete: boolean("settlementComplete").default(false).notNull(),
    status: mysqlEnum("status", ["not_started", "in_progress", "ready", "submitted"]).default("not_started").notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [uniqueIndex("merchant_onboarding_user_unique").on(table.userId)]
);

export const merchantSettlementProfiles = mysqlTable(
  "merchantSettlementProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    storefrontId: int("storefrontId").notNull(),
    countryCode: varchar("countryCode", { length: 2 }).notNull(),
    providerCode: varchar("providerCode", { length: 64 }).notNull(),
    recipientAlias: varchar("recipientAlias", { length: 180 }).notNull(),
    encryptedRecipientReference: text("encryptedRecipientReference").notNull(),
    status: mysqlEnum("status", ["pending", "active", "disabled"]).default("pending").notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [uniqueIndex("merchant_settlement_storefront_unique").on(table.storefrontId)]
);

export const products = mysqlTable(
  "products",
  {
    id: int("id").autoincrement().primaryKey(),
    storefrontId: int("storefrontId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: varchar("description", { length: 1800 }),
    category: varchar("category", { length: 100 }),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    priceMinor: int("priceMinor").notNull(),
    inventoryQuantity: int("inventoryQuantity"),
    status: mysqlEnum("status", ["draft", "active", "archived", "sold_out"]).default("draft").notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [
    index("products_storefront_status_idx").on(table.storefrontId, table.status),
    index("products_category_status_idx").on(table.category, table.status),
  ]
);

export const productMedia = mysqlTable(
  "productMedia",
  {
    id: int("id").autoincrement().primaryKey(),
    productId: int("productId").notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: utcCreatedAt,
  },
  table => [index("product_media_product_sort_idx").on(table.productId, table.sortOrder)]
);

export const orders = mysqlTable(
  "orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orderReference: varchar("orderReference", { length: 36 }).notNull(),
    buyerUserId: int("buyerUserId").notNull(),
    storefrontId: int("storefrontId").notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    subtotalMinor: int("subtotalMinor").notNull(),
    feeMinor: int("feeMinor").default(0).notNull(),
    totalMinor: int("totalMinor").notNull(),
    status: mysqlEnum("status", ["awaiting_payment", "paid", "accepted", "preparing", "ready", "completed", "cancelled", "refunded"]).default("awaiting_payment").notNull(),
    buyerNote: varchar("buyerNote", { length: 800 }),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [
    uniqueIndex("orders_reference_unique").on(table.orderReference),
    index("orders_buyer_status_idx").on(table.buyerUserId, table.status),
    index("orders_storefront_status_idx").on(table.storefrontId, table.status),
  ]
);

export const orderItems = mysqlTable(
  "orderItems",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull(),
    productId: int("productId").notNull(),
    productTitleSnapshot: varchar("productTitleSnapshot", { length: 180 }).notNull(),
    unitPriceMinor: int("unitPriceMinor").notNull(),
    quantity: int("quantity").notNull(),
    createdAt: utcCreatedAt,
  },
  table => [index("order_items_order_idx").on(table.orderId)]
);

export const orderStatusEvents = mysqlTable(
  "orderStatusEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    orderId: int("orderId").notNull(),
    actorUserId: int("actorUserId"),
    status: mysqlEnum("status", ["awaiting_payment", "paid", "accepted", "preparing", "ready", "completed", "cancelled", "refunded"]).notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: utcCreatedAt,
  },
  table => [index("order_status_events_order_created_idx").on(table.orderId, table.createdAt)]
);

export const courses = mysqlTable(
  "courses",
  {
    id: int("id").autoincrement().primaryKey(),
    creatorUserId: int("creatorUserId").notNull(),
    storefrontId: int("storefrontId"),
    slug: varchar("slug", { length: 100 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: varchar("description", { length: 2400 }),
    category: varchar("category", { length: 100 }),
    coverKey: varchar("coverKey", { length: 512 }),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    priceMinor: int("priceMinor").notNull(),
    visibility: mysqlEnum("visibility", ["draft", "public", "paused"]).default("draft").notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [
    uniqueIndex("courses_slug_unique").on(table.slug),
    index("courses_creator_idx").on(table.creatorUserId),
    index("courses_visibility_category_idx").on(table.visibility, table.category),
  ]
);

export const courseModules = mysqlTable(
  "courseModules",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: varchar("description", { length: 1000 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [index("course_modules_course_sort_idx").on(table.courseId, table.sortOrder)]
);

export const courseLessons = mysqlTable(
  "courseLessons",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    moduleId: int("moduleId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    summary: varchar("summary", { length: 1000 }),
    videoStorageKey: varchar("videoStorageKey", { length: 512 }),
    videoMimeType: varchar("videoMimeType", { length: 120 }),
    videoDurationSeconds: int("videoDurationSeconds"),
    sortOrder: int("sortOrder").default(0).notNull(),
    isPreview: boolean("isPreview").default(false).notNull(),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [index("course_lessons_module_sort_idx").on(table.moduleId, table.sortOrder)]
);

export const courseEnrollments = mysqlTable(
  "courseEnrollments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    learnerUserId: int("learnerUserId").notNull(),
    enrollmentReference: varchar("enrollmentReference", { length: 36 }).notNull(),
    amountPaidMinor: int("amountPaidMinor").default(0).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    accessState: mysqlEnum("accessState", ["pending_payment", "active", "revoked", "refunded"]).default("pending_payment").notNull(),
    createdAt: utcCreatedAt,
    activatedAt: timestamp("activatedAt"),
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    uniqueIndex("course_enrollments_course_learner_unique").on(table.courseId, table.learnerUserId),
    uniqueIndex("course_enrollments_reference_unique").on(table.enrollmentReference),
    index("course_enrollments_learner_state_idx").on(table.learnerUserId, table.accessState),
  ]
);

export const lessonProgress = mysqlTable(
  "lessonProgress",
  {
    id: int("id").autoincrement().primaryKey(),
    enrollmentId: int("enrollmentId").notNull(),
    lessonId: int("lessonId").notNull(),
    watchedSeconds: int("watchedSeconds").default(0).notNull(),
    completedAt: timestamp("completedAt"),
    lastViewedAt: timestamp("lastViewedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("lesson_progress_enrollment_lesson_unique").on(table.enrollmentId, table.lessonId)]
);

export const paymentIntents = mysqlTable(
  "paymentIntents",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentReference: varchar("paymentReference", { length: 36 }).notNull(),
    payerUserId: int("payerUserId").notNull(),
    subjectType: mysqlEnum("subjectType", ["order", "course_enrollment"]).notNull(),
    subjectId: int("subjectId").notNull(),
    countryCode: varchar("countryCode", { length: 2 }).notNull(),
    providerCode: varchar("providerCode", { length: 64 }).notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    subtotalMinor: int("subtotalMinor").notNull(),
    feeMinor: int("feeMinor").default(0).notNull(),
    totalMinor: int("totalMinor").notNull(),
    recipientLabel: varchar("recipientLabel", { length: 180 }).notNull(),
    encryptedRecipientReference: text("encryptedRecipientReference").notNull(),
    consentRecordedAt: timestamp("consentRecordedAt").notNull(),
    state: mysqlEnum("state", ["draft", "awaiting_authorization", "pending_provider", "succeeded", "failed", "cancelled", "expired"]).default("draft").notNull(),
    providerRequestId: varchar("providerRequestId", { length: 180 }),
    providerTransactionId: varchar("providerTransactionId", { length: 180 }),
    expiresAt: timestamp("expiresAt").notNull(),
    completedAt: timestamp("completedAt"),
    failureCode: varchar("failureCode", { length: 120 }),
    createdAt: utcCreatedAt,
    updatedAt: utcUpdatedAt,
  },
  table => [
    uniqueIndex("payment_intents_reference_unique").on(table.paymentReference),
    index("payment_intents_payer_state_idx").on(table.payerUserId, table.state),
    index("payment_intents_subject_idx").on(table.subjectType, table.subjectId),
    index("payment_intents_provider_request_idx").on(table.providerCode, table.providerRequestId),
  ]
);

export const paymentProviderEvents = mysqlTable(
  "paymentProviderEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    providerCode: varchar("providerCode", { length: 64 }).notNull(),
    providerEventId: varchar("providerEventId", { length: 180 }).notNull(),
    paymentIntentId: int("paymentIntentId"),
    eventType: varchar("eventType", { length: 120 }).notNull(),
    verificationState: mysqlEnum("verificationState", ["pending", "verified", "rejected"]).default("pending").notNull(),
    redactedPayload: text("redactedPayload"),
    receivedAt: utcCreatedAt,
    processedAt: timestamp("processedAt"),
  },
  table => [
    uniqueIndex("payment_provider_events_provider_event_unique").on(table.providerCode, table.providerEventId),
    index("payment_provider_events_intent_idx").on(table.paymentIntentId, table.receivedAt),
  ]
);

export const paymentReceipts = mysqlTable(
  "paymentReceipts",
  {
    id: int("id").autoincrement().primaryKey(),
    paymentIntentId: int("paymentIntentId").notNull(),
    receiptReference: varchar("receiptReference", { length: 48 }).notNull(),
    issuedAt: timestamp("issuedAt").notNull(),
    amountMinor: int("amountMinor").notNull(),
    currencyCode: varchar("currencyCode", { length: 3 }).notNull(),
    providerCode: varchar("providerCode", { length: 64 }).notNull(),
    providerTransactionId: varchar("providerTransactionId", { length: 180 }),
    createdAt: utcCreatedAt,
  },
  table => [
    uniqueIndex("payment_receipts_intent_unique").on(table.paymentIntentId),
    uniqueIndex("payment_receipts_reference_unique").on(table.receiptReference),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type PrivacySettings = typeof privacySettings.$inferSelect;
