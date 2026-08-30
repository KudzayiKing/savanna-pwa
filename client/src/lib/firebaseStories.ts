import type { AppUser } from "@/lib/userProfile";
import { createDiscoveryBadge, type DiscoveryBadge } from "@shared/discovery";
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
  setDoc,
  Timestamp,
  where,
  type FieldValue,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage, getFirestoreDb } from "./firebase";
import { replyToStoryInFirebase } from "./firebaseChat";

export type FirebaseStoryAudience = "public" | "custom" | "private";
export type FirebaseStoryMedia = {
  id: string;
  path: string;
  url: string;
  mimeType: string;
  type: "image" | "video";
};

export type FirebaseStory = {
  id: string;
  authorUserId: string;
  authorName: string;
  authorCity: string | null;
  authorCountryCode: string | null;
  textBody: string | null;
  audience: FirebaseStoryAudience;
  customAudienceUserIds: string[];
  createdAt: Date;
  publishedAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
  isMemory: boolean;
  storefrontId: string | null;
  storefrontSlug: string | null;
  storefrontName: string | null;
  productName: string | null;
  productDescription: string | null;
  productPriceMinor: number | null;
  productCurrencyCode: string | null;
  discovery: DiscoveryBadge;
  media: FirebaseStoryMedia[];
  primaryMediaUrl: string | null;
  primaryMediaType: "image" | "video" | null;
};

export type FirebaseStoryComment = {
  id: string;
  userId: string;
  userName: string;
  userPhotoURL: string | null;
  body: string;
  createdAt: Date;
};

type StoryDoc = Omit<
  FirebaseStory,
  "id" | "createdAt" | "publishedAt" | "expiresAt" | "deletedAt" | "discovery"
> & {
  createdAt?: Timestamp | Date | FieldValue | null;
  publishedAt?: Timestamp | Date | FieldValue | null;
  expiresAt?: Timestamp | Date | FieldValue | null;
  deletedAt?: Timestamp | Date | FieldValue | null;
};

type PublishStoryInput = {
  textBody?: string;
  audience: FirebaseStoryAudience;
  customAudienceUserIds?: string[];
  saveToMemories?: boolean;
  storefrontId?: string;
  storefrontSlug?: string | null;
  storefrontName?: string | null;
  productName?: string;
  productDescription?: string;
  productPriceMinor?: number;
  productCurrencyCode?: string;
  file?: File | null;
};

type StoryCommentDoc = {
  userId?: string | null;
  userName?: string | null;
  userPhotoURL?: string | null;
  body?: string | null;
  createdAt?: Timestamp | Date | FieldValue | null;
};

const storiesKey = ["firebase", "stories"] as const;

function asDate(value: unknown, fallback = new Date()) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return fallback;
}

function mediaType(mimeType: string): "image" | "video" {
  return mimeType.startsWith("video/") ? "video" : "image";
}

function storyMediaPath(uid: string, storyId: string, file: File) {
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const nonce = crypto.randomUUID();
  return `stories/${uid}/${storyId}/${nonce}.${extension}`;
}

function canSeeStory(story: FirebaseStory, user?: AppUser | null) {
  if (story.audience === "public") return true;
  if (!user) return false;
  if (story.authorUserId === user.id) return true;
  return story.audience === "custom" && story.customAudienceUserIds.includes(user.id);
}

function mapStory(id: string, data: StoryDoc, viewer?: AppUser | null): FirebaseStory {
  const media = data.media ?? [];
  const primaryMedia = media[0] ?? null;
  const publishedAt = asDate(data.publishedAt, new Date());
  const story: FirebaseStory = {
    id,
    authorUserId: data.authorUserId,
    authorName: data.authorName || "Savanna user",
    authorCity: data.authorCity ?? null,
    authorCountryCode: data.authorCountryCode ?? null,
    textBody: data.textBody ?? null,
    audience: data.audience ?? "public",
    customAudienceUserIds: data.customAudienceUserIds ?? [],
    createdAt: asDate(data.createdAt, publishedAt),
    publishedAt,
    expiresAt: asDate(data.expiresAt, new Date(publishedAt.getTime() + 86_400_000)),
    deletedAt: data.deletedAt ? asDate(data.deletedAt) : null,
    isMemory: Boolean(data.isMemory),
    storefrontId: data.storefrontId ?? null,
    storefrontSlug: data.storefrontSlug ?? null,
    storefrontName: data.storefrontName ?? null,
    productName: data.productName ?? null,
    productDescription: data.productDescription ?? null,
    productPriceMinor: data.productPriceMinor ?? null,
    productCurrencyCode: data.productCurrencyCode ?? null,
    media,
    primaryMediaUrl: primaryMedia?.url ?? null,
    primaryMediaType: primaryMedia?.type ?? null,
    discovery: createDiscoveryBadge({
      surface: "stories",
      viewerUserId: viewer?.id ?? null,
      ownerUserId: data.authorUserId,
      viewerCity: viewer?.city,
      viewerCountryCode: viewer?.countryCode,
      itemCity: data.authorCity,
      itemCountryCode: data.authorCountryCode,
      isProductMemory: Boolean(data.storefrontId && data.isMemory),
      title: data.productName ?? data.authorName,
      description: data.productDescription ?? data.textBody,
    }),
  };

  return story;
}

