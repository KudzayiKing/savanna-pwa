import type { AppUser } from "@/lib/userProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage, getFirestoreDb } from "./firebase";

export type FirebaseConversationKind = "direct" | "group" | "merchant_support";
export type FirebaseMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed" | "deleted";

export type FirebaseConversationListItem = {
  id: string;
  kind: FirebaseConversationKind;
  title: string | null;
  mutedUntil: Date | string | null;
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
    previewMessage: typeof data.lastMessagePreview === "string" ? data.lastMessagePreview : undefined,
    previewStatus: (data.lastMessageStatus as FirebaseMessageStatus | undefined) ?? undefined,
    memberIds: Array.isArray(data.memberIds) ? data.memberIds.map(String) : [],
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

  const conversationRef = await addDoc(collection(db, "conversations"), {
    kind: input.kind ?? "direct",
    title: input.title ?? null,
    memberIds,
    storefrontId: input.storefrontId ?? null,
    storefrontSlug: input.storefrontSlug ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: "",
  });

  return conversationRef.id;
}

export async function sendFirebaseMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  status?: FirebaseMessageStatus;
  attachmentPath?: string | null;
}) {
  const db = getFirestoreDb();
  const body = input.body.trim();
  if (!body && !input.attachmentPath) throw new Error("Write a message first");

  await addDoc(collection(db, "conversations", input.conversationId, "messages"), {
    senderId: input.senderId,
    body,
    attachmentPath: input.attachmentPath ?? null,
    status: input.status ?? "sent",
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "conversations", input.conversationId), {
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: body || "Attachment",
    lastMessageStatus: input.status ?? "sent",
  });
}

export async function listFirebaseConversations(user?: AppUser | null) {
  if (!user) return [];
  const snapshot = await getDocs(
    query(
      collection(getFirestoreDb(), "conversations"),
      where("memberIds", "array-contains", user.id),
      orderBy("lastMessageAt", "desc"),
      limit(80),
    ),
  );
  return snapshot.docs.map(item => mapConversation(item.id, item.data()));
}

export async function listFirebaseMessages(conversationId?: string | null) {
  if (!conversationId) return [];
  const snapshot = await getDocs(
    query(
      collection(getFirestoreDb(), "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc"),
      limit(120),
    ),
  );
  return snapshot.docs.map(item => mapMessage(item.id, item.data()));
}

export async function sendFirebaseAttachment(input: {
  conversationId: string;
  sender: AppUser;
  file: File;
}) {
  const path = `conversations/${input.conversationId}/${input.sender.id}/${storageName(input.file)}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, input.file, { contentType: input.file.type });
  const url = await getDownloadURL(storageRef);
  const db = getFirestoreDb();

  await addDoc(collection(db, "conversations", input.conversationId, "messages"), {
    senderId: input.sender.id,
    body: "",
    attachmentPath: path,
    attachmentUrl: url,
    attachmentName: input.file.name,
    attachmentMimeType: input.file.type,
    attachmentSize: input.file.size,
    status: "sent",
    createdAt: serverTimestamp(),
  });

  await updateDoc(doc(db, "conversations", input.conversationId), {
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    lastMessagePreview: input.file.name,
    lastMessageStatus: "sent",
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

  const db = getFirestoreDb();
  await addDoc(collection(db, "conversations", conversationId, "messages"), {
    senderId: input.viewer.id,
    body: `I have a question about ${input.storefrontName}.`,
    status: "sent",
    createdAt: serverTimestamp(),
  });

  return conversationId;
}

export function useFirebaseConversations(user?: AppUser | null) {
  return useQuery({
    queryKey: chatKeys.conversations(user?.id),
    queryFn: () => listFirebaseConversations(user),
    enabled: Boolean(user),
  });
}

export function useFirebaseMessages(conversationId?: string | null, enabled = true) {
  return useQuery({
    queryKey: chatKeys.messages(conversationId),
    queryFn: () => listFirebaseMessages(conversationId),
    enabled: enabled && Boolean(conversationId),
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
      mutationFn: async (input: { conversationId: string; body: string }) => {
        if (!user) throw new Error("Sign in to send a message");
        await sendFirebaseMessage({ conversationId: input.conversationId, senderId: user.id, body: input.body });
      },
      onSuccess: (_result, input) => invalidateConversation(input.conversationId),
    }),
    sendAttachment: useMutation({
      mutationFn: async (input: { conversationId: string; file: File }) => {
        if (!user) throw new Error("Sign in to send an attachment");
        await sendFirebaseAttachment({ conversationId: input.conversationId, sender: user, file: input.file });
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

  const db = getFirestoreDb();
  await addDoc(collection(db, "conversations", conversationId, "messages"), {
    senderId: input.viewer.id,
    body: input.body.trim(),
    storyId: input.storyId,
    status: "sent",
    createdAt: serverTimestamp(),
  });

  return conversationId;
}
