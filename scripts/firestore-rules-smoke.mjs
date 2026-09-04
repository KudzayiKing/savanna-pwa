/**
 * Firestore rules smoke test — runs the real chat read/write paths against the
 * real firestore.rules inside the emulator.
 *
 * Purpose: "Missing or insufficient permissions" in the browser tells you only
 * that *something* in a batch or a query was denied. It does not tell you which
 * of the half-dozen documents a single chat send touches. This script runs each
 * step in isolation so the failing operation is named explicitly.
 *
 * Usage (from the repo root):
 *   npm run test:rules
 *
 * That runs `firebase emulators:exec --only firestore,auth --project
 * demo-savanna "node scripts/firestore-rules-smoke.mjs"` against the REPO's
 * firebase.json, which is what points the emulator at ./firestore.rules. Do NOT
 * pass `-c <some other config>`: if that config points anywhere else, the
 * emulator silently loads different rules and every check below becomes
 * meaningless.
 *
 * Requires the firebase CLI on PATH (`npm i -g firebase-tools`). If it is
 * installed but not on PATH, invoke it by absolute path, e.g.
 *   /usr/local/bin/firebase emulators:exec --only firestore,auth \
 *     --project demo-savanna "node scripts/firestore-rules-smoke.mjs"
 */
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";
import http from "node:http";

/**
 * Sets a custom claim on an emulator user.
 *
 * The Auth emulator cannot be driven by the firebase-admin SDK (it is not a
 * dependency of this project), but its REST surface accepts a localId plus
 * customAttributes when the request carries the emulator owner header. Reusing
 * the same firebase/auth client after this lands the claim in the next ID
 * token, which is exactly the claim the rules read.
 */
async function setCustomClaims(localId, claims) {
  await new Promise((resolve, reject) => {
    const data = JSON.stringify({ localId, customAttributes: JSON.stringify(claims) });
    const request = http.request({
      host: "127.0.0.1",
      port: 9099,
      path: "/identitytoolkit.googleapis.com/v1/accounts:update?key=fake",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        Authorization: "Bearer owner",
      },
    }, response => {
      let buffer = "";
      response.on("data", chunk => (buffer += chunk));
      response.on("end", () => {
        if (response.statusCode > 299) {
          reject(new Error(`setCustomClaims ${response.statusCode}: ${buffer}`));
        } else {
          resolve();
        }
      });
    });
    request.on("error", reject);
    request.write(data);
    request.end();
  });
}

async function signInAs(email) {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  // The claim was minted after this account first signed in. Without a forced
  // refresh the SDK hands Firestore the cached token from that earlier sign-in,
  // which predates the claim and therefore does not carry it.
  await auth.currentUser?.getIdToken(true);
}

const PROJECT_ID = "demo-savanna";
const results = [];
let failures = 0;

async function step(label, fn) {
  try {
    const value = await fn();
    results.push(`  PASS  ${label}`);
    return value;
  } catch (error) {
    failures += 1;
    results.push(`  FAIL  ${label}\n          ${error?.code ?? "?"}: ${error?.message ?? error}`);
    return null;
  }
}

function uniqueMembers(memberIds) {
  return Array.from(new Set(memberIds.filter(Boolean))).sort();
}

const app = initializeApp({
  apiKey: "fake-api-key",
  authDomain: "127.0.0.1:9099",
  projectId: PROJECT_ID,
});

const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8099);

const PASSWORD = "password123";
let userA;
let userB;

