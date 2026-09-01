import type { AppUser } from "@/lib/userProfile";
import { inferSavannaFollowUp, inferSavannaMemoryTags, type SavannaMemoryTag } from "@/lib/savannaRecall";
import { enrichMemoryWithEmbeddingGemma } from "@/lib/gemmaAi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect, useRef } from "react";
import { getFirebaseStorage, getFirestoreDb } from "./firebase";
import { listFirebaseBlockedUserIds } from "./firebaseSafety";

export type FirebaseConversationKind = "direct" | "group" | "merchant_support";
export type FirebaseMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed" | "deleted";
export type FirebaseMessageReactionKey = "heart" | "thumbs_up" | "laugh" | "pray";

export const FIREBASE_MESSAGE_REACTIONS: Array<{ key: FirebaseMessageReactionKey; label: string }> = [
  { key: "heart", label: "Heart" },
  { key: "thumbs_up", label: "Like" },
  { key: "laugh", label: "Laugh" },
  { key: "pray", label: "Thanks" },
];

export type FirebaseConversationListItem = {
  id: string;
  kind: FirebaseConversationKind;
  title: string | null;
  mutedUntil: Date | string | null;
  lastMessageAt?: Date | string | null;
  lastMessageId?: string | null;
  lastMessageSenderId?: string | null;
  previewMessage?: string;
  previewStatus?: FirebaseMessageStatus;
  unreadCount: number;
  inviteCode?: string | null;
  /**
   * Every participant, viewer included, as written on the Firestore document.
   * Exposed so a 1:1 thread can resolve the other party and link the avatar
   * through to their public profile. Empty for development preview rows.
   */
  memberIds: string[];
};

export type FirebaseMessageAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  url: string | null;
  path: string | null;
};

export type FirebaseMessage = {
  id: string;
  senderUserId: string;
  contentType: "text" | "attachment";
  payload: string;
  attachments: FirebaseMessageAttachment[];
  createdAt: Date | string;
  status: FirebaseMessageStatus;
  deliveredTo: string[];
  readBy: string[];
  replyTo: {
    messageId: string;
    senderUserId: string;
    snippet: string;
  } | null;
  reactions: Partial<Record<FirebaseMessageReactionKey, string[]>>;
  savedBy: string[];
  pinnedBy: string[];
  memoryPrompt: string | null;
};

