"use strict";

/**
 * Savanna push-notification dispatch.
 *
 * Firebase Hosting is static — there is no Express server behind
 * `savanna-2caf0.web.app`, and `firebase.json` rewrites every unmatched path
 * (including `/api/**`) to `/index.html`. That is why the Express route in
 * `server/_core/notificationRoutes.ts` can never run in production: a POST to
 * `/api/notifications/dispatch` comes back as 29 KB of HTML.
 *
 * So the server side of the push pipeline lives here instead. The browser
 * already writes a `notificationIntents` document on every notifiable event
 * (`recordSavannaNotificationIntent` in
 * `client/src/lib/firebaseNotifications.ts`), and Firestore rules only allow
 * that write when `senderUserId == request.auth.uid` and `status == 'queued'`.
 * This function reacts to that write, re-validates the event server-side
 * exactly like the old Express route did, and fans out via FCM.
 *
 * Firestore triggers are async and server-side, so cold-start latency is
 * irrelevant here — the default region (us-central1) is fine.
 *
 * The logic below is deliberately a line-for-line port of
 * `server/_core/notificationRoutes.ts`. If you change one, change the other.
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions/v2");

initializeApp();

/**
 * Absolute origin used to expand relative `url` values into the `link` FCM
 * needs. Override with `firebase functions:config:set savanna.origin=...`.
 */
const ORIGIN =
  (typeof process.env.SAVANNA_ORIGIN === "string" && process.env.SAVANNA_ORIGIN.trim())
  || (typeof process.env.FUNCTIONS_EMULATOR === "string" && process.env.FUNCTIONS_EMULATOR === "true"
    ? "http://127.0.0.1:3002"
    : "https://savanna-2caf0.web.app");

const DEFAULT_SETTINGS = {
  enabled: true,
  directMessages: true,
  groupMessages: true,
  communityMessages: true,
  communityPosts: true,
  storyReplies: true,
};

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function snippet(value, fallback) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return fallback;
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function profileLabel(data, fallback = "Savanna member") {
  return (
    (typeof data?.name === "string" && data.name.trim())
    || (typeof data?.username === "string" && `@${data.username}`)
    || fallback
  );
}

function settingsAllow(settings, key) {
  return (settings?.enabled ?? DEFAULT_SETTINGS.enabled) !== false
    && (settings?.[key] ?? DEFAULT_SETTINGS[key]) !== false;
}

function mutedUntilBlocks(value) {
  if (!value) return false;
  const date = typeof value?.toDate === "function"
    ? value.toDate()
    : value instanceof Date
      ? value
      : null;
  return Boolean(date && date.getTime() > Date.now());
}

async function userSettings(uid) {
  const snapshot = await getFirestore()
    .doc(`users/${uid}/notificationSettings/preferences`)
    .get();
  return snapshot.exists ? { ...DEFAULT_SETTINGS, ...snapshot.data() } : DEFAULT_SETTINGS;
}

async function userTokens(uid) {
  const snapshot = await getFirestore()
    .collection(`users/${uid}/notificationDevices`)
    .where("enabled", "==", true)
    .limit(20)
    .get();
  return snapshot.docs
    .map(item => ({ id: item.id, token: asString(item.data().token) }))
    .filter(item => Boolean(item.token));
}

/**
 * A device can go stale (app uninstalled, token rotated, permission revoked).
 * FCM tells us per-token, so flip those rows to `enabled: false` rather than
 * retrying them forever and burning quota.
 */
