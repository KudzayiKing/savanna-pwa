"use strict";

/**
 * ===========================================================================
 * ENVIRONMENT — what each function here needs, and how to set it
 * ===========================================================================
 *
 * Firebase Functions v2 loads configuration from, in increasing precedence:
 *   functions/.env                 (committed? NO — see functions/.gitignore)
 *   functions/.env.<projectId>     (per-project overrides)
 *   functions/.env.local           (emulator only; overrides the above)
 * and from Secret Manager for anything bound with `secrets: [...]`.
 *
 * Non-secret, project-wide values — plain `functions/.env`:
 *
 *   SAVANNA_ORIGIN=https://savanna-2caf0.web.app
 *
 * `/api/*` (the `api` function) is a bundle of `server/_core/app.ts`. What it
 * reads depends on which routes you actually use:
 *
 *   GEMMA_API_BASE_URL=           base URL of the Gemma inference endpoint
 *   GEMMA_API_KEY=                SECRET -> use firebase functions:secrets:set
 *   GEMMA_CHAT_ENDPOINT=          optional override
 *   GEMMA_EMBEDDING_ENDPOINT=     optional override
 *   GEMMA_TRANSLATE_ENDPOINT=     optional override
 *   GEMMA_CHAT_MODEL=             optional override
 *   GEMMA_EMBEDDING_MODEL=        optional override
 *   GEMMA_TRANSLATE_MODEL=        optional override
 *
 *   DATABASE_URL=                 SECRET. Only needed for tRPC (`/api/trpc`).
 *                                 The AI routes do NOT touch the database, so
 *                                 the function degrades to "AI only" without
 *                                 it rather than failing outright.
 *   JWT_SECRET=                   SECRET. tRPC session cookie signing.
 *   SUPABASE_URL=                 tRPC auth.* procedures only.
 *   SUPABASE_PUBLISHABLE_KEY=
 *   SUPABASE_JWT_SECRET=          SECRET.
 *   FLUTTERWAVE_WEBHOOK_SECRET_HASH=  SECRET. Payment callbacks.
 *   FIREBASE_SERVICE_ACCOUNT_BASE64=  SECRET. Admin SDK, if you add one.
 *
 * Set a secret (never put these in a `.env` file — those are plaintext in the
 * deploy archive and in your working copy):
 *
 *   firebase functions:secrets:set GEMMA_API_KEY
 *   firebase functions:secrets:set DATABASE_URL
 *   firebase functions:secrets:set JWT_SECRET
 *
 * …then bind it to the function by adding `secrets: ["GEMMA_API_KEY"]` to the
 * options object of the relevant `onRequest`/`onCall` below. Secrets that are
 * not bound are simply not present in `process.env`.
 *
 * The session-revocation callables (`revokeSession`, `revokeOtherSessions`)
 * need nothing: they use the Admin SDK's default application credentials.
 * ===========================================================================
 */

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
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
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

/**
 * ===========================================================================
 * Device sessions — revocation
 * ===========================================================================
 *
 * Firebase Auth has no per-session API: you can revoke *all* refresh tokens for
 * a user, but you cannot list their sessions or revoke one of them. So sessions
 * are app-maintained in `users/{uid}/sessions/{sessionId}` (written by
 * `client/src/lib/firebaseSessions.ts`) and "revoked" is just a field on that
 * document.
 *
 * Revocation is therefore advisory: the browser has to notice the field and
 * sign itself out (`useSessionGuard`). That is why these are Admin writes — a
 * client could only ever revoke its OWN session under the Firestore rules, and
 * "sign out all other devices" is meaningless if the target can veto it.
 *
 * The Admin SDK bypasses security rules entirely, so `auth.uid` is verified
 * explicitly at the top of each callable.
 */

/** Session ids are generated by `crypto.randomUUID()` on the device. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function requireUid(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage your sessions.");
  return uid;
}

/**
 * Revokes a single session — the one the user clicked "Revoke" on.
 *
 * Deliberately does not verify that the session belongs to a different device:
 * the same code path serves "revoke another device" and "sign out this device",
 * and the outcome is identical.
 */
