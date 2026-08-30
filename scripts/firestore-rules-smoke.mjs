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
 *   firebase emulators:exec --only firestore,auth \
 *     --project demo-savanna -c /tmp/savanna-rules-test/firebase.json \
 *     "node scripts/firestore-rules-smoke.mjs"
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
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from "firebase/firestore";

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
const inboxRef = (uid, id) => doc(db, "users", uid, "conversationRefs", id);

// Mirrors messagesQuery() in client/src/lib/firebaseChat.ts
const messagesQuery = (conversationId, uid) =>
  query(collection(db, "conversations", conversationId, "messages"), where("memberIds", "array-contains", uid), limit(120));

const memberIds = uniqueMembers([userA, userB]);
const conversationId = `direct_${memberIds.join("__")}`;
let firstMessageId = null;

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
      lastMessagePreview: "",
      lastMessageStatus: null,
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
    createdAt: timestamp,
  });
  batch.update(conversationRef(conversationId), {
    updatedAt: timestamp,
    lastMessageAt: timestamp,
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
      lastMessagePreview: "hello",
      lastMessageStatus: "sent",
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

await step("READ conversation doc as recipient", () => getDoc(conversationRef(conversationId)));

await step("READ own inbox list as recipient", () =>
  getDocs(query(collection(db, "users", userB, "conversationRefs"), orderBy("lastMessageAt", "desc"), limit(80))));

// --- 4. a user who is NOT a member must be denied --------------------------
// A non-member's array-contains query returns zero rows and is allowed — the
// filter itself excludes them, so that result proves nothing about the rules.
// Direct reads by document id bypass the filter entirely, which is what makes
// them the meaningful check.
await signOut(auth);
await register("c@savanna.test");

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

console.log("\n=== Firestore rules smoke test ===");
console.log(results.join("\n"));
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