function mapStoryComment(id: string, data: StoryCommentDoc): FirebaseStoryComment {
  return {
    id,
    userId: data.userId ?? "",
    userName: data.userName ?? "Savanna user",
    userPhotoURL: data.userPhotoURL ?? null,
    body: data.body ?? "",
    createdAt: asDate(data.createdAt),
  };
}

export async function listFirebaseStories(user?: AppUser | null) {
  const db = getFirestoreDb();
  const now = new Date();
  const seen = new Map<string, FirebaseStory>();
  const queries = [
    query(collection(db, "stories"), where("audience", "==", "public"), orderBy("publishedAt", "desc"), limit(60)),
  ];

  if (user) {
    queries.push(query(collection(db, "stories"), where("authorUserId", "==", user.id), orderBy("publishedAt", "desc"), limit(60)));
    queries.push(query(collection(db, "stories"), where("audience", "==", "custom"), where("customAudienceUserIds", "array-contains", user.id), orderBy("publishedAt", "desc"), limit(60)));
  }

  const snapshots = await Promise.all(queries.map(item => getDocs(item)));
  for (const snapshot of snapshots) {
    for (const item of snapshot.docs) {
      const story = mapStory(item.id, item.data() as StoryDoc, user);
      const stillActive = story.isMemory || story.expiresAt.getTime() > now.getTime();
      if (!story.deletedAt && stillActive && canSeeStory(story, user)) seen.set(story.id, story);
    }
  }

  return Array.from(seen.values()).sort((left, right) => right.discovery.score - left.discovery.score || right.publishedAt.getTime() - left.publishedAt.getTime());
}

export function filterStoriesForFollowingHeader(stories: FirebaseStory[] = [], user?: AppUser | null, followedUserIds: string[] = []) {
  const following = new Set(followedUserIds);
  return stories.filter(story => story.authorUserId === user?.id || following.has(story.authorUserId));
}

export async function listFirebaseStoriesForAuthor(authorUserId: string, viewer?: AppUser | null) {
  const ownProfile = viewer?.id === authorUserId;
  const storyQuery = ownProfile
    ? query(collection(getFirestoreDb(), "stories"), where("authorUserId", "==", authorUserId), orderBy("publishedAt", "desc"), limit(80))
    : query(collection(getFirestoreDb(), "stories"), where("authorUserId", "==", authorUserId), where("audience", "==", "public"), orderBy("publishedAt", "desc"), limit(80));
  const snapshot = await getDocs(storyQuery);
  const now = new Date();
  return snapshot.docs
    .map(item => mapStory(item.id, item.data() as StoryDoc, viewer))
    .filter(story => !story.deletedAt)
    .filter(story => story.audience === "public" || story.authorUserId === viewer?.id)
    .filter(story => story.isMemory || story.expiresAt.getTime() > now.getTime());
}