exports.revokeSession = onCall(async request => {
  const uid = requireUid(request);
  const sessionId = typeof request.data?.sessionId === "string" ? request.data.sessionId.trim() : "";
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new HttpsError("invalid-argument", "A valid sessionId is required.");
  }

  const db = getFirestore();
  const ref = db.doc(`users/${uid}/sessions/${sessionId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.uid !== uid) {
    throw new HttpsError("not-found", "That session no longer exists.");
  }

  const now = FieldValue.serverTimestamp();
  await ref.set({ revokedAt: now, updatedAt: now }, { merge: true });
  logger.info("[sessions] revoked", { uid, sessionId });
  return { revoked: true };
});

/**
 * "Sign out all other devices".
 *
 * Two writes, both necessary:
 *
 *  1. Every other session document gets `revokedAt`. Without this, a device that
 *     is already open but never re-reads the user document would stay signed in.
 *  2. `users/{uid}.sessionsRevokedAt` is stamped so that any session created
 *     *before* this moment — including one on a device we could not enumerate,
 *     or one whose document write raced with this call — also signs itself out.
 *
 * `sessionsRevokedBySessionId` records who asked. The guard skips the stamp when
 * it matches its own id, otherwise the device that pressed the button would
 * sign itself out too.
 */
exports.revokeOtherSessions = onCall(async request => {
  const uid = requireUid(request);
  const currentSessionId = typeof request.data?.sessionId === "string" ? request.data.sessionId.trim() : "";
  if (currentSessionId && !SESSION_ID_PATTERN.test(currentSessionId)) {
    throw new HttpsError("invalid-argument", "A valid sessionId is required.");
  }

  const db = getFirestore();
  const now = FieldValue.serverTimestamp();
  const sessions = await db.collection(`users/${uid}/sessions`).get();

  let revokedCount = 0;
  const batch = db.batch();
  for (const sessionDoc of sessions.docs) {
    if (sessionDoc.id === currentSessionId) continue;
    if (sessionDoc.data()?.revokedAt) continue;
    batch.set(sessionDoc.ref, { revokedAt: now, updatedAt: now }, { merge: true });
    revokedCount += 1;
  }
  // A Firestore batch holds at most 500 writes; sessions are bounded by the
  // number of devices a person has, but a runaway client should not be able to
  // turn this into a guaranteed failure.
  if (revokedCount > 0) await batch.commit();

  await db.doc(`users/${uid}`).set({
    sessionsRevokedAt: now,
    sessionsRevokedBySessionId: currentSessionId || null,
    updatedAt: now,
  }, { merge: true });

  logger.info("[sessions] revoked others", { uid, currentSessionId, revokedCount });
  return { revokedCount };
});

/**
 * ===========================================================================
 * `/api/*` — the Express API behind Firebase Hosting
 * ===========================================================================
 *
 * `firebase.json` rewrites `/api/**` here and everything else to `/index.html`.
 * Without this function the SPA fallback answers every API call with HTML, and
 * the client fails with `Unexpected token '<' ... is not valid JSON`.
 *
 * The bundle is built by `pnpm build` from `server/_core/firebaseApi.ts`, so
 * `./api.js` does not exist in the source tree (it is generated — see
 * `functions/.gitignore`). Requiring it lazily inside the handler keeps a
 * missing build from breaking the deploy of *this* file's other functions.
 */

let apiAppPromise = null;

exports.api = onRequest(
  {
    // Hosting can only rewrite to functions in us-central1 unless the rewrite
    // names a region explicitly, so pin it rather than inheriting a default
    // that may change.
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "512MiB",
    maxInstances: 20,
    // Bind here if/when the API needs them:
    // secrets: ["DATABASE_URL", "JWT_SECRET", "GEMMA_API_KEY"],
  },
  (req, res) => {
    // `onRequest` handlers are synchronous, but building the Express app is
    // not. Cache the *promise* (not the app) across warm invocations: awaiting
    // it per request is free, rebuilding per request would discard the database
    // pool and re-run tRPC router setup on every call.
    if (!apiAppPromise) {
      apiAppPromise = require("./api.js").createApiApp();
      // A failed init must not be cached forever, or fixing an environment
      // variable would require a redeploy.
      apiAppPromise.catch(() => {
        apiAppPromise = null;
      });
    }

    apiAppPromise.then(app => app(req, res)).catch(error => {
      // The tRPC client parses every response as JSON. An HTML error page —
      // which is what Express and Cloud Functions both produce by default —
      // surfaces as the same misleading "Unexpected token '<'". Always JSON.
      const message = error instanceof Error ? error.message : String(error);
      logger.error("[api] request failed", { path: req.path, message });
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(500).json({ error: "Something went wrong on our end. Please try again." });
    });
  },
);
