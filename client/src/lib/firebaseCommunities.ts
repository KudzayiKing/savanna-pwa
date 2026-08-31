import type { AppUser } from "@/lib/userProfile";
import { createDiscoveryBadge, type DiscoveryBadge } from "@shared/discovery";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreDb } from "./firebase";
import { listFirebaseBlockedUserIds } from "./firebaseSafety";
import { listFirebaseStorefronts, type FirebaseProduct, type FirebaseStorefront } from "./firebaseShops";

export type FirebaseCommunityVisibility = "public" | "private";

export type FirebaseCommunity = {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  countryCode: string | null;
  visibility: FirebaseCommunityVisibility;
  memberCount: number;
  linkedStorefrontIds: string[];
  createdAt: Date;
  updatedAt: Date;
  inviteCode: string | null;
};

export type FirebaseCommunityMemberRole = "owner" | "moderator" | "member";

export type FirebaseCommunityMember = {
  userId: string;
  role: FirebaseCommunityMemberRole;
  displayName: string;
  photoURL: string | null;
  joinedAt: Date;
};

export type FirebaseCommunityMessage = {
  id: string;
  authorUserId: string;
  authorName: string;
  authorPhotoURL: string | null;
  body: string;
  createdAt: Date;
};

export type FirebaseCommunityPostKind = "post" | "question" | "listing" | "announcement";

