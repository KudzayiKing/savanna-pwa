import type express from "express";
import type { DocumentData } from "firebase-admin/firestore";
import type { BatchResponse } from "firebase-admin/messaging";
import { getFirebaseAdminAuth, getFirebaseAdminDb, getFirebaseAdminMessaging } from "./firebaseAdmin";

type NotificationEventType =
  | "conversation.message"
  | "community.message"
  | "community.post";

type NotificationSettings = {
  enabled?: boolean;
  directMessages?: boolean;
  groupMessages?: boolean;
  communityMessages?: boolean;
  communityPosts?: boolean;
  storyReplies?: boolean;
};

type DispatchBody = {
  idToken?: unknown;
  eventType?: unknown;
  conversationId?: unknown;
  messageId?: unknown;
  communityId?: unknown;
  communityMessageId?: unknown;
  communityPostId?: unknown;
};

const DEFAULT_SETTINGS: Required<NotificationSettings> = {
  enabled: true,
  directMessages: true,
  groupMessages: true,
  communityMessages: true,
  communityPosts: true,
  storyReplies: true,
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function snippet(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return fallback;
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function profileLabel(data: DocumentData | undefined, fallback = "Savanna member") {
  return (
    (typeof data?.name === "string" && data.name.trim())
    || (typeof data?.username === "string" && `@${data.username}`)
    || fallback
  );
}

function settingsAllow(settings: NotificationSettings | undefined, key: keyof Required<NotificationSettings>) {
  return (settings?.enabled ?? DEFAULT_SETTINGS.enabled) !== false
    && (settings?.[key] ?? DEFAULT_SETTINGS[key]) !== false;
}

function mutedUntilBlocks(value: unknown) {
  if (!value) return false;
  const date = typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : null;
  return Boolean(date && date.getTime() > Date.now());
}

async function userSettings(uid: string) {
  const db = getFirebaseAdminDb();
  if (!db) return DEFAULT_SETTINGS;
  const snapshot = await db.doc(`users/${uid}/notificationSettings/preferences`).get();
  return snapshot.exists ? { ...DEFAULT_SETTINGS, ...snapshot.data() } : DEFAULT_SETTINGS;
}

async function userTokens(uid: string) {
  const db = getFirebaseAdminDb();
  if (!db) return [];
  const snapshot = await db
    .collection(`users/${uid}/notificationDevices`)
    .where("enabled", "==", true)
    .limit(20)
    .get();
  return snapshot.docs
    .map(item => ({ id: item.id, token: asString(item.data().token) }))
    .filter((item): item is { id: string; token: string } => Boolean(item.token));
}

async function removeBadTokens(uid: string, tokens: Array<{ id: string; token: string }>, response: BatchResponse) {
  const db = getFirebaseAdminDb();
  if (!db) return;
  await Promise.all(response.responses.map((result, index) => {
    if (result.success) return null;
    const code = result.error?.code ?? "";
    if (!["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) return null;
    return db.doc(`users/${uid}/notificationDevices/${tokens[index].id}`).set({
      enabled: false,
      disabledReason: code,
      updatedAt: new Date(),
    }, { merge: true });
  }));
}

async function sendToUsers(input: {
  recipientIds: string[];
  title: string;
  body: string;
  url: string;
  origin: string;
  category: keyof Required<NotificationSettings>;
  tag: string;
}) {
  const messaging = getFirebaseAdminMessaging();
  if (!messaging) return { delivered: 0, skipped: "firebase_admin_not_configured" };

  const link = new URL(input.url, input.origin).href;
  let delivered = 0;
  for (const uid of Array.from(new Set(input.recipientIds))) {
    const [settings, tokens] = await Promise.all([userSettings(uid), userTokens(uid)]);
    if (!settingsAllow(settings, input.category) || tokens.length === 0) continue;
    const response = await messaging.sendEachForMulticast({
      tokens: tokens.map(item => item.token),
      notification: {
        title: input.title,
        body: input.body,
      },
      webpush: {
        fcmOptions: {
          link,
        },
        notification: {
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: input.tag,
          renotify: true,
          requireInteraction: false,
          data: {
            url: input.url,
            category: input.category,
          },
        },
      },
      data: {
        url: link,
        category: input.category,
      },
    });
    delivered += response.successCount;
    await removeBadTokens(uid, tokens, response);
  }
  return { delivered };
}

async function dispatchConversationMessage(uid: string, body: DispatchBody, origin: string) {
  const db = getFirebaseAdminDb();
  if (!db) return { delivered: 0, skipped: "firebase_admin_not_configured" };
  const conversationId = asString(body.conversationId);
  const messageId = asString(body.messageId);
  if (!conversationId || !messageId) return { delivered: 0, skipped: "missing_message_target" };

  const [conversationSnapshot, messageSnapshot, senderSnapshot] = await Promise.all([
    db.doc(`conversations/${conversationId}`).get(),
    db.doc(`conversations/${conversationId}/messages/${messageId}`).get(),
    db.doc(`publicProfiles/${uid}`).get(),
  ]);
  const conversation = conversationSnapshot.data();
  const message = messageSnapshot.data();
  const memberIds = Array.isArray(conversation?.memberIds) ? conversation.memberIds.map(String) : [];
  if (!conversationSnapshot.exists || !messageSnapshot.exists || !memberIds.includes(uid) || message?.senderId !== uid) {
    return { delivered: 0, skipped: "unauthorized_event" };
  }

  const senderName = profileLabel(senderSnapshot.data());
  const kind = conversation?.kind === "group" ? "group" : "direct";
  const isStoryReply = typeof message?.storyId === "string" && message.storyId;
  const category = isStoryReply ? "storyReplies" : kind === "group" ? "groupMessages" : "directMessages";
  const title = kind === "group"
    ? `${senderName} in ${profileLabel({ name: conversation?.title }, "Group chat")}`
    : senderName;
  const text = snippet(message?.body, typeof message?.attachmentName === "string" ? message.attachmentName : "Sent a message");
  const recipientIds = memberIds.filter(memberId => memberId !== uid);
  const allowedRecipients: string[] = [];
  for (const memberId of recipientIds) {
    const inbox = await db.doc(`users/${memberId}/conversationRefs/${conversationId}`).get();
    if (!mutedUntilBlocks(inbox.data()?.mutedUntil)) allowedRecipients.push(memberId);
  }

  return sendToUsers({
    recipientIds: allowedRecipients,
    title,
    body: text,
    url: `/messages?conversation=${encodeURIComponent(conversationId)}`,
    origin,
    category,
    tag: `conversation:${conversationId}`,
  });
}

async function communityRecipientIds(communityId: string, senderId: string) {
  const db = getFirebaseAdminDb();
  if (!db) return [];
  const members = await db.collection(`communities/${communityId}/members`).limit(400).get();
  return members.docs.map(item => item.id).filter(uid => uid !== senderId);
}

async function dispatchCommunityMessage(uid: string, body: DispatchBody, origin: string) {
  const db = getFirebaseAdminDb();
  if (!db) return { delivered: 0, skipped: "firebase_admin_not_configured" };
  const communityId = asString(body.communityId);
  const messageId = asString(body.communityMessageId);
  if (!communityId || !messageId) return { delivered: 0, skipped: "missing_community_message_target" };

  const [communitySnapshot, messageSnapshot, senderSnapshot] = await Promise.all([
    db.doc(`communities/${communityId}`).get(),
    db.doc(`communities/${communityId}/chatMessages/${messageId}`).get(),
    db.doc(`publicProfiles/${uid}`).get(),
  ]);
  const message = messageSnapshot.data();
  if (!communitySnapshot.exists || !messageSnapshot.exists || message?.authorUserId !== uid) {
    return { delivered: 0, skipped: "unauthorized_event" };
  }
  return sendToUsers({
    recipientIds: await communityRecipientIds(communityId, uid),
    title: `${profileLabel(senderSnapshot.data())} in ${profileLabel(communitySnapshot.data(), "Community")}`,
    body: snippet(message?.body, "Sent a community message"),
    url: `/communities/${encodeURIComponent(communityId)}`,
    origin,
    category: "communityMessages",
    tag: `community-message:${communityId}`,
  });
}

async function dispatchCommunityPost(uid: string, body: DispatchBody, origin: string) {
  const db = getFirebaseAdminDb();
  if (!db) return { delivered: 0, skipped: "firebase_admin_not_configured" };
  const communityId = asString(body.communityId);
  const postId = asString(body.communityPostId);
  if (!communityId || !postId) return { delivered: 0, skipped: "missing_community_post_target" };

  const [communitySnapshot, postSnapshot, senderSnapshot] = await Promise.all([
    db.doc(`communities/${communityId}`).get(),
    db.doc(`communities/${communityId}/posts/${postId}`).get(),
    db.doc(`publicProfiles/${uid}`).get(),
  ]);
  const post = postSnapshot.data();
  if (!communitySnapshot.exists || !postSnapshot.exists || post?.authorUserId !== uid) {
    return { delivered: 0, skipped: "unauthorized_event" };
  }
  return sendToUsers({
    recipientIds: await communityRecipientIds(communityId, uid),
    title: `${profileLabel(senderSnapshot.data())} posted in ${profileLabel(communitySnapshot.data(), "Community")}`,
    body: snippet(post?.title || post?.body, "New community post"),
    url: `/communities/${encodeURIComponent(communityId)}?post=${encodeURIComponent(postId)}`,
    origin,
    category: "communityPosts",
    tag: `community-post:${communityId}:${postId}`,
  });
}

export function registerNotificationRoutes(app: express.Express) {
  app.post("/api/notifications/dispatch", async (req, res) => {
    const auth = getFirebaseAdminAuth();
    if (!auth) {
      return res.status(200).json({ delivered: 0, skipped: "firebase_admin_not_configured" });
    }

    const body = (req.body ?? {}) as DispatchBody;
    const idToken = asString(body.idToken);
    const eventType = asString(body.eventType) as NotificationEventType | null;
    if (!idToken || !eventType) return res.status(400).json({ error: "Invalid notification request" });

    try {
      const decoded = await auth.verifyIdToken(idToken);
      const origin = `${req.protocol}://${req.get("host") ?? "localhost"}`;
      const result = eventType === "conversation.message"
        ? await dispatchConversationMessage(decoded.uid, body, origin)
        : eventType === "community.message"
          ? await dispatchCommunityMessage(decoded.uid, body, origin)
          : eventType === "community.post"
            ? await dispatchCommunityPost(decoded.uid, body, origin)
            : { delivered: 0, skipped: "unsupported_event" };
      return res.status(200).json(result);
    } catch (error) {
      console.warn("[Notifications] Dispatch failed", error);
      return res.status(401).json({ error: "Notification request could not be verified" });
    }
  });
}