export type FirebaseMessageMemory = {
  id: string;
  ownerUserId: string;
  sourceType: "message" | "story";
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  senderUserId: string;
  storyId: string | null;
  storyAuthorUserId: string | null;
  storyAuthorName: string | null;
  storyHref: string | null;
  storefrontId: string | null;
  storefrontSlug: string | null;
  storefrontName: string | null;
  communityId: string | null;
  communityName: string | null;
  productName: string | null;
  productDescription: string | null;
  productPriceMinor: number | null;
  productCurrencyCode: string | null;
  snippet: string;
  tags: SavannaMemoryTag[];
  followUpAt: Date | string | null;
  followUpLabel: string | null;
  followUpAction: string | null;
  followUpCompletedAt: Date | string | null;
  embedding: number[] | null;
  embeddingModel: string | null;
  embeddingProvider: "cloud-embedding-gemma" | "gemma" | "local" | "local-embedding-gemma" | "local-hash" | null;
  embeddingDimensions: number | null;
  embeddingUpdatedAt: Date | string | null;
  semanticSummary: string | null;
  languageCode: string | null;
  sourceCreatedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type CreateConversationInput = {
  memberIds: string[];
  kind?: FirebaseConversationKind;
  title?: string | null;
  storefrontId?: string | null;
  storefrontSlug?: string | null;
  createdByUserId?: string | null;
};

type FirebaseConversationInviteDoc = {
  conversationId?: string | null;
  kind?: FirebaseConversationKind;
  title?: string | null;
  inviteCode?: string | null;
  createdByUserId?: string | null;
  active?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const chatKeys = {
  conversations: (uid?: string | null) => ["firebase", "conversations", uid ?? "guest"] as const,
  messages: (conversationId?: string | null) => ["firebase", "conversation-messages", conversationId ?? "none"] as const,
  memories: (uid?: string | null) => ["firebase", "message-memories", uid ?? "guest"] as const,
};

function uniqueMembers(memberIds: string[]) {
  return Array.from(new Set(memberIds.filter(Boolean))).sort();
}

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  return new Date();
}

function storageName(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  return `${crypto.randomUUID()}.${extension}`;
}

function inviteCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

function messageSnippet(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

function mapMessageReactions(value: unknown): Partial<Record<FirebaseMessageReactionKey, string[]>> {
  if (!value || typeof value !== "object") return {};
  const data = value as Record<string, unknown>;
  return FIREBASE_MESSAGE_REACTIONS.reduce<Partial<Record<FirebaseMessageReactionKey, string[]>>>((next, reaction) => {
    const userIds = data[reaction.key];
    if (Array.isArray(userIds)) next[reaction.key] = userIds.map(String);
    return next;
  }, {});
}

function mapConversation(id: string, data: DocumentData, viewerId?: string | null): FirebaseConversationListItem {
  const storedUnreadCount = typeof data.unreadCount === "number" ? Math.max(0, data.unreadCount) : null;
  const lastMessageSenderId = typeof data.lastMessageSenderId === "string" ? data.lastMessageSenderId : null;
  const lastMessageStatus = (data.lastMessageStatus as FirebaseMessageStatus | undefined) ?? undefined;
  const migratedUnreadCount = storedUnreadCount ?? (
    viewerId && lastMessageSenderId && lastMessageSenderId !== viewerId && lastMessageStatus && lastMessageStatus !== "read" ? 1 : 0
  );
  return {
    id,
    kind: (data.kind as FirebaseConversationKind) ?? "direct",
    title: typeof data.title === "string" ? data.title : null,
    mutedUntil: data.mutedUntil ? toDate(data.mutedUntil) : null,
    lastMessageAt: data.lastMessageAt ? toDate(data.lastMessageAt) : null,
    lastMessageId: typeof data.lastMessageId === "string" ? data.lastMessageId : null,
    lastMessageSenderId,
    previewMessage: typeof data.lastMessagePreview === "string" ? data.lastMessagePreview : undefined,
    previewStatus: lastMessageStatus,
    unreadCount: migratedUnreadCount,
    inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : null,
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
  };
}

function conversationRef(conversationId: string) {
  return doc(getFirestoreDb(), "conversations", conversationId);
}

function conversationInboxRef(memberId: string, conversationId: string) {
  return doc(getFirestoreDb(), "users", memberId, "conversationRefs", conversationId);
}

function conversationInviteRef(code: string) {
  return doc(getFirestoreDb(), "conversationInvites", code);
}

function conversationInboxQuery(uid: string) {
  return query(
    collection(getFirestoreDb(), "users", uid, "conversationRefs"),
    orderBy("lastMessageAt", "desc"),
    limit(80),
  );
}

function messagesQuery(conversationId: string, uid: string) {
  return query(
    collection(getFirestoreDb(), "conversations", conversationId, "messages"),
    where("memberIds", "array-contains", uid),
    limit(120),
  );
}

function inboxPayload(input: {
  conversationId: string;
  kind: FirebaseConversationKind;
  title: string | null;
  memberIds: string[];
  lastMessageAt: ReturnType<typeof serverTimestamp>;
  lastMessageId?: string | null;
  lastMessageSenderId?: string | null;
  lastMessagePreview: string;
  lastMessageStatus?: FirebaseMessageStatus | null;
  unreadCount?: number | ReturnType<typeof increment>;
  storefrontId?: string | null;
  storefrontSlug?: string | null;
  inviteCode?: string | null;
}) {
  return {
    conversationId: input.conversationId,
    kind: input.kind,
    title: input.title,
    memberIds: input.memberIds,
    mutedUntil: null,
    storefrontId: input.storefrontId ?? null,
    storefrontSlug: input.storefrontSlug ?? null,
    updatedAt: serverTimestamp(),
    lastMessageAt: input.lastMessageAt,
    lastMessageId: input.lastMessageId ?? null,
    lastMessageSenderId: input.lastMessageSenderId ?? null,
    lastMessagePreview: input.lastMessagePreview,
    lastMessageStatus: input.lastMessageStatus ?? null,
    unreadCount: input.unreadCount ?? 0,
    inviteCode: input.inviteCode ?? null,
  };
}

/**
 * The other party in a 1:1 thread, or null when there is no single profile to
 * open — most importantly for groups, which have many members.
 *
 * Returns null while signed out: without a viewer there is no way to tell
 * which member is "the other one", and guessing would send people to their
 * own profile.
 */
export function getConversationPeerId(
  conversation: Pick<FirebaseConversationListItem, "kind" | "memberIds">,
  viewerId?: string | null,
): string | null {
  if (conversation.kind === "group") return null;
  if (!viewerId) return null;
  const peer = conversation.memberIds.find(id => id && id !== viewerId);
  return peer ?? null;
}

function messageReceiptStatus(data: DocumentData, viewerId?: string | null): FirebaseMessageStatus {
  const fallback = (data.status as FirebaseMessageStatus | undefined) ?? "sent";
  if (fallback === "failed" || fallback === "deleted") return fallback;
  const senderId = String(data.senderId ?? "");
  if (!viewerId || senderId !== viewerId) return fallback;
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds.map(String) : [];
  const recipients = memberIds.filter(memberId => memberId && memberId !== viewerId);
  if (!recipients.length) return fallback;
  const deliveredTo = Array.isArray(data.deliveredTo) ? data.deliveredTo.map(String) : [];
  const readBy = Array.isArray(data.readBy) ? data.readBy.map(String) : [];
  if (recipients.every(memberId => readBy.includes(memberId))) return "read";
  if (recipients.every(memberId => deliveredTo.includes(memberId))) return "delivered";
  return fallback;
}

function mapMessage(id: string, data: DocumentData, viewerId?: string | null): FirebaseMessage {
  const hasAttachment = Boolean(data.attachmentPath || data.attachmentUrl);
  const attachment: FirebaseMessageAttachment | null = hasAttachment
    ? {
        id,
        fileName: typeof data.attachmentName === "string" ? data.attachmentName : "Attachment",
        mimeType: typeof data.attachmentMimeType === "string" ? data.attachmentMimeType : "application/octet-stream",
        url: typeof data.attachmentUrl === "string" ? data.attachmentUrl : null,
        path: typeof data.attachmentPath === "string" ? data.attachmentPath : null,
      }
    : null;

  return {
    id,
    senderUserId: String(data.senderId ?? ""),
    contentType: hasAttachment ? "attachment" : "text",
    payload: typeof data.body === "string" ? data.body : "",
    attachments: attachment ? [attachment] : [],
    createdAt: toDate(data.createdAt),
    status: messageReceiptStatus(data, viewerId),
    deliveredTo: Array.isArray(data.deliveredTo) ? data.deliveredTo.map(String) : [],
    readBy: Array.isArray(data.readBy) ? data.readBy.map(String) : [],
    replyTo: typeof data.replyToMessageId === "string" && typeof data.replyToSenderId === "string"
      ? {
          messageId: data.replyToMessageId,
          senderUserId: data.replyToSenderId,
          snippet: typeof data.replyToSnippet === "string" ? data.replyToSnippet : "",
        }
      : null,
    reactions: mapMessageReactions(data.reactions),
    savedBy: Array.isArray(data.savedBy) ? data.savedBy.map(String) : [],
    pinnedBy: Array.isArray(data.pinnedBy) ? data.pinnedBy.map(String) : [],
    memoryPrompt: typeof data.memoryPrompt === "string" ? data.memoryPrompt : null,
  };
}

function mapMessageMemory(id: string, data: DocumentData): FirebaseMessageMemory {
  const snippet = typeof data.snippet === "string" ? data.snippet : "";
  const sourceType = data.sourceType === "story" ? "story" : "message";
  const storyId = typeof data.storyId === "string" ? data.storyId : null;
  return {
    id,
    ownerUserId: String(data.ownerUserId ?? ""),
    sourceType,
    conversationId: String(data.conversationId ?? ""),
    conversationTitle: typeof data.conversationTitle === "string" && data.conversationTitle.trim() ? data.conversationTitle : sourceType === "story" ? "Saved Story" : "Private chat",
    messageId: String(data.messageId ?? ""),
    senderUserId: String(data.senderUserId ?? ""),
    storyId,
    storyAuthorUserId: typeof data.storyAuthorUserId === "string" ? data.storyAuthorUserId : null,
    storyAuthorName: typeof data.storyAuthorName === "string" ? data.storyAuthorName : null,
    storyHref: typeof data.storyHref === "string" ? data.storyHref : storyId ? `/stories?story=${storyId}` : null,
    storefrontId: typeof data.storefrontId === "string" ? data.storefrontId : null,
    storefrontSlug: typeof data.storefrontSlug === "string" ? data.storefrontSlug : null,
    storefrontName: typeof data.storefrontName === "string" ? data.storefrontName : null,
    communityId: typeof data.communityId === "string" ? data.communityId : null,
    communityName: typeof data.communityName === "string" ? data.communityName : null,
    productName: typeof data.productName === "string" ? data.productName : null,
    productDescription: typeof data.productDescription === "string" ? data.productDescription : null,
    productPriceMinor: typeof data.productPriceMinor === "number" ? data.productPriceMinor : null,
    productCurrencyCode: typeof data.productCurrencyCode === "string" ? data.productCurrencyCode : null,
    snippet,
    tags: Array.isArray(data.tags) ? data.tags.map(String) as SavannaMemoryTag[] : inferSavannaMemoryTags(snippet),
    followUpAt: data.followUpAt ? toDate(data.followUpAt) : null,
    followUpLabel: typeof data.followUpLabel === "string" ? data.followUpLabel : null,
    followUpAction: typeof data.followUpAction === "string" ? data.followUpAction : null,
    followUpCompletedAt: data.followUpCompletedAt ? toDate(data.followUpCompletedAt) : null,
    embedding: Array.isArray(data.embedding) ? data.embedding.map(Number).filter(Number.isFinite) : null,
    embeddingModel: typeof data.embeddingModel === "string" ? data.embeddingModel : null,
    embeddingProvider: typeof data.embeddingProvider === "string" ? data.embeddingProvider as FirebaseMessageMemory["embeddingProvider"] : null,
    embeddingDimensions: typeof data.embeddingDimensions === "number" ? data.embeddingDimensions : null,
    embeddingUpdatedAt: data.embeddingUpdatedAt ? toDate(data.embeddingUpdatedAt) : null,
    semanticSummary: typeof data.semanticSummary === "string" ? data.semanticSummary : null,
    languageCode: typeof data.languageCode === "string" ? data.languageCode : null,
    sourceCreatedAt: data.sourceCreatedAt ? toDate(data.sourceCreatedAt) : new Date(),
    createdAt: data.createdAt ? toDate(data.createdAt) : new Date(),
    updatedAt: data.updatedAt ? toDate(data.updatedAt) : new Date(),
  };
}

function messageMemoriesQuery(uid: string) {
  return query(
    collection(getFirestoreDb(), "users", uid, "memories"),
    orderBy("updatedAt", "desc"),
    limit(60),
  );
}

async function markVisibleMessagesRead(conversationId: string, uid: string, docs: Array<{ id: string; data: () => DocumentData }>) {
  const unreadIncoming = docs.filter(item => {
    const data = item.data();
    const senderId = String(data.senderId ?? "");
    const memberIds = Array.isArray(data.memberIds) ? data.memberIds.map(String) : [];
    const readBy = Array.isArray(data.readBy) ? data.readBy.map(String) : [];
    return senderId && senderId !== uid && memberIds.includes(uid) && !readBy.includes(uid);
  });
  if (!unreadIncoming.length) return;

  const db = getFirestoreDb();
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  const conversationSnapshot = await getDoc(conversationRef(conversationId));
  const conversationData = conversationSnapshot.data() as DocumentData | undefined;
  const conversationMembers = Array.isArray(conversationData?.memberIds) ? conversationData.memberIds.map(String) : [];
  const latestMessageId = typeof conversationData?.lastMessageId === "string" ? conversationData.lastMessageId : null;
  for (const item of unreadIncoming) {
    const messageRef = doc(db, "conversations", conversationId, "messages", item.id);
    batch.update(messageRef, {
      deliveredTo: arrayUnion(uid),
      readBy: arrayUnion(uid),
      status: "read",
      receiptUpdatedAt: timestamp,
    });
    batch.set(doc(messageRef, "receipts", uid), {
      userId: uid,
      status: "read",
      deliveredAt: timestamp,
      readAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
  }
  batch.update(conversationInboxRef(uid, conversationId), {
    unreadCount: 0,
    updatedAt: timestamp,
  });
  if (latestMessageId && unreadIncoming.some(item => item.id === latestMessageId) && conversationMembers.length <= 2) {
    batch.update(conversationRef(conversationId), {
      lastMessageStatus: "read",
      updatedAt: timestamp,
    });
    for (const memberId of conversationMembers) {
      batch.update(conversationInboxRef(memberId, conversationId), {
        lastMessageStatus: "read",
        updatedAt: timestamp,
      });
    }
  }
  await batch.commit();
}

async function markLatestMessageDelivered(conversation: FirebaseConversationListItem, uid: string) {
  if (!conversation.lastMessageId) return;
  if (!conversation.memberIds.includes(uid)) return;
  if (!conversation.lastMessageSenderId || conversation.lastMessageSenderId === uid) return;

  const db = getFirestoreDb();
  const messageRef = doc(db, "conversations", conversation.id, "messages", conversation.lastMessageId);
  const snapshot = await getDoc(messageRef);
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  const deliveredTo = Array.isArray(data.deliveredTo) ? data.deliveredTo.map(String) : [];
  const readBy = Array.isArray(data.readBy) ? data.readBy.map(String) : [];
  if (deliveredTo.includes(uid) || readBy.includes(uid)) return;

  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(messageRef, {
    deliveredTo: arrayUnion(uid),
    receiptUpdatedAt: timestamp,
  });
  batch.set(doc(messageRef, "receipts", uid), {
    userId: uid,
    status: "delivered",
    deliveredAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  if (conversation.memberIds.length <= 2) {
    batch.update(conversationRef(conversation.id), {
      lastMessageStatus: "delivered",
      updatedAt: timestamp,
    });
    for (const memberId of conversation.memberIds) {
      batch.update(conversationInboxRef(memberId, conversation.id), {
        lastMessageStatus: "delivered",
        updatedAt: timestamp,
      });
    }
  }
  await batch.commit();
}

export async function createFirebaseConversation(input: CreateConversationInput) {
  const db = getFirestoreDb();
  const memberIds = uniqueMembers(input.memberIds);
  if (!memberIds.length) throw new Error("A conversation needs at least one member");
  const kind = input.kind ?? "direct";
  if (kind === "direct" && memberIds.length !== 2) {
    throw new Error("Choose another user to start a chat.");
  }

  const timestamp = serverTimestamp();
  const code = kind === "group" ? inviteCode() : null;
  const payload = {
    kind,
    title: input.title ?? null,
    memberIds,
    directKey: kind === "direct" ? memberIds.join("__") : null,
    inviteCode: code,
    storefrontId: input.storefrontId ?? null,
    storefrontSlug: input.storefrontSlug ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: null,
    lastMessageSenderId: null,
    lastMessagePreview: "",
  };

  const conversationDoc = kind === "direct"
    ? doc(db, "conversations", `direct_${memberIds.join("__")}`)
    : doc(collection(db, "conversations"));
  const conversationId = conversationDoc.id;
  const batch = writeBatch(db);
  batch.set(conversationDoc, kind === "direct" ? payload : { ...payload, directKey: null }, { merge: kind === "direct" });
  for (const memberId of memberIds) {
    batch.set(conversationInboxRef(memberId, conversationId), inboxPayload({
      conversationId,
      kind,
      title: input.title ?? null,
      memberIds,
      lastMessageAt: timestamp,
      lastMessageId: null,
      lastMessageSenderId: null,
      lastMessagePreview: "",
      storefrontId: input.storefrontId ?? null,
      storefrontSlug: input.storefrontSlug ?? null,
      inviteCode: code,
    }), { merge: true });
  }
  if (code) {
    batch.set(conversationInviteRef(code), {
      conversationId,
      kind,
      title: input.title ?? null,
      inviteCode: code,
      createdByUserId: input.createdByUserId ?? memberIds[0],
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  await batch.commit();

  return conversationId;
}

export async function sendFirebaseMessage(input: {
  conversationId: string;
  senderId: string;
  memberIds?: string[];
  body: string;
  status?: FirebaseMessageStatus;
  attachmentPath?: string | null;
  storyId?: string | null;
  replyTo?: FirebaseMessage["replyTo"];
  memoryPrompt?: string | null;
}) {
  const db = getFirestoreDb();
  const body = input.body.trim();
  if (!body && !input.attachmentPath) throw new Error("Write a message first");
  const conversationSnapshot = await getDoc(conversationRef(input.conversationId));
  const conversationData = conversationSnapshot?.data() as DocumentData | undefined;
  const memberIds = uniqueMembers(input.memberIds?.length ? input.memberIds : (Array.isArray(conversationData?.memberIds) ? conversationData.memberIds.map(String) : [input.senderId]));
  const kind = (conversationData?.kind as FirebaseConversationKind | undefined) ?? "direct";
  const title = typeof conversationData?.title === "string" ? conversationData.title : null;
  const timestamp = serverTimestamp();
  const messageRef = doc(collection(db, "conversations", input.conversationId, "messages"));
  const batch = writeBatch(db);

  batch.set(messageRef, {
    senderId: input.senderId,
    memberIds,
    body,
    attachmentPath: input.attachmentPath ?? null,
    storyId: input.storyId ?? null,
    status: input.status ?? "sent",
    deliveredTo: [input.senderId],
    readBy: [input.senderId],
    replyToMessageId: input.replyTo?.messageId ?? null,
    replyToSenderId: input.replyTo?.senderUserId ?? null,
    replyToSnippet: input.replyTo?.snippet ? messageSnippet(input.replyTo.snippet) : null,
    reactions: {},
    savedBy: [],
    pinnedBy: [],
    memoryPrompt: input.memoryPrompt ?? null,
    createdAt: timestamp,
  });

  batch.update(conversationRef(input.conversationId), {
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: messageRef.id,
    lastMessageSenderId: input.senderId,
    lastMessagePreview: body || "Attachment",
    lastMessageStatus: input.status ?? "sent",
  });
  for (const memberId of memberIds) {
    batch.set(conversationInboxRef(memberId, input.conversationId), inboxPayload({
      conversationId: input.conversationId,
      kind,
      title,
      memberIds,
      lastMessageAt: timestamp,
      lastMessageId: messageRef.id,
      lastMessageSenderId: input.senderId,
      lastMessagePreview: body || "Attachment",
      lastMessageStatus: input.status ?? "sent",
      unreadCount: memberId === input.senderId ? 0 : increment(1),
      storefrontId: typeof conversationData?.storefrontId === "string" ? conversationData.storefrontId : null,
      storefrontSlug: typeof conversationData?.storefrontSlug === "string" ? conversationData.storefrontSlug : null,
      inviteCode: typeof conversationData?.inviteCode === "string" ? conversationData.inviteCode : null,
    }), { merge: true });
  }
  await batch.commit();
}

export async function listFirebaseConversations(user?: AppUser | null) {
  if (!user) return [];
  const blockedUserIds = new Set(await listFirebaseBlockedUserIds(user));
  const snapshot = await getDocs(conversationInboxQuery(user.id));
  return snapshot.docs
    .map(item => mapConversation(item.id, item.data(), user.id))
    .filter(conversation => {
      const peerId = getConversationPeerId(conversation, user.id);
      return !peerId || !blockedUserIds.has(peerId);
    })
    .sort((left, right) => new Date(right.lastMessageAt ?? 0).getTime() - new Date(left.lastMessageAt ?? 0).getTime());
}

export async function listFirebaseMessages(conversationId?: string | null, user?: AppUser | null) {
  if (!conversationId || !user) return [];
  const snapshot = await getDocs(messagesQuery(conversationId, user.id));
  return snapshot.docs
    .map(item => mapMessage(item.id, item.data(), user.id))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export async function sendFirebaseAttachment(input: {
  conversationId: string;
  sender: AppUser;
  memberIds?: string[];
  file: File;
  replyTo?: FirebaseMessage["replyTo"];
}) {
  const path = `conversations/${input.conversationId}/${input.sender.id}/${storageName(input.file)}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, input.file, { contentType: input.file.type });
  const url = await getDownloadURL(storageRef);
  const db = getFirestoreDb();
  const conversationSnapshot = await getDoc(conversationRef(input.conversationId));
  const conversationData = conversationSnapshot.data() as DocumentData | undefined;
  const memberIds = uniqueMembers(input.memberIds?.length ? input.memberIds : (Array.isArray(conversationData?.memberIds) ? conversationData.memberIds.map(String) : [input.sender.id]));
  const kind = (conversationData?.kind as FirebaseConversationKind | undefined) ?? "direct";
  const title = typeof conversationData?.title === "string" ? conversationData.title : null;
  const timestamp = serverTimestamp();
  const messageRef = doc(collection(db, "conversations", input.conversationId, "messages"));
  const batch = writeBatch(db);

  batch.set(messageRef, {
    senderId: input.sender.id,
    memberIds,
    body: "",
    attachmentPath: path,
    attachmentUrl: url,
    attachmentName: input.file.name,
    attachmentMimeType: input.file.type,
    attachmentSize: input.file.size,
    status: "sent",
    deliveredTo: [input.sender.id],
    readBy: [input.sender.id],
    replyToMessageId: input.replyTo?.messageId ?? null,
    replyToSenderId: input.replyTo?.senderUserId ?? null,
    replyToSnippet: input.replyTo?.snippet ? messageSnippet(input.replyTo.snippet) : null,
    reactions: {},
    savedBy: [],
    pinnedBy: [],
    memoryPrompt: null,
    createdAt: timestamp,
  });

  batch.update(conversationRef(input.conversationId), {
    updatedAt: timestamp,
    lastMessageAt: timestamp,
    lastMessageId: messageRef.id,
    lastMessageSenderId: input.sender.id,
    lastMessagePreview: input.file.name,
    lastMessageStatus: "sent",
  });
  for (const memberId of memberIds) {
    batch.set(conversationInboxRef(memberId, input.conversationId), inboxPayload({
      conversationId: input.conversationId,
      kind,
      title,
      memberIds,
      lastMessageAt: timestamp,
      lastMessageId: messageRef.id,
      lastMessageSenderId: input.sender.id,
      lastMessagePreview: input.file.name,
      lastMessageStatus: "sent",
      unreadCount: memberId === input.sender.id ? 0 : increment(1),
      storefrontId: typeof conversationData?.storefrontId === "string" ? conversationData.storefrontId : null,
      storefrontSlug: typeof conversationData?.storefrontSlug === "string" ? conversationData.storefrontSlug : null,
      inviteCode: typeof conversationData?.inviteCode === "string" ? conversationData.inviteCode : null,
    }), { merge: true });
  }
  await batch.commit();
}

export async function joinFirebaseConversationInvite(user: AppUser, code: string) {
  const normalizedCode = code.trim();
  if (!normalizedCode) throw new Error("Invite link is missing a code.");
  const db = getFirestoreDb();
  const inviteSnapshot = await getDoc(conversationInviteRef(normalizedCode));
  if (!inviteSnapshot.exists()) throw new Error("This invite link is no longer available.");
  const invite = inviteSnapshot.data() as FirebaseConversationInviteDoc;
  if (!invite.active || invite.kind !== "group" || !invite.conversationId) {
    throw new Error("This invite link is no longer available.");
  }

  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.update(conversationRef(invite.conversationId), {
    memberIds: arrayUnion(user.id),
    updatedAt: timestamp,
  });
  batch.set(conversationInboxRef(user.id, invite.conversationId), inboxPayload({
    conversationId: invite.conversationId,
    kind: "group",
    title: typeof invite.title === "string" ? invite.title : "Group chat",
    memberIds: [user.id],
    lastMessageAt: timestamp,
    lastMessageId: null,
    lastMessageSenderId: null,
    lastMessagePreview: "",
    lastMessageStatus: null,
    inviteCode: normalizedCode,
  }), { merge: true });
  await batch.commit();

  const conversationSnapshot = await getDoc(conversationRef(invite.conversationId));
  const conversationData = conversationSnapshot.data() as DocumentData | undefined;
  const memberIds = Array.isArray(conversationData?.memberIds) ? conversationData.memberIds.map(String) : [user.id];
  await updateDoc(conversationInboxRef(user.id, invite.conversationId), {
    memberIds,
    title: typeof conversationData?.title === "string" ? conversationData.title : invite.title ?? "Group chat",
    updatedAt: serverTimestamp(),
  });

  return invite.conversationId;
}

export async function toggleFirebaseMessageReaction(input: {
  conversationId: string;
  messageId: string;
  userId: string;
  reaction: FirebaseMessageReactionKey;
  active: boolean;
}) {
  const reactionAllowed = FIREBASE_MESSAGE_REACTIONS.some(item => item.key === input.reaction);
  if (!reactionAllowed) throw new Error("Choose a supported reaction.");
  const db = getFirestoreDb();
  const batch = writeBatch(db);
  batch.update(doc(db, "conversations", input.conversationId, "messages", input.messageId), {
    [`reactions.${input.reaction}`]: input.active ? arrayRemove(input.userId) : arrayUnion(input.userId),
    reactionUpdatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function toggleFirebaseMessagePin(input: {
  conversationId: string;
  messageId: string;
  userId: string;
  active: boolean;
}) {
  await updateDoc(doc(getFirestoreDb(), "conversations", input.conversationId, "messages", input.messageId), {
    pinnedBy: input.active ? arrayRemove(input.userId) : arrayUnion(input.userId),
    pinnedAt: input.active ? null : serverTimestamp(),
  });
}

export async function saveFirebaseMessageMemory(input: {
  user: AppUser;
  conversationId: string;
  conversationTitle: string;
  message: FirebaseMessage;
}) {
  const db = getFirestoreDb();
  const timestamp = serverTimestamp();
  const snippet = messageSnippet(input.message.contentType === "attachment" ? "Private attachment" : input.message.payload);
  const followUp = inferSavannaFollowUp(snippet, input.message.createdAt);
  const tags = Array.from(new Set([
    ...inferSavannaMemoryTags(snippet),
    ...(followUp.action ? ["follow_up" as const] : []),
  ]));
  const ai = await enrichMemoryWithEmbeddingGemma(`${input.conversationTitle} ${snippet}`);
  const aiFields = ai ? {
    embedding: ai.embedding,
    embeddingModel: ai.embeddingModel,
    embeddingProvider: ai.embeddingProvider,
    embeddingDimensions: ai.embeddingDimensions,
    embeddingUpdatedAt: timestamp,
    semanticSummary: ai.semanticSummary,
    languageCode: ai.languageCode,
  } : {};
  const batch = writeBatch(db);
  batch.set(doc(db, "users", input.user.id, "memories", `message_${input.message.id}`), {
    ownerUserId: input.user.id,
    sourceType: "message",
    conversationId: input.conversationId,
    conversationTitle: input.conversationTitle,
    messageId: input.message.id,
    senderUserId: input.message.senderUserId,
    storyId: null,
    storyAuthorUserId: null,
    storyAuthorName: null,
    storyHref: null,
    storefrontId: null,
    storefrontSlug: null,
    storefrontName: null,
    communityId: null,
    communityName: null,
    productName: null,
    productDescription: null,
    productPriceMinor: null,
    productCurrencyCode: null,
    snippet,
    tags,
    followUpAt: followUp.dueAt,
    followUpLabel: followUp.label,
    followUpAction: followUp.action,
    followUpCompletedAt: null,
    ...aiFields,
    sourceCreatedAt: input.message.createdAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  batch.update(doc(db, "conversations", input.conversationId, "messages", input.message.id), {
    savedBy: arrayUnion(input.user.id),
    memoryPrompt: snippet,
    memoryUpdatedAt: timestamp,
  });
  await batch.commit();
}

export async function listFirebaseMessageMemories(user?: AppUser | null): Promise<FirebaseMessageMemory[]> {
  if (!user) return [];
  const snapshot = await getDocs(messageMemoriesQuery(user.id));
  return snapshot.docs
    .map(item => mapMessageMemory(item.id, item.data()))
    .filter(memory => memory.ownerUserId === user.id && memory.snippet)
    .filter(memory => memory.sourceType === "story" ? Boolean(memory.storyId) : Boolean(memory.conversationId && memory.messageId));
}

export async function deleteFirebaseMessageMemory(input: {
  user: AppUser;
  memory: FirebaseMessageMemory;
}) {
  const db = getFirestoreDb();
  await deleteDoc(doc(db, "users", input.user.id, "memories", input.memory.id));
  if (input.memory.sourceType === "story" && input.memory.storyId) {
    await deleteDoc(doc(db, "stories", input.memory.storyId, "reactions", `${input.user.id}_save`)).catch(error => {
      console.warn("[Firestore] Removed story memory but could not remove save signal", error);
    });
    return;
  }
  if (input.memory.conversationId && input.memory.messageId) {
    await updateDoc(doc(db, "conversations", input.memory.conversationId, "messages", input.memory.messageId), {
      savedBy: arrayRemove(input.user.id),
      memoryUpdatedAt: serverTimestamp(),
    }).catch(error => {
      console.warn("[Firestore] Removed memory but could not update source message", error);
    });
  }
}

export async function completeFirebaseMessageFollowUp(input: {
  user: AppUser;
  memory: FirebaseMessageMemory;
}) {
  await updateDoc(doc(getFirestoreDb(), "users", input.user.id, "memories", input.memory.id), {
    followUpCompletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function snoozeFirebaseMessageFollowUp(input: {
  user: AppUser;
  memory: FirebaseMessageMemory;
  days?: number;
}) {
  const days = Math.max(1, Math.min(input.days ?? 1, 14));
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + days);
  dueAt.setHours(9, 0, 0, 0);
  await updateDoc(doc(getFirestoreDb(), "users", input.user.id, "memories", input.memory.id), {
    tags: Array.from(new Set([...input.memory.tags, "follow_up"])),
    followUpAt: dueAt,
    followUpLabel: days === 1 ? "Tomorrow" : `In ${days} days`,
    followUpAction: input.memory.followUpAction || input.memory.snippet,
    followUpCompletedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function clearFirebaseMessageFollowUp(input: {
  user: AppUser;
  memory: FirebaseMessageMemory;
}) {
  await updateDoc(doc(getFirestoreDb(), "users", input.user.id, "memories", input.memory.id), {
    tags: input.memory.tags.filter(tag => tag !== "follow_up"),
    followUpAt: null,
    followUpLabel: null,
    followUpAction: null,
    followUpCompletedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function createSupportConversation(input: {
  viewer: AppUser;
  ownerUserId: string;
  storefrontId: string;
  storefrontSlug: string;
  storefrontName: string;
}) {
  const conversationId = await createFirebaseConversation({
    kind: "merchant_support",
    title: input.storefrontName,
    memberIds: [input.viewer.id, input.ownerUserId],
    storefrontId: input.storefrontId,
    storefrontSlug: input.storefrontSlug,
  });

  await sendFirebaseMessage({
    conversationId,
    senderId: input.viewer.id,
    memberIds: [input.viewer.id, input.ownerUserId],
    body: `I have a question about ${input.storefrontName}.`,
  });

  return conversationId;
}

export function useFirebaseConversations(user?: AppUser | null) {
  const queryClient = useQueryClient();
  const uid = user?.id ?? null;
  const queryKey = chatKeys.conversations(uid);
  const deliveredKeys = useRef(new Set<string>());
  const blockedUserIdsRef = useRef(new Set<string>());
  useEffect(() => {
    let cancelled = false;
    void listFirebaseBlockedUserIds(user).then(ids => {
      if (!cancelled) blockedUserIdsRef.current = new Set(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      conversationInboxQuery(uid),
      snapshot => {
        const nextConversations = snapshot.docs
          .map(item => mapConversation(item.id, item.data(), uid))
          .filter(conversation => {
            const peerId = getConversationPeerId(conversation, uid);
            return !peerId || !blockedUserIdsRef.current.has(peerId);
          })
          .sort((left, right) => new Date(right.lastMessageAt ?? 0).getTime() - new Date(left.lastMessageAt ?? 0).getTime());
        queryClient.setQueryData(
          chatKeys.conversations(uid),
          nextConversations,
        );
        for (const conversation of nextConversations) {
          const deliveryKey = `${conversation.id}:${conversation.lastMessageId ?? ""}:${uid}`;
          if (!conversation.lastMessageId || deliveredKeys.current.has(deliveryKey)) continue;
          deliveredKeys.current.add(deliveryKey);
          void markLatestMessageDelivered(conversation, uid).catch(error => {
            deliveredKeys.current.delete(deliveryKey);
            console.error("[Firestore] Failed to mark message delivered", error);
          });
        }
      },
      error => {
        console.error("[Firestore] Conversation inbox listener failed", error);
      },
    );
  }, [queryClient, uid]);

  return useQuery({
    queryKey,
    queryFn: () => listFirebaseConversations(user),
    enabled: Boolean(user),
  });
}

export function useFirebaseMessages(conversationId?: string | null, user?: AppUser | null, enabled = true) {
  const queryClient = useQueryClient();
  const uid = user?.id ?? null;
  const queryKey = chatKeys.messages(conversationId);
  useEffect(() => {
    if (!enabled || !conversationId || !uid) return;
    let receiptTimer: number | null = null;
    const unsubscribe = onSnapshot(
      messagesQuery(conversationId, uid),
      snapshot => {
        const nextMessages = snapshot.docs
          .map(item => mapMessage(item.id, item.data(), uid))
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
        queryClient.setQueryData(chatKeys.messages(conversationId), nextMessages);
        if (document.visibilityState !== "visible") return;
        if (receiptTimer) window.clearTimeout(receiptTimer);
        receiptTimer = window.setTimeout(() => {
          if (document.visibilityState !== "visible") return;
          void markVisibleMessagesRead(conversationId, uid, snapshot.docs).catch(error => {
            console.error("[Firestore] Failed to mark messages read", error);
          });
        }, 600);
      },
      error => {
        console.error("[Firestore] Message listener failed", error);
      },
    );
    return () => {
      if (receiptTimer) window.clearTimeout(receiptTimer);
      unsubscribe();
    };
  }, [conversationId, enabled, queryClient, uid]);

  return useQuery({
    queryKey,
    queryFn: () => listFirebaseMessages(conversationId, user),
    enabled: enabled && Boolean(conversationId && user),
  });
}

export function useFirebaseMessageMemories(user?: AppUser | null) {
  return useQuery({
    queryKey: chatKeys.memories(user?.id),
    queryFn: () => listFirebaseMessageMemories(user),
    enabled: Boolean(user),
  });
}

export function useFirebaseMessageMemoryMutations(user?: AppUser | null) {
  const queryClient = useQueryClient();
  const invalidateMemories = (memory?: FirebaseMessageMemory) => {
    queryClient.invalidateQueries({ queryKey: chatKeys.memories(user?.id) });
    if (memory?.conversationId) queryClient.invalidateQueries({ queryKey: chatKeys.messages(memory.conversationId) });
  };

  return {
    completeFollowUp: useMutation({
      mutationFn: async (memory: FirebaseMessageMemory) => {
        if (!user) throw new Error("Sign in to manage follow-ups");
        await completeFirebaseMessageFollowUp({ user, memory });
      },
      onSuccess: (_result, memory) => invalidateMemories(memory),
    }),
    snoozeFollowUp: useMutation({
      mutationFn: async (input: { memory: FirebaseMessageMemory; days?: number }) => {
        if (!user) throw new Error("Sign in to manage follow-ups");
        await snoozeFirebaseMessageFollowUp({ user, memory: input.memory, days: input.days });
      },
      onSuccess: (_result, input) => invalidateMemories(input.memory),
    }),
    clearFollowUp: useMutation({
      mutationFn: async (memory: FirebaseMessageMemory) => {
        if (!user) throw new Error("Sign in to manage follow-ups");
        await clearFirebaseMessageFollowUp({ user, memory });
      },
      onSuccess: (_result, memory) => invalidateMemories(memory),
    }),
    remove: useMutation({
      mutationFn: async (memory: FirebaseMessageMemory) => {
        if (!user) throw new Error("Sign in to manage memories");
        await deleteFirebaseMessageMemory({ user, memory });
      },
      onSuccess: (_result, memory) => invalidateMemories(memory),
    }),
  };
}

export function useFirebaseChatMutations(user?: AppUser | null) {
  const queryClient = useQueryClient();
  const invalidateConversation = (conversationId?: string | null) => {
    queryClient.invalidateQueries({ queryKey: chatKeys.conversations(user?.id) });
    if (conversationId) queryClient.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
  };

  return {
    create: useMutation({
      mutationFn: async (input: Omit<CreateConversationInput, "memberIds"> & { memberIds: string[] }) => {
        if (!user) throw new Error("Sign in to create a chat");
        return createFirebaseConversation({ ...input, createdByUserId: user.id, memberIds: uniqueMembers([user.id, ...input.memberIds]) });
      },
      onSuccess: conversationId => invalidateConversation(conversationId),
    }),
    joinInvite: useMutation({
      mutationFn: async (code: string) => {
        if (!user) throw new Error("Sign in to join this group");
        return joinFirebaseConversationInvite(user, code);
      },
      onSuccess: conversationId => invalidateConversation(conversationId),
    }),
    send: useMutation({
      mutationFn: async (input: { conversationId: string; memberIds: string[]; body: string; replyTo?: FirebaseMessage["replyTo"] }) => {
        if (!user) throw new Error("Sign in to send a message");
        await sendFirebaseMessage({ conversationId: input.conversationId, senderId: user.id, memberIds: input.memberIds, body: input.body, replyTo: input.replyTo });
      },
      onSuccess: (_result, input) => invalidateConversation(input.conversationId),
    }),
    sendAttachment: useMutation({
      mutationFn: async (input: { conversationId: string; memberIds: string[]; file: File; replyTo?: FirebaseMessage["replyTo"] }) => {
        if (!user) throw new Error("Sign in to send an attachment");
        await sendFirebaseAttachment({ conversationId: input.conversationId, sender: user, memberIds: input.memberIds, file: input.file, replyTo: input.replyTo });
      },
      onSuccess: (_result, input) => invalidateConversation(input.conversationId),
    }),
    react: useMutation({
      mutationFn: async (input: { conversationId: string; messageId: string; reaction: FirebaseMessageReactionKey; active: boolean }) => {
        if (!user) throw new Error("Sign in to react");
        await toggleFirebaseMessageReaction({ ...input, userId: user.id });
      },
      onSuccess: (_result, input) => invalidateConversation(input.conversationId),
    }),
    pin: useMutation({
      mutationFn: async (input: { conversationId: string; messageId: string; active: boolean }) => {
        if (!user) throw new Error("Sign in to pin messages");
        await toggleFirebaseMessagePin({ ...input, userId: user.id });
      },
      onSuccess: (_result, input) => invalidateConversation(input.conversationId),
    }),
    saveMemory: useMutation({
      mutationFn: async (input: { conversationId: string; conversationTitle: string; message: FirebaseMessage }) => {
        if (!user) throw new Error("Sign in to save memories");
        await saveFirebaseMessageMemory({ ...input, user });
      },
      onSuccess: (_result, input) => {
        invalidateConversation(input.conversationId);
        queryClient.invalidateQueries({ queryKey: chatKeys.memories(user?.id) });
      },
    }),
  };
}

export async function replyToStoryInFirebase(input: {
  viewer: AppUser;
  storyAuthorUserId: string;
  storyId: string;
  body: string;
}) {
  const conversationId = await createFirebaseConversation({
    kind: "direct",
    title: null,
    memberIds: [input.viewer.id, input.storyAuthorUserId],
  });

  await sendFirebaseMessage({
    conversationId,
    senderId: input.viewer.id,
    memberIds: [input.viewer.id, input.storyAuthorUserId],
    body: input.body.trim(),
    storyId: input.storyId,
  });

  return conversationId;
}