export type FirebaseCommunityPost = {
  id: string;
  authorUserId: string;
  authorName: string;
  authorPhotoURL: string | null;
  title: string | null;
  body: string;
  kind: FirebaseCommunityPostKind;
  storefrontId: string | null;
  storefrontSlug: string | null;
  storefrontName: string | null;
  productId: string | null;
  productName: string | null;
  productDescription: string | null;
  productPriceMinor: number | null;
  productCurrencyCode: string | null;
  productPrimaryImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FirebaseCommunityDiscoveryPost = FirebaseCommunityPost & {
  communityId: string;
  communityName: string;
  communityCity: string | null;
  communityCountryCode: string | null;
  communityMemberCount: number;
  discovery: DiscoveryBadge;
};

export type FirebaseCommunityDetail = {
  community: FirebaseCommunity;
  member: FirebaseCommunityMember | null;
  shops: FirebaseStorefront[];
};

export type FirebaseCommunityInput = {
  name: string;
  description?: string | null;
  city?: string | null;
  countryCode?: string | null;
  visibility?: FirebaseCommunityVisibility;
  linkedStorefrontIds?: string[];
};

const communityKeys = {
  list: (search = "") => ["firebase", "communities", search.trim().toLowerCase()] as const,
  detail: (communityId?: string | null, uid?: string | null) => ["firebase", "community", communityId ?? "", uid ?? "guest"] as const,
  messages: (communityId?: string | null) => ["firebase", "community-messages", communityId ?? ""] as const,
  posts: (communityId?: string | null) => ["firebase", "community-posts", communityId ?? ""] as const,
  discoveryPosts: (uid?: string | null) => ["firebase", "community-discovery-posts", uid ?? "guest"] as const,
};

type FirebaseCommunityInviteDoc = {
  communityId?: string | null;
  name?: string | null;
  inviteCode?: string | null;
  createdByUserId?: string | null;
  active?: boolean;
};

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  return new Date();
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeText(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function inviteCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

function communityInviteRef(code: string) {
  return doc(getFirestoreDb(), "communityInvites", code);
}

function communityRef(communityId: string) {
  return doc(getFirestoreDb(), "communities", communityId);
}

function communityMemberRef(communityId: string, userId: string) {
  return doc(getFirestoreDb(), "communities", communityId, "members", userId);
}

function mapMember(data: DocumentData): FirebaseCommunityMember {
  return {
    userId: String(data.userId ?? ""),
    role: data.role === "owner" || data.role === "moderator" ? data.role : "member",
    displayName: typeof data.displayName === "string" ? data.displayName : "Savanna user",
    photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
    joinedAt: toDate(data.joinedAt),
  };
}

function mapCommunity(id: string, data: DocumentData): FirebaseCommunity {
  return {
    id,
    ownerUserId: String(data.ownerUserId ?? ""),
    name: typeof data.name === "string" ? data.name : "Savanna community",
    slug: typeof data.slug === "string" ? data.slug : id,
    description: typeof data.description === "string" ? data.description : null,
    city: typeof data.city === "string" ? data.city : null,
    countryCode: typeof data.countryCode === "string" ? data.countryCode : null,
    visibility: data.visibility === "private" ? "private" : "public",
    memberCount: typeof data.memberCount === "number" ? data.memberCount : 1,
    linkedStorefrontIds: Array.isArray(data.linkedStorefrontIds) ? data.linkedStorefrontIds.map(String) : [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    inviteCode: typeof data.inviteCode === "string" ? data.inviteCode : null,
  };
}

function mapCommunityMessage(id: string, data: DocumentData): FirebaseCommunityMessage {
  return {
    id,
    authorUserId: String(data.authorUserId ?? ""),
    authorName: typeof data.authorName === "string" ? data.authorName : "Savanna user",
    authorPhotoURL: typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : null,
    body: typeof data.body === "string" ? data.body : "",
    createdAt: toDate(data.createdAt),
  };
}

function mapCommunityPost(id: string, data: DocumentData): FirebaseCommunityPost {
  const kind = data.kind === "question" || data.kind === "listing" || data.kind === "announcement" ? data.kind : "post";
  return {
    id,
    authorUserId: String(data.authorUserId ?? ""),
    authorName: typeof data.authorName === "string" ? data.authorName : "Savanna user",
    authorPhotoURL: typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : null,
    title: typeof data.title === "string" ? data.title : null,
    body: typeof data.body === "string" ? data.body : "",
    kind,
    storefrontId: typeof data.storefrontId === "string" ? data.storefrontId : null,
    storefrontSlug: typeof data.storefrontSlug === "string" ? data.storefrontSlug : null,
    storefrontName: typeof data.storefrontName === "string" ? data.storefrontName : null,
    productId: typeof data.productId === "string" ? data.productId : null,
    productName: typeof data.productName === "string" ? data.productName : null,
    productDescription: typeof data.productDescription === "string" ? data.productDescription : null,
    productPriceMinor: typeof data.productPriceMinor === "number" ? data.productPriceMinor : null,
    productCurrencyCode: typeof data.productCurrencyCode === "string" ? data.productCurrencyCode : null,
    productPrimaryImageUrl: typeof data.productPrimaryImageUrl === "string" ? data.productPrimaryImageUrl : null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function listFirebaseCommunities(search = "") {
  const db = getFirestoreDb();
  const snapshot = await getDocs(
    query(
      collection(db, "communities"),
      where("visibility", "==", "public"),
      orderBy("updatedAt", "desc"),
      limit(80),
    ),
  );
  const needle = search.trim().toLowerCase();
  const communities = snapshot.docs.map(item => mapCommunity(item.id, item.data()));
  if (!needle) return communities;
  return communities.filter(community =>
    [community.name, community.description, community.city]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(needle)),
  );
}

export async function getFirebaseCommunityDetail(communityId?: string | null, user?: AppUser | null): Promise<FirebaseCommunityDetail | null> {
  if (!communityId) return null;
  const snapshot = await getDoc(communityRef(communityId));
  if (!snapshot.exists()) return null;
  const community = mapCommunity(snapshot.id, snapshot.data());
  let member: FirebaseCommunityMember | null = null;
  if (user) {
    try {
      const memberSnapshot = await getDoc(communityMemberRef(communityId, user.id));
      member = memberSnapshot.exists() ? mapMember(memberSnapshot.data()) : null;
    } catch {
      member = null;
    }
  }
  const storefronts = await listFirebaseStorefronts("", user);
  const shops = storefronts.filter(storefront =>
    community.linkedStorefrontIds.includes(storefront.id)
    || (!community.linkedStorefrontIds.length && community.city && storefront.ownerCity === community.city),
  ).slice(0, 6);
  return { community, member, shops };
}

export async function createFirebaseCommunity(owner: AppUser, input: FirebaseCommunityInput) {
  const name = input.name.trim();
  if (name.length < 3) throw new Error("Give the community a clear name.");

  const db = getFirestoreDb();
  const communityRef = doc(collection(db, "communities"));
  const timestamp = serverTimestamp();
  const slug = slugify(name) || communityRef.id;
  const code = inviteCode();
  const memberRef = doc(db, "communities", communityRef.id, "members", owner.id);
  const batch = writeBatch(db);

  batch.set(communityRef, {
    ownerUserId: owner.id,
    name,
    slug,
    description: normalizeText(input.description),
    city: normalizeText(input.city) ?? owner.city ?? null,
    countryCode: normalizeText(input.countryCode) ?? owner.countryCode ?? null,
    visibility: input.visibility ?? "public",
    memberCount: 1,
    inviteCode: code,
    linkedStorefrontIds: input.linkedStorefrontIds ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(memberRef, {
    userId: owner.id,
    role: "owner",
    displayName: owner.name ?? owner.username ?? "Savanna user",
    photoURL: owner.photoURL ?? null,
    joinedAt: timestamp,
  });
  batch.set(communityInviteRef(code), {
    communityId: communityRef.id,
    name,
    inviteCode: code,
    createdByUserId: owner.id,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await batch.commit();

  return communityRef.id;
}

export async function joinFirebaseCommunity(user: AppUser, communityId: string) {
  const db = getFirestoreDb();
  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(doc(db, "communities", communityId, "members", user.id), {
    userId: user.id,
    role: "member",
    displayName: user.name ?? user.username ?? "Savanna user",
    photoURL: user.photoURL ?? null,
    joinedAt: timestamp,
    joinedByInviteCode: null,
  });
  batch.update(doc(db, "communities", communityId), {
    memberCount: increment(1),
    updatedAt: timestamp,
  });
  await batch.commit();
}

export async function listFirebaseCommunityMessages(communityId?: string | null) {
  if (!communityId) return [];
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "communities", communityId, "chatMessages"), orderBy("createdAt", "asc"), limit(160)));
  return snapshot.docs.map(item => mapCommunityMessage(item.id, item.data()));
}

export async function listFirebaseCommunityPosts(communityId?: string | null) {
  if (!communityId) return [];
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "communities", communityId, "posts"), orderBy("createdAt", "desc"), limit(80)));
  return snapshot.docs.map(item => mapCommunityPost(item.id, item.data()));
}

export async function listFirebaseCommunityDiscoveryPosts(user?: AppUser | null): Promise<FirebaseCommunityDiscoveryPost[]> {
  const communities = await listFirebaseCommunities("");
  const blockedUserIds = new Set(await listFirebaseBlockedUserIds(user));
  const snapshots = await Promise.all(
    communities.slice(0, 16).map(async community => ({
      community,
      snapshot: await getDocs(query(collection(getFirestoreDb(), "communities", community.id, "posts"), orderBy("createdAt", "desc"), limit(12))),
    })),
  );
  return snapshots
    .flatMap(({ community, snapshot }) => snapshot.docs.map(item => {
      const post = mapCommunityPost(item.id, item.data());
      return {
        ...post,
        communityId: community.id,
        communityName: community.name,
        communityCity: community.city,
        communityCountryCode: community.countryCode,
        communityMemberCount: community.memberCount,
        discovery: createDiscoveryBadge({
          surface: "stories",
          viewerUserId: user?.id ?? null,
          ownerUserId: post.authorUserId,
          viewerCity: user?.city,
          viewerCountryCode: user?.countryCode,
          itemCity: community.city,
          itemCountryCode: community.countryCode,
          isProductMemory: Boolean(post.productId),
          title: post.productName ?? post.title ?? community.name,
          description: post.productDescription ?? post.body,
        }),
      };
    }))
    .filter(post => !blockedUserIds.has(post.authorUserId))
    .sort((left, right) => right.discovery.score - left.discovery.score || right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 80);
}

export async function sendFirebaseCommunityMessage(user: AppUser, communityId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Write a message first.");
  const messageRef = doc(collection(getFirestoreDb(), "communities", communityId, "chatMessages"));
  await writeBatch(getFirestoreDb())
    .set(messageRef, {
      authorUserId: user.id,
      authorName: user.name ?? user.username ?? "Savanna user",
      authorPhotoURL: user.photoURL ?? null,
      body: trimmed.slice(0, 2000),
      createdAt: serverTimestamp(),
    })
    .update(communityRef(communityId), { updatedAt: serverTimestamp() })
    .commit();
}

export async function createFirebaseCommunityPost(user: AppUser, communityId: string, input: { title?: string | null; body: string; kind?: FirebaseCommunityPostKind; product?: FirebaseProduct | null }) {
  const body = input.body.trim();
  if (body.length < 2) throw new Error("Write a short post first.");
  const product = input.product ?? null;
  const timestamp = serverTimestamp();
  const postRef = doc(collection(getFirestoreDb(), "communities", communityId, "posts"));
  await writeBatch(getFirestoreDb())
    .set(postRef, {
      authorUserId: user.id,
      authorName: user.name ?? user.username ?? "Savanna user",
      authorPhotoURL: user.photoURL ?? null,
      title: normalizeText(input.title),
      body: body.slice(0, 4000),
      kind: input.kind ?? "post",
      storefrontId: product?.storefrontId ?? null,
      storefrontSlug: product?.storefrontSlug ?? null,
      storefrontName: product?.storefrontName ?? null,
      productId: product?.id ?? null,
      productName: product?.title ?? null,
      productDescription: product?.description ?? null,
      productPriceMinor: product?.priceMinor ?? null,
      productCurrencyCode: product?.currencyCode ?? null,
      productPrimaryImageUrl: product?.primaryImageUrl ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .update(communityRef(communityId), { updatedAt: timestamp })
    .commit();
}

export async function reactToFirebaseCommunityPost(user: AppUser, communityId: string, postId: string, emoji: string) {
  await setDoc(doc(getFirestoreDb(), "communities", communityId, "posts", postId, "reactions", `${user.id}_${emoji}`), {
    userId: user.id,
    emoji,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function linkFirebaseStorefrontToCommunity(communityId: string, storefrontId: string) {
  await updateDoc(communityRef(communityId), {
    linkedStorefrontIds: arrayUnion(storefrontId),
    updatedAt: serverTimestamp(),
  });
}

export async function joinFirebaseCommunityInvite(user: AppUser, code: string) {
  const normalizedCode = code.trim();
  if (!normalizedCode) throw new Error("Invite link is missing a code.");
  const db = getFirestoreDb();
  const inviteSnapshot = await getDoc(communityInviteRef(normalizedCode));
  if (!inviteSnapshot.exists()) throw new Error("This community invite is no longer available.");
  const invite = inviteSnapshot.data() as FirebaseCommunityInviteDoc;
  if (!invite.active || !invite.communityId) throw new Error("This community invite is no longer available.");

  const timestamp = serverTimestamp();
  const batch = writeBatch(db);
  batch.set(doc(db, "communities", invite.communityId, "members", user.id), {
    userId: user.id,
    role: "member",
    displayName: user.name ?? user.username ?? "Savanna user",
    photoURL: user.photoURL ?? null,
    joinedAt: timestamp,
    joinedByInviteCode: normalizedCode,
  });
  batch.update(doc(db, "communities", invite.communityId), {
    memberCount: increment(1),
    updatedAt: timestamp,
  });
  await batch.commit();
  return invite.communityId;
}

export function useFirebaseCommunities(search = "") {
  return useQuery({
    queryKey: communityKeys.list(search),
    queryFn: () => listFirebaseCommunities(search),
  });
}

export function useFirebaseCommunityDetail(communityId?: string | null, user?: AppUser | null) {
  return useQuery({
    queryKey: communityKeys.detail(communityId, user?.id),
    queryFn: () => getFirebaseCommunityDetail(communityId, user),
    enabled: Boolean(communityId),
    retry: false,
  });
}

export function useFirebaseCommunityMessages(communityId?: string | null, enabled = true) {
  return useQuery({
    queryKey: communityKeys.messages(communityId),
    queryFn: () => listFirebaseCommunityMessages(communityId),
    enabled: Boolean(communityId && enabled),
    refetchInterval: enabled ? 5000 : false,
    retry: false,
  });
}

export function useFirebaseCommunityPosts(communityId?: string | null, enabled = true) {
  return useQuery({
    queryKey: communityKeys.posts(communityId),
    queryFn: () => listFirebaseCommunityPosts(communityId),
    enabled: Boolean(communityId && enabled),
    refetchInterval: enabled ? 8000 : false,
    retry: false,
  });
}

export function useFirebaseCommunityDiscoveryPosts(user?: AppUser | null, enabled = true) {
  return useQuery({
    queryKey: communityKeys.discoveryPosts(user?.id),
    queryFn: () => listFirebaseCommunityDiscoveryPosts(user),
    enabled,
  });
}

export function useFirebaseCommunityMutations(user?: AppUser | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["firebase", "communities"] });
    queryClient.invalidateQueries({ queryKey: ["firebase", "community-discovery-posts"] });
  };
  const invalidateCommunity = (communityId?: string | null) => {
    invalidate();
    if (communityId) {
      queryClient.invalidateQueries({ queryKey: communityKeys.detail(communityId, user?.id) });
      queryClient.invalidateQueries({ queryKey: communityKeys.messages(communityId) });
      queryClient.invalidateQueries({ queryKey: communityKeys.posts(communityId) });
    }
  };

  return {
    create: useMutation({
      mutationFn: async (input: FirebaseCommunityInput) => {
        if (!user) throw new Error("Sign in to create a community");
        return createFirebaseCommunity(user, input);
      },
      onSuccess: invalidate,
    }),
    join: useMutation({
      mutationFn: async (communityId: string) => {
        if (!user) throw new Error("Sign in to join a community");
        await joinFirebaseCommunity(user, communityId);
      },
      onSuccess: (_result, communityId) => invalidateCommunity(communityId),
    }),
    joinInvite: useMutation({
      mutationFn: async (code: string) => {
        if (!user) throw new Error("Sign in to join this community");
        return joinFirebaseCommunityInvite(user, code);
      },
      onSuccess: communityId => invalidateCommunity(communityId),
    }),
    sendMessage: useMutation({
      mutationFn: async (input: { communityId: string; body: string }) => {
        if (!user) throw new Error("Sign in to chat in this community");
        await sendFirebaseCommunityMessage(user, input.communityId, input.body);
      },
      onSuccess: (_result, input) => invalidateCommunity(input.communityId),
    }),
    createPost: useMutation({
      mutationFn: async (input: { communityId: string; title?: string | null; body: string; kind?: FirebaseCommunityPostKind; product?: FirebaseProduct | null }) => {
        if (!user) throw new Error("Sign in to post in this community");
        await createFirebaseCommunityPost(user, input.communityId, input);
      },
      onSuccess: (_result, input) => invalidateCommunity(input.communityId),
    }),
    reactToPost: useMutation({
      mutationFn: async (input: { communityId: string; postId: string; emoji: string }) => {
        if (!user) throw new Error("Sign in to react to this community post");
        await reactToFirebaseCommunityPost(user, input.communityId, input.postId, input.emoji);
      },
      onSuccess: (_result, input) => invalidateCommunity(input.communityId),
    }),
    linkStorefront: useMutation({
      mutationFn: async (input: { communityId: string; storefrontId: string }) => {
        if (!user) throw new Error("Sign in to connect a shop");
        await linkFirebaseStorefrontToCommunity(input.communityId, input.storefrontId);
      },
      onSuccess: (_result, input) => invalidateCommunity(input.communityId),
    }),
  };
}
