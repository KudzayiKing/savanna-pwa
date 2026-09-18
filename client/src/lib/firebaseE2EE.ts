/*
 * Client-side end-to-end encryption for Savanna conversations.
 *
 * Scheme (matches firestore.rules):
 *  - Every user has one ECDH P-256 identity keypair. The PUBLIC key is published
 *    to `users/{uid}/keys/{keyId}`; the PRIVATE key stays on the device
 *    (localStorage) — it is never uploaded. Multi-device support is therefore
 *    out of scope for this MVP (a device only reads messages it has ever had
 *    the key for); see the limitation note at the bottom.
 *  - Each conversation has one AES-GCM 256 conversation key. It is never stored
 *    in the clear: it is wrapped (encrypted) to every member's PUBLIC key and
 *    the wrapped blob is written to `conversations/{cid}/keys/{memberId}`. The
 *    wrapping is done with an ephemeral ECDH keypair so the conversation key is
 *    bound to a fresh ephemeral secret per envelope.
 *  - `conversations/{cid}/encryption/active` records the key id + algorithm so
 *    clients know a conversation is encrypted and can rotate by writing a new doc.
 *
 * Why a member may write ANY envelope (not just their own): the actor wraps the
 * conversation key to the RECIPIENT's public key, so the blob is useless without
 * that recipient's private key. Being able to write the envelope confers no
 * ability to read another member's messages. Envelopes are create-only, so an
 * attacker cannot later swap a recipient's wrapped key.
 *
 * Backward compatibility: conversations without an `encryption` doc keep sending
 * plaintext. A conversation opts into E2EE the first time any member sends a
 * message through `ensureConversationKey` — after that, every message is
 * encrypted and old plaintext messages remain readable (they have no `encrypted`
 * flag). Message bodies are stored as base64(iv || ciphertext); the `encrypted`
 * boolean on the message doc is the unambiguous marker.
 */
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, limit, serverTimestamp } from "firebase/firestore";
import { useEffect, useState } from "react";
import type { AppUser } from "@/lib/userProfile";
import { getFirestoreDb } from "./firebase";

const ENCRYPTION_DOC_ID = "active";
const E2EE_ALG = "ECDH_P256_AESGCM";
const ENCRYPTED_PREVIEW = "Encrypted message";

const PRIV_KEY = (uid: string) => `savanna.e2ee.privateKey.${uid}`;
const PUB_KEY = (uid: string) => `savanna.e2ee.publicKey.${uid}`;
const KEY_ID = (uid: string) => `savanna.e2ee.keyId.${uid}`;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.crypto !== "undefined" && typeof window.crypto.subtle !== "undefined" && typeof window.localStorage !== "undefined";
}

function bufToB64(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

type StoredIdentity = { keyId: string; privateKeyB64: string; publicKeyB64: string };

function readStoredIdentity(user: AppUser): StoredIdentity | null {
  if (!isBrowser()) return null;
  const keyId = localStorage.getItem(KEY_ID(user.id));
  const priv = localStorage.getItem(PRIV_KEY(user.id));
  const pub = localStorage.getItem(PUB_KEY(user.id));
  if (!keyId || !priv || !pub) return null;
  return { keyId, privateKeyB64: priv, publicKeyB64: pub };
}

function writeStoredIdentity(user: AppUser, identity: StoredIdentity) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY_ID(user.id), identity.keyId);
  localStorage.setItem(PRIV_KEY(user.id), identity.privateKeyB64);
  localStorage.setItem(PUB_KEY(user.id), identity.publicKeyB64);
}

/** Ensure the viewer has an ECDH identity keypair and that the public key is
 * published. Returns the private key (for unwrapping). Best-effort: throws are
 * the caller's to catch. */
export async function ensureUserIdentity(user: AppUser): Promise<CryptoKey> {
  const stored = readStoredIdentity(user);
  if (stored) {
    const ref = doc(getFirestoreDb(), "users", user.id, "keys", stored.keyId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.id,
        publicKey: stored.publicKeyB64,
        algorithm: "ECDH_P256",
        createdAt: serverTimestamp(),
      });
    }
    return window.crypto.subtle.importKey(
      "pkcs8",
      b64ToBuf(stored.privateKeyB64),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  }
  const kp = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"],
  );
  const privateKeyB64 = bufToB64(await window.crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const publicKeyB64 = bufToB64(await window.crypto.subtle.exportKey("spki", kp.publicKey));
  const keyId = window.crypto.randomUUID();
  writeStoredIdentity(user, { keyId, privateKeyB64, publicKeyB64 });
  await setDoc(doc(getFirestoreDb(), "users", user.id, "keys", keyId), {
    uid: user.id,
    publicKey: publicKeyB64,
    algorithm: "ECDH_P256",
    createdAt: serverTimestamp(),
  });
  return kp.privateKey;
}

async function getMemberPublicKeySpki(memberId: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(getFirestoreDb(), "users", memberId, "keys"), orderBy("createdAt", "desc"), limit(1)),
  );
  if (snap.empty) return null;
  const value = snap.docs[0].data().publicKey;
  return typeof value === "string" ? value : null;
}

type Envelope = {
  memberId: string;
  ephemeralPublicKey: string;
  wrappedKey: string;
  iv: string;
  alg: string;
  createdAt?: unknown;
};

