import type { AppUser } from "@/lib/userProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { getFirestoreDb } from "./firebase";

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

export async function createFirebaseCommunity(owner: AppUser, input: FirebaseCommunityInput) {
  const name = input.name.trim();
  if (name.length < 3) throw new Error("Give the community a clear name.");

  const db = getFirestoreDb();
  const communityRef = doc(collection(db, "communities"));
  const timestamp = serverTimestamp();
  const slug = slugify(name) || communityRef.id;
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
  });
  batch.update(doc(db, "communities", communityId), {
    memberCount: increment(1),
    updatedAt: timestamp,
  });
  await batch.commit();
}

export function useFirebaseCommunities(search = "") {
  return useQuery({
    queryKey: communityKeys.list(search),
    queryFn: () => listFirebaseCommunities(search),
  });
}

export function useFirebaseCommunityMutations(user?: AppUser | null) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["firebase", "communities"] });

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
      onSuccess: invalidate,
    }),
  };
}