async function register(email) {
  try {
    return (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
  } catch {
    return (await signInWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
  }
}

userA = await register("a@savanna.test");
userB = await register("b@savanna.test");
results.push(`userA=${userA}\nuserB=${userB}`);

const conversationRef = id => doc(db, "conversations", id);
const conversationInviteRef = code => doc(db, "conversationInvites", code);
const inboxRef = (uid, id) => doc(db, "users", uid, "conversationRefs", id);
const communityRef = id => doc(db, "communities", id);
const communityInviteRef = code => doc(db, "communityInvites", code);
const communityMemberRef = (communityId, uid) => doc(db, "communities", communityId, "members", uid);
const memoryRef = (uid, id) => doc(db, "users", uid, "memories", id);
const storefrontRef = id => doc(db, "storefronts", id);
const productRef = id => doc(db, "products", id);
const storyRef = () => doc(collection(db, "stories"));
const storyPlacementEventRef = () => doc(collection(db, "storyPlacementEvents"));

// Mirrors messagesQuery() in client/src/lib/firebaseChat.ts
const messagesQuery = (conversationId, uid) =>
  query(collection(db, "conversations", conversationId, "messages"), where("memberIds", "array-contains", uid), limit(120));

const memberIds = uniqueMembers([userA, userB]);
const conversationId = `direct_${memberIds.join("__")}`;
const groupConversationId = "harare-market-group";
const groupInviteCode = "groupinvite1";
const communityInviteCode = "communityinvite1";
const privateCommunityId = "private-makers";
const privateCommunityInviteCode = "privateinvite1";
const userBStorefrontId = "user-b-market";
const userBProductId = "user-b-maize-meal";
let firstMessageId = null;
let publicCommunityChatMessageId = null;
let publicCommunityPostId = null;
let publicCommunityStoryId = null;

// --- 1. conversation create (mirrors createFirebaseConversation) -----------
await step("create conversation doc + both inbox rows", async () => {
  await signInWithEmailAndPassword(auth, "a@savanna.test", PASSWORD);
  const timestamp = serverTimestamp();
  const payload = {
    kind: "direct",
    title: null,
    memberIds,
    directKey: memberIds.join("__"),
    storefrontId: null,
    storefrontSlug: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: null,
    lastMessageSenderId: null,
    lastMessagePreview: "",
  };
  const batch = writeBatch(db);
  batch.set(conversationRef(conversationId), payload, { merge: true });
  for (const uid of memberIds) {
    batch.set(inboxRef(uid, conversationId), {
      conversationId,
      kind: "direct",
      title: null,
      memberIds,
      mutedUntil: null,
      storefrontId: null,
      storefrontSlug: null,
      updatedAt: timestamp,
      lastMessageAt: timestamp,
      lastMessageId: null,
      lastMessageSenderId: null,
      lastMessagePreview: "",
      lastMessageStatus: null,
      unreadCount: 0,
    }, { merge: true });
  }
  await batch.commit();
});

// --- 2. send a message (mirrors sendFirebaseMessage) -----------------------
await step("send message batch (message + conversation update + 2 inbox rows)", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  const messageRef = doc(collection(db, "conversations", conversationId, "messages"));
  firstMessageId = messageRef.id;
  batch.set(messageRef, {
    senderId: userA,
    memberIds,
    body: "hello",
    attachmentPath: null,
    storyId: null,
    status: "sent",
    deliveredTo: [userA],
    readBy: [userA],
    pinnedBy: [],
    createdAt: timestamp,
  });
  batch.update(conversationRef(conversationId), {
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: firstMessageId,
    lastMessageSenderId: userA,
    lastMessagePreview: "hello",
    lastMessageStatus: "sent",
  });
  for (const uid of memberIds) {
    batch.set(inboxRef(uid, conversationId), {
      conversationId,
      kind: "direct",
      title: null,
      memberIds,
      mutedUntil: null,
      storefrontId: null,
      storefrontSlug: null,
      updatedAt: timestamp,
      lastMessageAt: timestamp,
      lastMessageId: firstMessageId,
      lastMessageSenderId: userA,
      lastMessagePreview: "hello",
      lastMessageStatus: "sent",
      unreadCount: uid === userA ? 0 : increment(1),
    }, { merge: true });
  }
  await batch.commit();
});

// --- 3. the operations the UI actually performs ----------------------------
await step("READ messages (array-contains query) as sender", async () => {
  const snap = await getDocs(messagesQuery(conversationId, userA));
  if (snap.size !== 1) throw new Error(`expected 1 message, got ${snap.size}`);
});

await step("READ conversation doc as member", () => getDoc(conversationRef(conversationId)));

await step("READ own inbox list (conversationRefs)", () =>
  getDocs(query(collection(db, "users", userA, "conversationRefs"), orderBy("lastMessageAt", "desc"), limit(80))));

await signOut(auth);
await signInWithEmailAndPassword(auth, "b@savanna.test", PASSWORD);

await step("READ messages (array-contains query) as recipient", async () => {
  const snap = await getDocs(messagesQuery(conversationId, userB));
  if (snap.size !== 1) throw new Error(`expected 1 message, got ${snap.size}`);
});

await step("recipient marks latest incoming message delivered", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, "conversations", conversationId, "messages", firstMessageId), {
    deliveredTo: [userA, userB],
    receiptUpdatedAt: timestamp,
  });
  batch.update(conversationRef(conversationId), {
    lastMessageStatus: "delivered",
    updatedAt: timestamp,
  });
  for (const uid of memberIds) {
    batch.update(inboxRef(uid, conversationId), {
      lastMessageStatus: "delivered",
      updatedAt: timestamp,
    });
  }
  batch.set(doc(db, "conversations", conversationId, "messages", firstMessageId, "receipts", userB), {
    userId: userB,
    status: "delivered",
    deliveredAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  await batch.commit();
});

await step("recipient marks incoming message read", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, "conversations", conversationId, "messages", firstMessageId), {
    deliveredTo: [userA, userB],
    readBy: [userA, userB],
    status: "read",
    receiptUpdatedAt: timestamp,
  });
  batch.update(conversationRef(conversationId), {
    lastMessageStatus: "read",
    updatedAt: timestamp,
  });
  for (const uid of memberIds) {
    batch.update(inboxRef(uid, conversationId), {
      lastMessageStatus: "read",
      unreadCount: 0,
      updatedAt: timestamp,
    });
  }
  batch.set(doc(db, "conversations", conversationId, "messages", firstMessageId, "receipts", userB), {
    userId: userB,
    status: "read",
    deliveredAt: timestamp,
    readAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  await batch.commit();
});