export async function publishFirebaseStory(user: AppUser, input: PublishStoryInput) {
  const db = getFirestoreDb();
  const now = new Date();
  const expiresAt = input.saveToMemories ? new Date("9999-12-31T23:59:59.999Z") : new Date(now.getTime() + 86_400_000);
  const textBody = input.textBody?.trim() || null;
  const storyRef = await addDoc(collection(db, "stories"), {
    authorUserId: user.id,
    authorName: user.name || "Savanna user",
    authorCity: user.city ?? null,
    authorCountryCode: user.countryCode ?? null,
    textBody,
    audience: input.storefrontId ? "public" : input.audience,
    customAudienceUserIds: input.customAudienceUserIds ?? [],
    media: [],
    primaryMediaUrl: null,
    primaryMediaType: null,
    isMemory: Boolean(input.saveToMemories || input.storefrontId),
    storefrontId: input.storefrontId ?? null,
    storefrontSlug: input.storefrontSlug ?? null,
    storefrontName: input.storefrontName ?? null,
    productName: input.productName?.trim() || null,
    productDescription: input.productDescription?.trim() || null,
    productPriceMinor: input.productPriceMinor ?? null,
    productCurrencyCode: input.productCurrencyCode?.trim().toUpperCase() || null,
    createdAt: serverTimestamp(),
    publishedAt: serverTimestamp(),
    expiresAt,
    deletedAt: null,
  });

  if (!input.file) return storyRef.id;

  const path = storyMediaPath(user.id, storyRef.id, input.file);
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, input.file, { contentType: input.file.type });
  const url = await getDownloadURL(storageRef);
  const media: FirebaseStoryMedia[] = [{ id: crypto.randomUUID(), path, url, mimeType: input.file.type, type: mediaType(input.file.type) }];
  await setDoc(storyRef, {
    media,
    primaryMediaUrl: url,
    primaryMediaType: media[0].type,
  }, { merge: true });

  return storyRef.id;
}

export async function viewFirebaseStory(storyId: string, user: AppUser) {
  await setDoc(doc(getFirestoreDb(), "stories", storyId, "views", user.id), {
    viewerUserId: user.id,
    viewedAt: serverTimestamp(),
  }, { merge: true });
}

export async function reactToFirebaseStory(storyId: string, user: AppUser, emoji: string) {
  await setDoc(doc(getFirestoreDb(), "stories", storyId, "reactions", `${user.id}_${emoji}`), {
    userId: user.id,
    emoji,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

export async function commentOnFirebaseStory(storyId: string, user: AppUser, body: string) {
  const cleanBody = body.trim();
  if (!cleanBody) throw new Error("Write a comment first.");
  if (cleanBody.length > 280) throw new Error("Comments must be 280 characters or fewer.");
  await addDoc(collection(getFirestoreDb(), "stories", storyId, "comments"), {
    userId: user.id,
    userName: user.name || user.username || "Savanna user",
    userPhotoURL: user.photoURL ?? null,
    body: cleanBody,
    createdAt: serverTimestamp(),
  });
}

export async function listFirebaseStoryComments(storyId: string) {
  if (!storyId) return [];
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "stories", storyId, "comments"), orderBy("createdAt", "desc"), limit(40)));
  return snapshot.docs.map(item => mapStoryComment(item.id, item.data() as StoryCommentDoc));
}

export async function replyToFirebaseStory(story: FirebaseStory, user: AppUser, body: string) {
  if (story.authorUserId === user.id) throw new Error("You cannot reply to your own Story");
  return replyToStoryInFirebase({ viewer: user, storyAuthorUserId: story.authorUserId, storyId: story.id, body });
}

export function useFirebaseStories(user?: AppUser | null, enabled = true) {
  return useQuery({
    queryKey: [...storiesKey, user?.id ?? "guest"],
    queryFn: () => listFirebaseStories(user),
    enabled,
  });
}

export function usePublishFirebaseStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ user, input }: { user: AppUser; input: PublishStoryInput }) => publishFirebaseStory(user, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: storiesKey }),
  });
}

export function useViewFirebaseStory() {
  return useMutation({
    mutationFn: ({ storyId, user }: { storyId: string; user: AppUser }) => viewFirebaseStory(storyId, user),
  });
}

export function useReactToFirebaseStory() {
  return useMutation({
    mutationFn: ({ storyId, user, emoji }: { storyId: string; user: AppUser; emoji: string }) => reactToFirebaseStory(storyId, user, emoji),
  });
}

export function useFirebaseStoryComments(storyId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["firebase", "story-comments", storyId ?? ""],
    queryFn: () => listFirebaseStoryComments(storyId ?? ""),
    enabled: enabled && Boolean(storyId),
  });
}

export function useCommentFirebaseStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, user, body }: { storyId: string; user: AppUser; body: string }) => commentOnFirebaseStory(storyId, user, body),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["firebase", "story-comments", variables.storyId] }),
  });
}

export function useReplyToFirebaseStory() {
  return useMutation({
    mutationFn: ({ story, user, body }: { story: FirebaseStory; user: AppUser; body: string }) => replyToFirebaseStory(story, user, body),
  });
}
