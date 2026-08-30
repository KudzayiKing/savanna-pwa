import type { AppUser } from "@/lib/userProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useEffect } from "react";
import { getFirebaseStorage, getFirestoreDb } from "./firebase";

export type FirebaseConversationKind = "direct" | "group" | "merchant_support";
export type FirebaseMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed" | "deleted";

export type FirebaseConversationListItem = {
  id: string;
  kind: FirebaseConversationKind;
  title: string | null;
  mutedUntil: Date | string | null;
  lastMessageAt?: Date | string | null;
  previewMessage?: string;
  previewStatus?: FirebaseMessageStatus;
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
};

type CreateConversationInput = {
  memberIds: string[];
  kind?: FirebaseConversationKind;
  title?: string | null;
  storefrontId?: string | null;
  storefrontSlug?: string | null;
};

const chatKeys = {
  conversations: (uid?: string | null) => ["firebase", "conversations", uid ?? "guest"] as const,
  messages: (conversationId?: string | null) => ["firebase", "conversation-messages", conversationId ?? "none"] as const,
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

function mapConversation(id: string, data: DocumentData): FirebaseConversationListItem {
  return {
    id,
    kind: (data.kind as FirebaseConversationKind) ?? "direct",
    title: typeof data.title === "string" ? data.title : null,
    mutedUntil: data.mutedUntil ? toDate(data.mutedUntil) : null,
    lastMessageAt: data.lastMessageAt ? toDate(data.lastMessageAt) : null,
    previewMessage: typeof data.lastMessagePreview === "string" ? data.lastMessagePreview : undefined,
    previewStatus: (data.lastMessageStatus as FirebaseMessageStatus | undefined) ?? undefined,
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
  };
}

function conversationRef(conversationId: string) {
  return doc(getFirestoreDb(), "conversations", conversationId);
}

function conversationInboxRef(memberId: string, conversationId: string) {
  return doc(getFirestoreDb(), "users", memberId, "conversationRefs", conversationId);
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
  lastMessagePreview: string;
  lastMessageStatus?: FirebaseMessageStatus | null;
  storefrontId?: string | null;
  storefrontSlug?: string | null;
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
    lastMessagePreview: input.lastMessagePreview,
    lastMessageStatus: input.lastMessageStatus ?? null,
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

function mapMessage(id: string, data: DocumentData): FirebaseMessage {
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
    status: (data.status as FirebaseMessageStatus | undefined) ?? "sent",
  };
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
  const payload = {
    kind,
    title: input.title ?? null,
    memberIds,
    directKey: kind === "direct" ? memberIds.join("__") : null,
    storefrontId: input.storefrontId ?? null,
    storefrontSlug: input.storefrontSlug ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastMessageAt: timestamp,
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
      lastMessagePreview: "",
      storefrontId: input.storefrontId ?? null,
      storefrontSlug: input.storefrontSlug ?? null,
    }), { merge: true });
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
    createdAt: timestamp,
  });

  batch.update(conversationRef(input.conversationId), {
    updatedAt: timestamp,
    lastMessageAt: timestamp,
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
      lastMessagePreview: body || "Attachment",
      lastMessageStatus: input.status ?? "sent",
      storefrontId: typeof conversationData?.storefrontId === "string" ? conversationData.storefrontId : null,
      storefrontSlug: typeof conversationData?.storefrontSlug === "string" ? conversationData.storefrontSlug : null,
    }), { merge: true });
  }
  await batch.commit();
}

export async function listFirebaseConversations(user?: AppUser | null) {
  if (!user) return [];
  const snapshot = await getDocs(conversationInboxQuery(user.id));
  return snapshot.docs
    .map(item => mapConversation(item.id, item.data()))
    .sort((left, right) => new Date(right.lastMessageAt ?? 0).getTime() - new Date(left.lastMessageAt ?? 0).getTime());
}

export async function listFirebaseMessages(conversationId?: string | null, user?: AppUser | null) {
  if (!conversationId || !user) return [];
  const snapshot = await getDocs(messagesQuery(conversationId, user.id));
  return snapshot.docs
    .map(item => mapMessage(item.id, item.data()))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export async function sendFirebaseAttachment(input: {
  conversationId: string;
  sender: AppUser;
  memberIds?: string[];
  file: File;
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
    createdAt: timestamp,
  });

  batch.update(conversationRef(input.conversationId), {
    updatedAt: timestamp,
    lastMessageAt: timestamp,
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
      lastMessagePreview: input.file.name,
      lastMessageStatus: "sent",
      storefrontId: typeof conversationData?.storefrontId === "string" ? conversationData.storefrontId : null,
      storefrontSlug: typeof conversationData?.storefrontSlug === "string" ? conversationData.storefrontSlug : null,
    }), { merge: true });
  }
  await batch.commit();
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
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      conversationInboxQuery(uid),
      snapshot => {
        queryClient.setQueryData(
          chatKeys.conversations(uid),
          snapshot.docs
            .map(item => mapConversation(item.id, item.data()))
            .sort((left, right) => new Date(right.lastMessageAt ?? 0).getTime() - new Date(left.lastMessageAt ?? 0).getTime()),
        );
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
    return onSnapshot(
      messagesQuery(conversationId, uid),
      snapshot => {
        const nextMessages = snapshot.docs
          .map(item => mapMessage(item.id, item.data()))
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
        queryClient.setQueryData(chatKeys.messages(conversationId), nextMessages);
      },
      error => {
        console.error("[Firestore] Message listener failed", error);
      },
    );
  }, [conversationId, enabled, queryClient, uid]);

  return useQuery({
    queryKey,
    queryFn: () => listFirebaseMessages(conversationId, user),
    enabled: enabled && Boolean(conversationId && user),
  });
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
        return createFirebaseConversation({ ...input, memberIds: uniqueMembers([user.id, ...input.memberIds]) });
      },
      onSuccess: conversationId => invalidateConversation(conversationId),
    }),
    send: useMutation({
      mutationFn: async (input: { conversationId: string; memberIds: string[]; body: string }) => {
        if (!user) throw new Error("Sign in to send a message");
        await sendFirebaseMessage({ conversationId: input.conversationId, senderId: user.id, memberIds: input.memberIds, body: input.body });
      },
      onSuccess: (_result, input) => invalidateConversation(input.conversationId),
    }),
    sendAttachment: useMutation({
      mutationFn: async (input: { conversationId: string; memberIds: string[]; file: File }) => {
        if (!user) throw new Error("Sign in to send an attachment");
        await sendFirebaseAttachment({ conversationId: input.conversationId, sender: user, memberIds: input.memberIds, file: input.file });
      },
      onSuccess: (_result, input) => invalidateConversation(input.conversationId),
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