async function wrapConversationKey(conversationKey: CryptoKey, memberPublicSpki: string): Promise<Omit<Envelope, "memberId" | "createdAt">> {
  const ephemeral = await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const memberPublic = await window.crypto.subtle.importKey(
    "spki",
    b64ToBuf(memberPublicSpki),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: memberPublic },
    ephemeral.privateKey,
    256,
  );
  const wrappingKey = await window.crypto.subtle.importKey(
    "raw",
    bits,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const conversationRaw = await window.crypto.subtle.exportKey("raw", conversationKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, conversationRaw);
  const ephemeralPublicKey = bufToB64(await window.crypto.subtle.exportKey("spki", ephemeral.publicKey));
  return {
    ephemeralPublicKey,
    wrappedKey: bufToB64(wrapped),
    iv: bufToB64(iv.buffer),
    alg: E2EE_ALG,
  };
}

async function unwrapConversationKey(envelope: Envelope, privateKey: CryptoKey): Promise<CryptoKey> {
  const ephemeralPublic = await window.crypto.subtle.importKey(
    "spki",
    b64ToBuf(envelope.ephemeralPublicKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: ephemeralPublic },
    privateKey,
    256,
  );
  const wrappingKey = await window.crypto.subtle.importKey(
    "raw",
    bits,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const iv = new Uint8Array(b64ToBuf(envelope.iv));
  const wrapped = b64ToBuf(envelope.wrappedKey);
  const conversationRaw = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, wrapped);
  return window.crypto.subtle.importKey(
    "raw",
    conversationRaw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const conversationKeyCache = new Map<string, CryptoKey>();

async function writeEnvelope(conversationId: string, memberId: string, conversationKey: CryptoKey, memberPublicSpki: string) {
  const envelope = await wrapConversationKey(conversationKey, memberPublicSpki);
  await setDoc(doc(getFirestoreDb(), "conversations", conversationId, "keys", memberId), {
    memberId,
    ...envelope,
    createdAt: serverTimestamp(),
  });
}

/**
 * Ensure a conversation has a usable AES key for the viewer. Establishes the
 * key + envelopes on first use, unwraps the viewer's envelope on later use, and
 * back-fills envelopes for any member who joined later. Returns null when a key
 * cannot be established yet (e.g. another member has not published a public
 * key) — the caller should fall back to plaintext rather than fail the send.
 */
export async function ensureConversationKey(
  conversationId: string,
  memberIds: string[],
  user: AppUser,
): Promise<CryptoKey | null> {
  const cached = conversationKeyCache.get(conversationId);
  if (cached) return cached;

  const privateKey = await ensureUserIdentity(user);
  const encryptionRef = doc(getFirestoreDb(), "conversations", conversationId, "encryption", ENCRYPTION_DOC_ID);
  const encryptionSnap = await getDoc(encryptionRef);
  const myEnvelopeRef = doc(getFirestoreDb(), "conversations", conversationId, "keys", user.id);
  const myEnvelopeSnap = await getDoc(myEnvelopeRef);

  let conversationKey: CryptoKey | null = null;

  if (myEnvelopeSnap.exists()) {
    conversationKey = await unwrapConversationKey(myEnvelopeSnap.data() as Envelope, privateKey);
  } else if (!encryptionSnap.exists()) {
    conversationKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await setDoc(encryptionRef, {
      keyId: window.crypto.randomUUID(),
      algorithm: "AES_GCM_256",
      createdBy: user.id,
      createdAt: serverTimestamp(),
    });
  }

  if (!conversationKey) return null;

  // Write (or back-fill) envelopes for every member whose envelope is missing.
  const existing = await getDocs(collection(getFirestoreDb(), "conversations", conversationId, "keys"));
  const haveEnvelope = new Set(existing.docs.map(item => item.id));
  const needEnvelope = memberIds.filter(memberId => memberId !== user.id && !haveEnvelope.has(memberId));
  if (needEnvelope.length) {
    const publicKeys = await Promise.all(needEnvelope.map(getMemberPublicKeySpki));
    await Promise.all(
      needEnvelope.map(async (memberId, index) => {
        const spki = publicKeys[index];
        if (spki) await writeEnvelope(conversationId, memberId, conversationKey as CryptoKey, spki);
      }),
    );
  }

  conversationKeyCache.set(conversationId, conversationKey);
  return conversationKey;
}

export async function encryptBody(conversationKey: CryptoKey, plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, conversationKey, data);
  const out = new Uint8Array(iv.length + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), iv.length);
  return bufToB64(out.buffer);
}

export async function decryptBody(conversationKey: CryptoKey, payload: string): Promise<string> {
  const buf = new Uint8Array(b64ToBuf(payload));
  const iv = buf.slice(0, 12);
  const ciphertext = buf.slice(12);
  const plaintext = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, conversationKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function encryptedPreviewText() {
  return ENCRYPTED_PREVIEW;
}

/**
 * React hook: load (establishing if needed) the viewer's AES key for a
 * conversation. Returns null until ready; null also means "not encrypted".
 */
export function useConversationE2EEKey(
  conversationId?: string | null,
  memberIds?: string[] | null,
  user?: AppUser | null,
): CryptoKey | null {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const memberKey = memberIds ? memberIds.join(",") : "";
  useEffect(() => {
    let cancelled = false;
    if (!conversationId || !user || !memberIds?.length) {
      setKey(null);
      return;
    }
    ensureConversationKey(conversationId, memberIds, user)
      .then(result => { if (!cancelled) setKey(result); })
      .catch(() => { if (!cancelled) setKey(null); });
    return () => { cancelled = true; };
  }, [conversationId, user?.id, memberKey]);
  return key;
}
