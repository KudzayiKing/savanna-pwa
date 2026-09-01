import type { AppUser } from "@/lib/userProfile";
import { createDiscoveryBadge, type DiscoveryBadge } from "@shared/discovery";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type FieldValue,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage, getFirestoreDb } from "./firebase";
import { replyToStoryInFirebase } from "./firebaseChat";
import { listFirebaseBlockedUserIds } from "./firebaseSafety";
import { enrichMemoryWithEmbeddingGemma } from "./gemmaAi";
import { inferSavannaMemoryTags } from "./savannaRecall";

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
  communityId: string | null;
  communityName: string | null;
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

export type FirebaseStoryAnalytics = {
  storyId: string;
  viewCount: number;
  reactionCount: number;
  likeCount: number;
  saveCount: number;
  commentCount: number;
  replyCount: number;
  reactionBreakdown: Record<string, number>;
};

export type FirebaseStoryPlacementAction =
  | "impression"
  | "like"
  | "comment"
  | "reply"
  | "share"
  | "save"
  | "ad_impression"
  | "ad_click";

export type FirebaseStoryPlacementEventInput = {
  user: AppUser;
  placementId: string;
  action: FirebaseStoryPlacementAction;
  tab: string;
  sourceKind: "story" | "community-post" | "ad-slot";
  storyId?: string | null;
  communityId?: string | null;
  storefrontId?: string | null;
  productId?: string | null;
  broadCity?: string | null;
  countryCode?: string | null;
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
  communityId?: string;
  communityName?: string | null;
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

type StoryReactionDoc = {
  emoji?: string | null;
};

type StoryReplySignalDoc = {
  count?: number | null;
};

const storiesKey = ["firebase", "stories"] as const;
const storyCommentsKey = (storyId?: string | null) => ["firebase", "story-comments", storyId ?? ""] as const;
const storyAnalyticsKey = (storyId?: string | null) => ["firebase", "story-analytics", storyId ?? ""] as const;

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
    communityId: data.communityId ?? null,
    communityName: data.communityName ?? null,
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
      title: data.productName ?? data.communityName ?? data.authorName,
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
  const blockedUserIds = new Set(await listFirebaseBlockedUserIds(user));
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
      if (!story.deletedAt && stillActive && canSeeStory(story, user) && !blockedUserIds.has(story.authorUserId)) seen.set(story.id, story);
    }
  }

  return Array.from(seen.values()).sort((left, right) => right.discovery.score - left.discovery.score || right.publishedAt.getTime() - left.publishedAt.getTime());
}

export function filterStoriesForFollowingHeader(stories: FirebaseStory[] = [], user?: AppUser | null, followedUserIds: string[] = []) {
  const following = new Set(followedUserIds);
  return stories.filter(story => story.authorUserId === user?.id || following.has(story.authorUserId));
}