async function removeBadTokens(uid, tokens, response) {
  const db = getFirestore();
  await Promise.all(response.responses.map((result, index) => {
    if (result.success) return null;
    const code = result.error?.code ?? "";
    if (code !== "messaging/registration-token-not-registered" && code !== "messaging/invalid-registration-token") {
      return null;
    }
    return db.doc(`users/${uid}/notificationDevices/${tokens[index].id}`).set({
      enabled: false,
      disabledReason: code,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }));
}

async function sendToUsers(input) {
  const link = new URL(input.url, ORIGIN).href;
  let delivered = 0;
  for (const uid of Array.from(new Set(input.recipientIds))) {
    const [settings, tokens] = await Promise.all([userSettings(uid), userTokens(uid)]);
    if (!settingsAllow(settings, input.category) || tokens.length === 0) continue;

    const response = await getMessaging().sendEachForMulticast({
      tokens: tokens.map(item => item.token),
      notification: { title: input.title, body: input.body },
      webpush: {
        fcmOptions: { link },
        notification: {
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: input.tag,
          renotify: true,
          requireInteraction: false,
          data: { url: input.url, category: input.category },
        },
      },
      data: { url: link, category: input.category },
    });

    delivered += response.successCount;
    await removeBadTokens(uid, tokens, response);
  }
  return { delivered };
}

async function dispatchConversationMessage(uid, intent) {
  const db = getFirestore();
  const conversationId = asString(intent.conversationId);
  const messageId = asString(intent.messageId);
  if (!conversationId || !messageId) return { delivered: 0, skipped: "missing_message_target" };

  const [conversationSnapshot, messageSnapshot, senderSnapshot] = await Promise.all([
    db.doc(`conversations/${conversationId}`).get(),
    db.doc(`conversations/${conversationId}/messages/${messageId}`).get(),
    db.doc(`publicProfiles/${uid}`).get(),
  ]);

  const conversation = conversationSnapshot.data();
  const message = messageSnapshot.data();
  const memberIds = Array.isArray(conversation?.memberIds) ? conversation.memberIds.map(String) : [];

  // Never trust the client-supplied event: the sender must actually be a member
  // and must actually own the message.
  if (!conversationSnapshot.exists || !messageSnapshot.exists || !memberIds.includes(uid) || message?.senderId !== uid) {
    return { delivered: 0, skipped: "unauthorized_event" };
  }

  const senderName = profileLabel(senderSnapshot.data());
  const kind = conversation?.kind === "group" ? "group" : "direct";
  const isStoryReply = typeof message?.storyId === "string" && Boolean(message.storyId);
  const category = isStoryReply ? "storyReplies" : kind === "group" ? "groupMessages" : "directMessages";
  const title = kind === "group"
    ? `${senderName} in ${profileLabel({ name: conversation?.title }, "Group chat")}`
    : senderName;
  const text = snippet(
    message?.body,
    typeof message?.attachmentName === "string" ? message.attachmentName : "Sent a message",
  );

  const recipientIds = memberIds.filter(memberId => memberId !== uid);
  const allowedRecipients = [];
  for (const memberId of recipientIds) {
    const inbox = await db.doc(`users/${memberId}/conversationRefs/${conversationId}`).get();
    if (!mutedUntilBlocks(inbox.data()?.mutedUntil)) allowedRecipients.push(memberId);
  }

  return sendToUsers({
    recipientIds: allowedRecipients,
    title,
    body: text,
    url: `/messages?conversation=${encodeURIComponent(conversationId)}`,
    category,
    tag: `conversation:${conversationId}`,
  });
}

async function communityRecipientIds(communityId, senderId) {
  const members = await getFirestore()
    .collection(`communities/${communityId}/members`)
    .limit(400)
    .get();
  return members.docs.map(item => item.id).filter(memberId => memberId !== senderId);
}

async function dispatchCommunityMessage(uid, intent) {
  const db = getFirestore();
  const communityId = asString(intent.communityId);
  const messageId = asString(intent.communityMessageId);
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
    category: "communityMessages",
    tag: `community-message:${communityId}`,
  });
}

async function dispatchCommunityPost(uid, intent) {
  const db = getFirestore();
  const communityId = asString(intent.communityId);
  const postId = asString(intent.communityPostId);
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
    category: "communityPosts",
    tag: `community-post:${communityId}:${postId}`,
  });
}

exports.dispatchNotificationIntent = onDocumentCreated(
  {
    document: "notificationIntents/{intentId}",
    timeoutSeconds: 120,
    memory: "256MiB",
    maxInstances: 20,
  },
  async event => {
    const snap = event.data;
    if (!snap) return;
    const intent = snap.data() || {};
    const intentId = snap.id;

    // Idempotency guard. Rules only ever allow `status == 'queued'` on create,
    // so anything else means we are looking at an unexpected write.
    if (intent.status !== "queued") return;

    const senderUserId = asString(intent.senderUserId);
    const eventType = asString(intent.eventType);
    if (!senderUserId || !eventType) {
      await snap.ref.set(
        { status: "skipped", skipped: "invalid_intent", processedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return;
    }

    try {
      const result = eventType === "conversation.message"
        ? await dispatchConversationMessage(senderUserId, intent)
        : eventType === "community.message"
          ? await dispatchCommunityMessage(senderUserId, intent)
          : eventType === "community.post"
            ? await dispatchCommunityPost(senderUserId, intent)
            : { delivered: 0, skipped: "unsupported_event" };

      await snap.ref.set({
        status: result.skipped ? "skipped" : "sent",
        delivered: result.delivered ?? 0,
        skipped: result.skipped ?? null,
        processedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      logger.info("[notify] dispatched", { intentId, eventType, ...result });
    } catch (error) {
      // Do not rethrow: a failed intent must not retry forever and must not
      // block the sender's own write.
      const message = error instanceof Error ? error.message : String(error);
      await snap.ref.set({
        status: "failed",
        error: message.slice(0, 500),
        processedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => undefined);
      logger.error("[notify] dispatch failed", { intentId, eventType, message });
    }
  },
);