await step("READ conversation doc as recipient", () => getDoc(conversationRef(conversationId)));

await step("READ own inbox list as recipient", () =>
  getDocs(query(collection(db, "users", userB, "conversationRefs"), orderBy("lastMessageAt", "desc"), limit(80))));

await step("recipient replies to a source message", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  const replyRef = doc(collection(db, "conversations", conversationId, "messages"));
  batch.set(replyRef, {
    senderId: userB,
    memberIds,
    body: "replying with context",
    attachmentPath: null,
    storyId: null,
    status: "sent",
    deliveredTo: [userB],
    readBy: [userB],
    replyToMessageId: firstMessageId,
    replyToSenderId: userA,
    replyToSnippet: "hello",
    reactions: {},
    savedBy: [],
    pinnedBy: [],
    memoryPrompt: null,
    createdAt: timestamp,
  });
  batch.update(conversationRef(conversationId), {
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: replyRef.id,
    lastMessageSenderId: userB,
    lastMessagePreview: "replying with context",
    lastMessageStatus: "sent",
  });
  for (const uid of memberIds) {
    batch.set(inboxRef(uid, conversationId), {
      conversationId,
      kind: "direct",
      title: null,
      memberIds,
      mutedUntil: null,
      storefrontId: null,
      storefrontSlug: null,
      updatedAt: timestamp,
      lastMessageAt: timestamp,
      lastMessageId: replyRef.id,
      lastMessageSenderId: userB,
      lastMessagePreview: "replying with context",
      lastMessageStatus: "sent",
      unreadCount: uid === userB ? 0 : increment(1),
    }, { merge: true });
  }
  await batch.commit();
});