export async function listFirebaseStoriesForAuthor(authorUserId: string, viewer?: AppUser | null) {
  const blockedUserIds = new Set(await listFirebaseBlockedUserIds(viewer));
  if (blockedUserIds.has(authorUserId)) return [];
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

export async function getFirebaseStory(storyId?: string | null, viewer?: AppUser | null) {
  if (!storyId) return null;
  const snapshot = await getDoc(doc(getFirestoreDb(), "stories", storyId));
  if (!snapshot.exists()) return null;
  const story = mapStory(snapshot.id, snapshot.data() as StoryDoc, viewer);
  const blockedUserIds = new Set(await listFirebaseBlockedUserIds(viewer));
  const now = new Date();
  if (story.deletedAt || blockedUserIds.has(story.authorUserId) || (!story.isMemory && story.expiresAt.getTime() <= now.getTime())) return null;
  return canSeeStory(story, viewer) ? story : null;
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
    audience: input.storefrontId || input.communityId ? "public" : input.audience,
    customAudienceUserIds: input.customAudienceUserIds ?? [],
    media: [],
    primaryMediaUrl: null,
    primaryMediaType: null,
    isMemory: Boolean(input.saveToMemories || input.storefrontId),
    storefrontId: input.storefrontId ?? null,
    storefrontSlug: input.storefrontSlug ?? null,
    storefrontName: input.storefrontName ?? null,
    communityId: input.communityId ?? null,
    communityName: input.communityName ?? null,
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
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveFirebaseStoryMemory(story: FirebaseStory, user: AppUser) {
  const db = getFirestoreDb();
  const timestamp = serverTimestamp();
  const storyText = story.textBody || story.productDescription || story.productName || story.communityName || story.storefrontName || "Saved Story";
  const snippet = storyText.trim().replace(/\s+/g, " ").slice(0, 220);
  const tags = Array.from(new Set([
    ...inferSavannaMemoryTags(`${snippet} ${story.productName ?? ""} ${story.storefrontName ?? ""} ${story.communityName ?? ""}`),
    ...(story.productName || story.storefrontId ? ["product" as const] : []),
    ...(story.communityId ? ["recommendation" as const] : []),
  ]));
  const conversationTitle = story.productName
    ? story.productName
    : story.storefrontName
      ? `${story.storefrontName} Story`
      : story.communityName
        ? `${story.communityName} Story`
        : `${story.authorName}'s Story`;
  const ai = await enrichMemoryWithEmbeddingGemma([
    conversationTitle,
    snippet,
    story.productName,
    story.productDescription,
    story.storefrontName,
    story.communityName,
  ].filter(Boolean).join(" "));
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
  batch.set(doc(db, "stories", story.id, "reactions", `${user.id}_save`), {
    userId: user.id,
    emoji: "save",
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  batch.set(doc(db, "users", user.id, "memories", `story_${story.id}`), {
    ownerUserId: user.id,
    sourceType: "story",
    conversationId: "",
    conversationTitle,
    messageId: story.id,
    senderUserId: story.authorUserId,
    storyId: story.id,
    storyAuthorUserId: story.authorUserId,
    storyAuthorName: story.authorName,
    storyHref: `/stories?story=${story.id}`,
    storefrontId: story.storefrontId,
    storefrontSlug: story.storefrontSlug,
    storefrontName: story.storefrontName,
    communityId: story.communityId,
    communityName: story.communityName,
    productName: story.productName,
    productDescription: story.productDescription,
    productPriceMinor: story.productPriceMinor,
    productCurrencyCode: story.productCurrencyCode,
    snippet,
    tags,
    followUpAt: null,
    followUpLabel: null,
    followUpAction: null,
    followUpCompletedAt: null,
    ...aiFields,
    sourceCreatedAt: story.publishedAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  }, { merge: true });
  await batch.commit();
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

export async function listFirebaseStoryComments(storyId: string, user?: AppUser | null) {
  if (!storyId) return [];
  const blockedUserIds = new Set(await listFirebaseBlockedUserIds(user));
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "stories", storyId, "comments"), orderBy("createdAt", "desc"), limit(40)));
  return snapshot.docs.map(item => mapStoryComment(item.id, item.data() as StoryCommentDoc)).filter(comment => !blockedUserIds.has(comment.userId));
}

export async function deleteFirebaseStoryComment(storyId: string, commentId: string) {
  if (!storyId || !commentId) return;
  await deleteDoc(doc(getFirestoreDb(), "stories", storyId, "comments", commentId));
}

export async function getFirebaseStoryAnalytics(story: FirebaseStory, user?: AppUser | null): Promise<FirebaseStoryAnalytics> {
  const zero: FirebaseStoryAnalytics = {
    storyId: story.id,
    viewCount: 0,
    reactionCount: 0,
    likeCount: 0,
    saveCount: 0,
    commentCount: 0,
    replyCount: 0,
    reactionBreakdown: {},
  };
  if (!user || user.id !== story.authorUserId) return zero;

  const db = getFirestoreDb();
  const [viewsSnapshot, reactionsSnapshot, commentsSnapshot, repliesSnapshot] = await Promise.all([
    getDocs(collection(db, "stories", story.id, "views")),
    getDocs(collection(db, "stories", story.id, "reactions")),
    getDocs(collection(db, "stories", story.id, "comments")),
    getDocs(collection(db, "stories", story.id, "replies")),
  ]);
  const reactionBreakdown = reactionsSnapshot.docs.reduce<Record<string, number>>((summary, item) => {
    const emoji = ((item.data() as StoryReactionDoc).emoji || "reaction").trim();
    summary[emoji] = (summary[emoji] ?? 0) + 1;
    return summary;
  }, {});
  const replyCount = repliesSnapshot.docs.reduce((total, item) => {
    const count = (item.data() as StoryReplySignalDoc).count;
    return total + (typeof count === "number" ? count : 1);
  }, 0);

  return {
    storyId: story.id,
    viewCount: viewsSnapshot.size,
    reactionCount: reactionsSnapshot.size,
    likeCount: reactionBreakdown.heart ?? 0,
    saveCount: reactionBreakdown.save ?? 0,
    commentCount: commentsSnapshot.size,
    replyCount,
    reactionBreakdown,
  };
}

export async function replyToFirebaseStory(story: FirebaseStory, user: AppUser, body: string) {
  if (story.authorUserId === user.id) throw new Error("You cannot reply to your own Story");
  const conversationId = await replyToStoryInFirebase({ viewer: user, storyAuthorUserId: story.authorUserId, storyId: story.id, body });
  await setDoc(doc(getFirestoreDb(), "stories", story.id, "replies", user.id), {
    userId: user.id,
    userName: user.name || user.username || "Savanna user",
    userPhotoURL: user.photoURL ?? null,
    count: increment(1),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  return conversationId;
}

export async function logFirebaseStoryPlacementEvent(input: FirebaseStoryPlacementEventInput) {
  await addDoc(collection(getFirestoreDb(), "storyPlacementEvents"), {
    viewerUserId: input.user.id,
    placementId: input.placementId,
    action: input.action,
    tab: input.tab,
    surface: "stories",
    sourceKind: input.sourceKind,
    storyId: input.storyId ?? null,
    communityId: input.communityId ?? null,
    storefrontId: input.storefrontId ?? null,
    productId: input.productId ?? null,
    broadCity: input.broadCity ?? input.user.city ?? null,
    countryCode: input.countryCode ?? input.user.countryCode ?? null,
    createdAt: serverTimestamp(),
  });
}

export function useFirebaseStories(user?: AppUser | null, enabled = true) {
  return useQuery({
    queryKey: [...storiesKey, user?.id ?? "guest"],
    queryFn: () => listFirebaseStories(user),
    enabled,
  });
}

export function useFirebaseStory(storyId?: string | null, user?: AppUser | null) {
  return useQuery({
    queryKey: [...storiesKey, "detail", storyId ?? "", user?.id ?? "guest"],
    queryFn: () => getFirebaseStory(storyId, user),
    enabled: Boolean(storyId),
    retry: false,
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, user, emoji }: { storyId: string; user: AppUser; emoji: string }) => reactToFirebaseStory(storyId, user, emoji),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: storyAnalyticsKey(variables.storyId) }),
  });
}

export function useSaveFirebaseStoryMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ story, user }: { story: FirebaseStory; user: AppUser }) => saveFirebaseStoryMemory(story, user),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: storyAnalyticsKey(variables.story.id) });
      queryClient.invalidateQueries({ queryKey: ["firebase", "message-memories", variables.user.id] });
    },
  });
}

export function useFirebaseStoryComments(storyId?: string | null, enabled = true, user?: AppUser | null) {
  return useQuery({
    queryKey: [...storyCommentsKey(storyId), user?.id ?? "guest"],
    queryFn: () => listFirebaseStoryComments(storyId ?? "", user),
    enabled: enabled && Boolean(storyId),
  });
}

export function useCommentFirebaseStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, user, body }: { storyId: string; user: AppUser; body: string }) => commentOnFirebaseStory(storyId, user, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: storyCommentsKey(variables.storyId) });
      queryClient.invalidateQueries({ queryKey: storyAnalyticsKey(variables.storyId) });
    },
  });
}

export function useDeleteFirebaseStoryComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, commentId }: { storyId: string; commentId: string }) => deleteFirebaseStoryComment(storyId, commentId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: storyCommentsKey(variables.storyId) });
      queryClient.invalidateQueries({ queryKey: storyAnalyticsKey(variables.storyId) });
    },
  });
}

export function useFirebaseStoryAnalytics(story?: FirebaseStory | null, user?: AppUser | null) {
  return useQuery({
    queryKey: storyAnalyticsKey(story?.id),
    queryFn: () => getFirebaseStoryAnalytics(story as FirebaseStory, user),
    enabled: Boolean(story && user && story.authorUserId === user.id),
    retry: false,
  });
}

export function useReplyToFirebaseStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ story, user, body }: { story: FirebaseStory; user: AppUser; body: string }) => replyToFirebaseStory(story, user, body),
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: storyAnalyticsKey(variables.story.id) }),
  });
}

export function useLogFirebaseStoryPlacementEvent() {
  return useMutation({
    mutationFn: (input: FirebaseStoryPlacementEventInput) => logFirebaseStoryPlacementEvent(input),
  });
}