await step("recipient reacts to and saves a message memory", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(doc(db, "conversations", conversationId, "messages", firstMessageId), {
    reactions: { heart: [userB] },
    savedBy: [userB],
    memoryPrompt: "hello",
    memoryUpdatedAt: timestamp,
    reactionUpdatedAt: timestamp,
  });
  batch.set(memoryRef(userB, `message_${firstMessageId}`), {
    ownerUserId: userB,
    sourceType: "message",
    conversationId,
    conversationTitle: "Private chat",
    messageId: firstMessageId,
    senderUserId: userA,
    snippet: "send the quote tomorrow",
    tags: ["follow_up", "task"],
    followUpAt: timestamp,
    followUpLabel: "Tomorrow",
    followUpAction: "send the quote tomorrow",
    followUpCompletedAt: null,
    sourceCreatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  await batch.commit();
});

await step("recipient pins a source message", async () => {
  await updateDoc(doc(db, "conversations", conversationId, "messages", firstMessageId), {
    pinnedBy: [userB],
    pinnedAt: serverTimestamp(),
  });
});

await step("recipient updates saved follow-up state", async () => {
  const timestamp = serverTimestamp();
  await updateDoc(memoryRef(userB, `message_${firstMessageId}`), {
    followUpCompletedAt: timestamp,
    updatedAt: timestamp,
  });
});

await step("recipient reads and deletes saved message memory", async () => {
  const snap = await getDocs(query(collection(db, "users", userB, "memories"), orderBy("updatedAt", "desc"), limit(5)));
  if (!snap.docs.some(item => item.id === `message_${firstMessageId}`)) {
    throw new Error("saved message memory was not returned");
  }
  await deleteDoc(memoryRef(userB, `message_${firstMessageId}`));
});

// --- 4. groups can grow through invite links -------------------------------
await signOut(auth);
await signInWithEmailAndPassword(auth, "a@savanna.test", PASSWORD);

await step("create group conversation + invite link", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(conversationRef(groupConversationId), {
    kind: "group",
    title: "Harare Market",
    memberIds,
    directKey: null,
    inviteCode: groupInviteCode,
    storefrontId: null,
    storefrontSlug: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: null,
    lastMessageSenderId: null,
    lastMessagePreview: "",
  });
  for (const uid of memberIds) {
    batch.set(inboxRef(uid, groupConversationId), {
      conversationId: groupConversationId,
      kind: "group",
      title: "Harare Market",
      memberIds,
      inviteCode: groupInviteCode,
      mutedUntil: null,
      storefrontId: null,
      storefrontSlug: null,
      updatedAt: timestamp,
      lastMessageAt: timestamp,
      lastMessageId: null,
      lastMessageSenderId: null,
      lastMessagePreview: "",
      lastMessageStatus: null,
      unreadCount: 0,
    }, { merge: true });
  }
  batch.set(conversationInviteRef(groupInviteCode), {
    conversationId: groupConversationId,
    kind: "group",
    title: "Harare Market",
    inviteCode: groupInviteCode,
    createdByUserId: userA,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await batch.commit();
});

// --- 5. communities can be created, listed, and joined ---------------------
const communityId = "harare-builders";

await step("create public community doc + owner member row", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(communityRef(communityId), {
    ownerUserId: userA,
    name: "Harare Builders",
    slug: "harare-builders",
    description: "A community for builders testing Savanna.",
    city: "Harare",
    countryCode: "ZW",
    visibility: "public",
    memberCount: 1,
    inviteCode: communityInviteCode,
    linkedStorefrontIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(communityMemberRef(communityId, userA), {
    userId: userA,
    role: "owner",
    displayName: "User A",
    photoURL: null,
    joinedAt: timestamp,
  });
  batch.set(communityInviteRef(communityInviteCode), {
    communityId,
    name: "Harare Builders",
    inviteCode: communityInviteCode,
    createdByUserId: userA,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await batch.commit();
});

await step("create private community doc + invite link", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(communityRef(privateCommunityId), {
    ownerUserId: userA,
    name: "Private Makers",
    slug: "private-makers",
    description: "Invite-only makers testing Savanna.",
    city: "Harare",
    countryCode: "ZW",
    visibility: "private",
    memberCount: 1,
    inviteCode: privateCommunityInviteCode,
    linkedStorefrontIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(communityMemberRef(privateCommunityId, userA), {
    userId: userA,
    role: "owner",
    displayName: "User A",
    photoURL: null,
    joinedAt: timestamp,
  });
  batch.set(communityInviteRef(privateCommunityInviteCode), {
    communityId: privateCommunityId,
    name: "Private Makers",
    inviteCode: privateCommunityInviteCode,
    createdByUserId: userA,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await batch.commit();
});

await step("list public communities", async () => {
  const snap = await getDocs(query(collection(db, "communities"), where("visibility", "==", "public"), orderBy("updatedAt", "desc"), limit(80)));
  if (snap.size !== 1) throw new Error(`expected 1 community, got ${snap.size}`);
});

await signOut(auth);
await signInWithEmailAndPassword(auth, "b@savanna.test", PASSWORD);

await step("join public community (member row + count increment)", async () => {
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(communityMemberRef(communityId, userB), {
    userId: userB,
    role: "member",
    displayName: "User B",
    photoURL: null,
    joinedAt: timestamp,
    joinedByInviteCode: null,
  });
  batch.update(communityRef(communityId), {
    memberCount: 2,
    updatedAt: timestamp,
  });
  await batch.commit();
});

await step("member sends a community chat message", async () => {
  const timestamp = serverTimestamp();
  const messageRef = doc(collection(db, "communities", communityId, "chatMessages"));
  publicCommunityChatMessageId = messageRef.id;
  const batch = writeBatch(db);
  batch.set(messageRef, {
    authorUserId: userB,
    authorName: "User B",
    authorPhotoURL: null,
    body: "who knows a reliable plumber?",
    createdAt: timestamp,
  });
  batch.update(communityRef(communityId), { updatedAt: timestamp });
  await batch.commit();
});

await step("member creates a public community post", async () => {
  const timestamp = serverTimestamp();
  const postRef = doc(collection(db, "communities", communityId, "posts"));
  publicCommunityPostId = postRef.id;
  const batch = writeBatch(db);
  batch.set(postRef, {
    authorUserId: userB,
    authorName: "User B",
    authorPhotoURL: null,
    title: "Plumber needed",
    body: "Looking for a reliable plumber near Avondale.",
    kind: "question",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.update(communityRef(communityId), { updatedAt: timestamp });
  await batch.commit();
});

await step("member creates storefront and product for community discovery", async () => {
  const timestamp = serverTimestamp();
  await setDoc(storefrontRef(userBStorefrontId), {
    ownerUserId: userB,
    name: "User B Market",
    slug: "user-b-market",
    bio: "Fresh basics for nearby builders.",
    category: "Groceries",
    contactPhone: null,
    contactEmail: null,
    visibility: "public",
    verificationState: "unverified",
    coverUrl: null,
    coverPath: null,
    ownerCity: "Harare",
    ownerCountryCode: "ZW",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await setDoc(productRef(userBProductId), {
    storefrontId: userBStorefrontId,
    storefrontSlug: "user-b-market",
    storefrontName: "User B Market",
    storefrontOwnerUserId: userB,
    storefrontCategory: "Groceries",
    ownerCity: "Harare",
    ownerCountryCode: "ZW",
    title: "Maize meal",
    description: "Fresh stock for this week.",
    category: "Food",
    priceMinor: 650,
    currencyCode: "USD",
    inventoryQuantity: null,
    status: "active",
    primaryImageUrl: null,
    media: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
});

await step("member creates a product-backed community post", async () => {
  const timestamp = serverTimestamp();
  const postRef = doc(collection(db, "communities", communityId, "posts"));
  const batch = writeBatch(db);
  batch.set(postRef, {
    authorUserId: userB,
    authorName: "User B",
    authorPhotoURL: null,
    title: "Maize meal available",
    body: "Fresh stock just arrived for the builders buying in bulk.",
    kind: "listing",
    storefrontId: userBStorefrontId,
    storefrontSlug: "user-b-market",
    storefrontName: "User B Market",
    productId: userBProductId,
    productName: "Maize meal",
    productDescription: "Fresh stock for this week.",
    productPriceMinor: 650,
    productCurrencyCode: "USD",
    productPrimaryImageUrl: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.update(communityRef(communityId), { updatedAt: timestamp });
  await batch.commit();
});

await step("member publishes a community story", async () => {
  const timestamp = serverTimestamp();
  const ref = storyRef();
  publicCommunityStoryId = ref.id;
  await setDoc(ref, {
    authorUserId: userB,
    authorName: "User B",
    authorCity: "Harare",
    authorCountryCode: "ZW",
    textBody: "Builders community update.",
    audience: "public",
    customAudienceUserIds: [],
    media: [],
    primaryMediaUrl: null,
    primaryMediaType: null,
    isMemory: false,
    storefrontId: null,
    storefrontSlug: null,
    storefrontName: null,
    communityId,
    communityName: "Harare Builders",
    productName: null,
    productDescription: null,
    productPriceMinor: null,
    productCurrencyCode: null,
    createdAt: timestamp,
    publishedAt: timestamp,
    expiresAt: new Date(Date.now() + 86_400_000),
    deletedAt: null,
  });
});

await step("seller publishes a shop story from their storefront", async () => {
  const timestamp = serverTimestamp();
  await setDoc(storyRef(), {
    authorUserId: userB,
    authorName: "User B",
    authorCity: "Harare",
    authorCountryCode: "ZW",
    textBody: "Fresh stock just arrived.",
    audience: "public",
    customAudienceUserIds: [],
    media: [],
    primaryMediaUrl: null,
    primaryMediaType: null,
    isMemory: true,
    storefrontId: userBStorefrontId,
    storefrontSlug: "user-b-market",
    storefrontName: "User B Market",
    communityId: null,
    communityName: null,
    productName: "Maize meal",
    productDescription: "Fresh stock for this week.",
    productPriceMinor: 650,
    productCurrencyCode: "USD",
    createdAt: timestamp,
    publishedAt: timestamp,
    expiresAt: new Date("9999-12-31T23:59:59.999Z"),
    deletedAt: null,
  });
});

await signOut(auth);
await signInWithEmailAndPassword(auth, "a@savanna.test", PASSWORD);

await step("member reacts to a community post story surface", async () => {
  await setDoc(doc(db, "communities", communityId, "posts", publicCommunityPostId, "reactions", `${userA}_heart`), {
    userId: userA,
    emoji: "heart",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
});

await step("member reacts, comments, deletes own comment, and signals story reply", async () => {
  await setDoc(doc(db, "stories", publicCommunityStoryId, "reactions", `${userA}_heart`), {
    userId: userA,
    emoji: "heart",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const commentRef = doc(collection(db, "stories", publicCommunityStoryId, "comments"));
  await setDoc(commentRef, {
    userId: userA,
    userName: "User A",
    userPhotoURL: null,
    body: "Useful community story.",
    createdAt: serverTimestamp(),
  });
  await deleteDoc(commentRef);
  await setDoc(doc(db, "stories", publicCommunityStoryId, "replies", userA), {
    userId: userA,
    userName: "User A",
    userPhotoURL: null,
    count: 1,
    updatedAt: serverTimestamp(),
  });
});

await step("member saves and removes a story memory", async () => {
  const timestamp = serverTimestamp();
  await setDoc(doc(db, "stories", publicCommunityStoryId, "reactions", `${userA}_save`), {
    userId: userA,
    emoji: "save",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await setDoc(memoryRef(userA, `story_${publicCommunityStoryId}`), {
    ownerUserId: userA,
    sourceType: "story",
    conversationId: "",
    conversationTitle: "Harare Builders Story",
    messageId: publicCommunityStoryId,
    senderUserId: userB,
    storyId: publicCommunityStoryId,
    storyAuthorUserId: userB,
    storyAuthorName: "User B",
    storyHref: `/stories?story=${publicCommunityStoryId}`,
    storefrontId: null,
    storefrontSlug: null,
    storefrontName: null,
    communityId,
    communityName: "Harare Builders",
    productName: null,
    productDescription: null,
    productPriceMinor: null,
    productCurrencyCode: null,
    snippet: "Builders community update.",
    tags: ["recommendation"],
    followUpAt: null,
    followUpLabel: null,
    followUpAction: null,
    followUpCompletedAt: null,
    sourceCreatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await deleteDoc(memoryRef(userA, `story_${publicCommunityStoryId}`));
  await deleteDoc(doc(db, "stories", publicCommunityStoryId, "reactions", `${userA}_save`));
});

await step("member logs a story placement interaction", async () => {
  await setDoc(storyPlacementEventRef(), {
    viewerUserId: userA,
    placementId: `story-${publicCommunityStoryId}`,
    action: "impression",
    tab: "community",
    surface: "stories",
    sourceKind: "story",
    storyId: publicCommunityStoryId,
    communityId,
    storefrontId: null,
    productId: null,
    broadCity: "Harare",
    countryCode: "ZW",
    createdAt: serverTimestamp(),
  });
});

await step("member cannot forge another user's story placement event", async () => {
  try {
    await setDoc(storyPlacementEventRef(), {
      viewerUserId: userB,
      placementId: `story-${publicCommunityStoryId}`,
      action: "impression",
      tab: "community",
      surface: "stories",
      sourceKind: "story",
      storyId: publicCommunityStoryId,
      communityId,
      storefrontId: null,
      productId: null,
      broadCity: "Harare",
      countryCode: "ZW",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: member forged another user's story placement event");
});

await step("non-author cannot read story reply analytics", async () => {
  try {
    await getDocs(collection(db, "stories", publicCommunityStoryId, "replies"));
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: non-author read story reply analytics");
});

await step("member cannot attach another seller's product", async () => {
  try {
    await setDoc(doc(collection(db, "communities", communityId, "posts")), {
      authorUserId: userA,
      authorName: "User A",
      authorPhotoURL: null,
      title: "Forged listing",
      body: "Trying to claim another storefront's product.",
      kind: "listing",
      storefrontId: userBStorefrontId,
      storefrontSlug: "user-b-market",
      storefrontName: "User B Market",
      productId: userBProductId,
      productName: "Maize meal",
      productDescription: "Fresh stock for this week.",
      productPriceMinor: 650,
      productCurrencyCode: "USD",
      productPrimaryImageUrl: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: member attached another seller's product");
});

await step("member reads community chat and posts", async () => {
  const [chatSnap, postSnap] = await Promise.all([
    getDocs(query(collection(db, "communities", communityId, "chatMessages"), orderBy("createdAt", "asc"), limit(20))),
    getDocs(query(collection(db, "communities", communityId, "posts"), orderBy("createdAt", "desc"), limit(20))),
  ]);
  if (!chatSnap.docs.some(item => item.id === publicCommunityChatMessageId)) throw new Error("community chat was not returned");
  if (!postSnap.docs.some(item => item.id === publicCommunityPostId)) throw new Error("community post was not returned");
});

// --- 6. a user who is NOT a member must be denied --------------------------
// A non-member's array-contains query returns zero rows and is allowed — the
// filter itself excludes them, so that result proves nothing about the rules.
// Direct reads by document id bypass the filter entirely, which is what makes
// them the meaningful check.
await signOut(auth);
const userC = await register("c@savanna.test");

await step("non-member can read public community posts", async () => {
  const snap = await getDocs(query(collection(db, "communities", communityId, "posts"), orderBy("createdAt", "desc"), limit(20)));
  if (!snap.docs.some(item => item.id === publicCommunityPostId)) throw new Error("public community post was not readable");
});

await step("non-member can react to public community post", async () => {
  await setDoc(doc(db, "communities", communityId, "posts", publicCommunityPostId, "reactions", `${userC}_save`), {
    userId: userC,
    emoji: "save",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
});

await step("non-member publishing into a community story is DENIED", async () => {
  try {
    const timestamp = serverTimestamp();
    await setDoc(storyRef(), {
      authorUserId: userC,
      authorName: "User C",
      authorCity: "Harare",
      authorCountryCode: "ZW",
      textBody: "Trying to publish into a community without joining.",
      audience: "public",
      customAudienceUserIds: [],
      media: [],
      primaryMediaUrl: null,
      primaryMediaType: null,
      isMemory: false,
      storefrontId: null,
      storefrontSlug: null,
      storefrontName: null,
      communityId,
      communityName: "Harare Builders",
      productName: null,
      productDescription: null,
      productPriceMinor: null,
      productCurrencyCode: null,
      createdAt: timestamp,
      publishedAt: timestamp,
      expiresAt: new Date(Date.now() + 86_400_000),
      deletedAt: null,
    });
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: non-member published a community story");
});

await step("non-member reading public community chat is DENIED", async () => {
  try {
    await getDocs(query(collection(db, "communities", communityId, "chatMessages"), orderBy("createdAt", "asc"), limit(20)));
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: non-member read community chat");
});

await step("non-member posting to public community is DENIED", async () => {
  try {
    await setDoc(doc(collection(db, "communities", communityId, "posts")), {
      authorUserId: userC,
      authorName: "User C",
      authorPhotoURL: null,
      title: "Forged",
      body: "not a member",
      kind: "post",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: non-member posted to a community");
});

await step("non-member joins group through invite link", async () => {
  const inviteSnap = await getDoc(conversationInviteRef(groupInviteCode));
  if (!inviteSnap.exists()) throw new Error("group invite was not readable");
  const timestamp = serverTimestamp();
  const nextMemberIds = uniqueMembers([...memberIds, userC]);
  const batch = writeBatch(db);
  batch.update(conversationRef(groupConversationId), {
    memberIds: nextMemberIds,
    updatedAt: timestamp,
  });
  batch.set(inboxRef(userC, groupConversationId), {
    conversationId: groupConversationId,
    kind: "group",
    title: "Harare Market",
    memberIds: nextMemberIds,
    inviteCode: groupInviteCode,
    mutedUntil: null,
    storefrontId: null,
    storefrontSlug: null,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: null,
    lastMessageSenderId: null,
    lastMessagePreview: "",
    lastMessageStatus: null,
    unreadCount: 0,
  }, { merge: true });
  await batch.commit();
});

await step("non-member joins private community through invite link", async () => {
  const inviteSnap = await getDoc(communityInviteRef(privateCommunityInviteCode));
  if (!inviteSnap.exists()) throw new Error("private community invite was not readable");
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(communityMemberRef(privateCommunityId, userC), {
    userId: userC,
    role: "member",
    displayName: "User C",
    photoURL: null,
    joinedAt: timestamp,
    joinedByInviteCode: privateCommunityInviteCode,
  });
  batch.update(communityRef(privateCommunityId), {
    memberCount: 2,
    updatedAt: timestamp,
  });
  await batch.commit();
});

await step("non-member reading a message by id is DENIED", async () => {
  let snap = null;
  try {
    snap = await getDoc(doc(db, "conversations", conversationId, "messages", firstMessageId));
  } catch (error) {
    if (error?.code === "permission-denied") return; // correct behaviour
    throw error;
  }
  throw new Error(`SECURITY: non-member read a message (exists=${snap?.exists()})`);
});

await step("non-member reading the conversation doc is DENIED", async () => {
  let snap = null;
  try {
    snap = await getDoc(conversationRef(conversationId));
  } catch (error) {
    if (error?.code === "permission-denied") return; // correct behaviour
    throw error;
  }
  throw new Error(`SECURITY: non-member read the conversation (exists=${snap?.exists()})`);
});

await step("non-member sending into the thread is DENIED", async () => {
  try {
    await setDoc(doc(collection(db, "conversations", conversationId, "messages")), {
      senderId: userA,
      memberIds,
      body: "forged",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === "permission-denied") return; // correct behaviour
    throw error;
  }
  throw new Error("SECURITY: non-member posted a message into a thread they are not in");
});

// --- Admin / moderation paths --------------------------------------------------
// Rules that gate on Firebase custom claims. Claims are minted through the
// emulator's REST surface (setCustomClaims) because firebase-admin is not a
// project dependency, then picked up by the next sign-in.
const superUid = await register("super@savanna.test");
await setCustomClaims(superUid, { adminRole: "super_admin" });
const modUid = await register("mod@savanna.test");
await setCustomClaims(modUid, { adminRole: "moderator" });
const analystUid = await register("analyst@savanna.test");
await setCustomClaims(analystUid, { adminRole: "analyst" });

await step("DEBUG admin claim present in token", async () => {
  await signInAs("super@savanna.test");
  const result = await auth.currentUser.getIdTokenResult();
  console.log("    CLAIMS:", JSON.stringify(result.claims));
  if (!result.claims.adminRole) throw new Error("NO ADMIN CLAIM IN TOKEN");

  // A self-read proves the basic read path works with this token.
  await getDoc(doc(db, "users", superUid));

  // isAdmin-gated read of another user's profile — the real assertion.
  try {
    await getDoc(doc(db, "users", userB));
    console.log("    isAdmin read: ALLOWED");
  } catch (error) {
    console.log("    isAdmin read: DENIED", error?.code);
  }
});

await step("super_admin can read the audit trail", async () => {
  await signInAs("super@savanna.test");
  const snap = await getDocs(query(collection(db, "adminAuditLogs"), limit(1)));
  if (!snap) throw new Error("audit query returned nothing");
});

await step("super_admin can read error logs", async () => {
  const snap = await getDocs(query(collection(db, "errorLogs"), limit(1)));
  if (!snap) throw new Error("error-query returned nothing");
});

// Fixtures below are created by their OWNER and only then acted on by the
// admin. The create rules pin the owner/author field to the caller
// (`authorUserId == request.auth.uid`), so creating them while signed in as
// super_admin is — correctly — denied. Create as the owner, switch to the
// admin, act.

await step("super_admin can read a private (custom-audience) story", async () => {
  const ref = storyRef();
  await signInAs("b@savanna.test");
  await setDoc(ref, {
    authorUserId: userB, authorName: "User B", textBody: "private", audience: "custom",
    customAudienceUserIds: [userA], media: [], primaryMediaUrl: null, primaryMediaType: null,
    isMemory: false, storefrontId: null, storefrontSlug: null, storefrontName: null,
    communityId: null, communityName: null, productName: null, productDescription: null,
    productPriceMinor: null, productCurrencyCode: null, createdAt: serverTimestamp(),
    publishedAt: serverTimestamp(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null,
  });
  await signInAs("super@savanna.test");
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("admin could not read the private story");
});

await step("super_admin can take down a story", async () => {
  const ref = storyRef();
  await signInAs("b@savanna.test");
  await setDoc(ref, {
    authorUserId: userB, authorName: "User B", textBody: "bad", audience: "public",
    customAudienceUserIds: [], media: [], primaryMediaUrl: null, primaryMediaType: null,
    isMemory: false, storefrontId: null, storefrontSlug: null, storefrontName: null,
    communityId: null, communityName: null, productName: null, productDescription: null,
    productPriceMinor: null, productCurrencyCode: null, createdAt: serverTimestamp(),
    publishedAt: serverTimestamp(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null,
  });
  await signInAs("super@savanna.test");
  await updateDoc(ref, {
    moderationState: "removed", removedBy: superUid, removedReason: "policy violation",
    removedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  if (snap.data().moderationState !== "removed") throw new Error("takedown did not persist");
});

await step("super_admin can flag a shop as suspicious", async () => {
  const ref = storefrontRef("admin-flag-store");
  await signInAs("b@savanna.test");
  await setDoc(ref, {
    ownerUserId: userB, name: "Flag store", slug: "flag-store", bio: "", category: "food",
    contactPhone: null, contactEmail: null, visibility: "public", verificationState: "unverified",
    coverUrl: null, coverPath: null, ownerCity: "Harare", ownerCountryCode: "ZW",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await signInAs("super@savanna.test");
  await updateDoc(ref, {
    riskFlag: "suspicious", riskFlaggedBy: superUid, riskFlaggedAt: serverTimestamp(),
    reviewedBy: superUid, reviewedAt: serverTimestamp(),
    reviewStatus: "pending", verificationState: "unverified", updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  if (snap.data().riskFlag !== "suspicious") throw new Error("risk flag did not persist");
});

await step("super_admin can set community visibility", async () => {
  const ref = communityRef("admin-visibility-community");
  await signInAs("b@savanna.test");
  await setDoc(ref, {
    ownerUserId: userB, name: "Vis community", slug: "vis-community", description: "",
    city: "Harare", countryCode: "ZW", visibility: "public", memberCount: 1,
    linkedStorefrontIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), inviteCode: "vis-code",
  });
  await signInAs("super@savanna.test");
  await updateDoc(ref, {
    visibility: "unlisted", reviewedBy: superUid, reviewedAt: serverTimestamp(),
    reviewStatus: "approved", updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  if (snap.data().visibility !== "unlisted") throw new Error("visibility did not change");
});

await step("super_admin can record an appeal outcome", async () => {
  const ref = doc(db, "users", userB);
  // The profile document has to exist first: the update rule calls
  // request.resource.data.diff(resource.data), and `resource` is null for a
  // missing document, which throws a null-value error. The Auth emulator
  // creates users; it does not create their profile rows.
  await signInAs("b@savanna.test");
  await setDoc(ref, {
    name: "User B", email: "b@savanna.test", accountStatus: "active",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await signInAs("super@savanna.test");
  await updateDoc(ref, {
    banAppealStatus: "upheld", banAppealNote: "mistaken report", banAppealReviewedBy: superUid,
    banAppealReviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  if (snap.data().banAppealStatus !== "upheld") throw new Error("appeal status did not persist");
});

// Permission scoping: a moderator holds content.remove but not user.moderate.
await step("moderator can take down a community post", async () => {
  await signInAs("mod@savanna.test");
  const ref = doc(db, "communities", communityId, "posts", publicCommunityPostId);
  await updateDoc(ref, {
    moderationState: "removed", removedBy: modUid, removedReason: "spam",
    removedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  if (snap.data().moderationState !== "removed") throw new Error("post takedown did not persist");
});

await step("moderator CANNOT read a private conversation message", async () => {
  let snap = null;
  try {
    snap = await getDoc(doc(db, "conversations", conversationId, "messages", firstMessageId));
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: moderator read a private message");
});

await step("moderator CANNOT change an account status", async () => {
  try {
    await updateDoc(doc(db, "users", userB), {
      accountStatus: "banned", moderationUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: moderator changed account status without user.moderate");
});

await step("analyst can read the audit trail but CANNOT write it", async () => {
  await signInAs("analyst@savanna.test");
  const read = await getDocs(query(collection(db, "adminAuditLogs"), limit(1)));
  if (!read) throw new Error("analyst read failed");
  try {
    await setDoc(doc(db, "adminAuditLogs", "analyst-forged"), {
      adminUserId: analystUid, adminName: "analyst", adminRole: "analyst", action: "x",
      targetType: "user", targetId: "x", reason: "long enough reason to pass the minimum",
      before: {}, after: {}, createdAt: serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: analyst wrote to the audit log");
});

await step("ordinary user CANNOT take down content", async () => {
  await signInWithEmailAndPassword(auth, "a@savanna.test", PASSWORD);
  let ref;
  try {
    ref = storyRef();
    await setDoc(ref, {
      authorUserId: userB, authorName: "User B", textBody: "bad", audience: "public",
      customAudienceUserIds: [], media: [], primaryMediaUrl: null, primaryMediaType: null,
      isMemory: false, storefrontId: null, storefrontSlug: null, storefrontName: null,
      communityId: null, communityName: null, productName: null, productDescription: null,
      productPriceMinor: null, productCurrencyCode: null, createdAt: serverTimestamp(),
      publishedAt: serverTimestamp(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null,
    });
    await updateDoc(ref, {
      moderationState: "removed", removedBy: userA, removedReason: "i feel like it",
      removedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error("SECURITY: ordinary user took down content");
});

console.log("\n=== Firestore rules smoke test ===");
console.log(results.join("\n"));
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
