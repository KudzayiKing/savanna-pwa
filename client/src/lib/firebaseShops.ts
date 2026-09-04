import type { AppUser } from "@/lib/userProfile";
import { createDiscoveryBadge, type DiscoveryBadge } from "@shared/discovery";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type FieldValue,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage, getFirestoreDb } from "./firebase";
import { createSupportConversation } from "./firebaseChat";

export type StorefrontVisibility = "draft" | "public" | "paused";
export type ProductStatus = "draft" | "active" | "archived";

export type FirebaseProductMedia = {
  id: string;
  path: string;
  url: string;
  mimeType: string;
  type: "image" | "video";
};

export type FirebaseStorefront = {
  id: string;
  ownerUserId: string;
  name: string;
  slug: string;
  bio: string | null;
  category: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  visibility: StorefrontVisibility;
  verificationState: "unverified" | "pending" | "verified" | "rejected";
  coverUrl: string | null;
  coverPath: string | null;
  ownerCity: string | null;
  ownerCountryCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  discovery?: DiscoveryBadge;
};

export type FirebaseProduct = {
  id: string;
  storefrontId: string;
  storefrontSlug: string;
  storefrontName: string;
  storefrontOwnerUserId: string;
  storefrontCategory: string | null;
  ownerCity: string | null;
  ownerCountryCode: string | null;
  title: string;
  description: string | null;
  category: string | null;
  priceMinor: number;
  currencyCode: string;
  inventoryQuantity: number | null;
  status: ProductStatus;
  primaryImageUrl: string | null;
  media: FirebaseProductMedia[];
  createdAt: Date;
  updatedAt: Date;
  discovery?: DiscoveryBadge;
};

export type FirebaseProductMemory = {
  id: string;
  authorUserId: string;
  authorName: string;
  textBody: string | null;
  productName: string | null;
  productDescription: string | null;
  productPriceMinor: number | null;
  productCurrencyCode: string | null;
  storefrontId: string;
  storefrontSlug: string;
  storefrontName: string;
  media: FirebaseProductMedia[];
  publishedAt: Date;
  discovery?: DiscoveryBadge;
};

export type FirebaseOrderStatus = "awaiting_payment" | "paid" | "accepted" | "preparing" | "ready" | "completed" | "cancelled" | "refunded";

export type FirebaseOrderItem = {
  productId: string;
  quantity: number;
  priceMinor: number;
  currencyCode: string;
  title: string;
};

export type FirebaseOrder = {
  id: string;
  orderReference: string;
  buyerUserId: string;
  storefrontId: string;
  storefrontName: string | null;
  storefrontSlug: string | null;
  storefrontOwnerUserId: string;
  status: FirebaseOrderStatus;
  totalMinor: number;
  feeMinor: number;
  currencyCode: string;
  items: FirebaseOrderItem[];
  /** How the buyer intends to pay. Captured at checkout; charged later when the
   *  payment partners go live. Null until the buyer completes checkout. */
  paymentCountryCode: string | null;
  paymentProviderCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FirebaseStorefrontDetail = {
  storefront: FirebaseStorefront;
  products: FirebaseProduct[];
  memories: FirebaseProductMemory[];
};

export type StorefrontInput = {
  name: string;
  bio: string | null;
  category: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  visibility: StorefrontVisibility;
};

export type ProductInput = {
  title: string;
  description: string | null;
  category?: string | null;
  currencyCode: string;
  priceMinor: number;
  inventoryQuantity: number | null;
  status: ProductStatus;
};

type StorefrontDoc = Omit<FirebaseStorefront, "id" | "createdAt" | "updatedAt" | "discovery"> & {
  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};

type ProductDoc = Omit<FirebaseProduct, "id" | "createdAt" | "updatedAt" | "discovery"> & {
  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};

type StoryMemoryDoc = {
  authorUserId: string;
  authorName: string;
  textBody?: string | null;
  productName?: string | null;
  productDescription?: string | null;
  productPriceMinor?: number | null;
  productCurrencyCode?: string | null;
  storefrontId?: string | null;
  storefrontSlug?: string | null;
  storefrontName?: string | null;
  media?: FirebaseProductMedia[];
  publishedAt?: Timestamp | Date | FieldValue | null;
};

type OrderDoc = Omit<FirebaseOrder, "id" | "createdAt" | "updatedAt"> & {
  createdAt?: Timestamp | Date | FieldValue | null;
  updatedAt?: Timestamp | Date | FieldValue | null;
};

export const firebaseShopQueryKeys = {
  storefronts: ["firebase", "storefronts"] as const,
  products: ["firebase", "products"] as const,
  memories: ["firebase", "product-memories"] as const,
  buyerOrders: (uid?: string | null) => ["firebase", "orders", "buyer", uid ?? "guest"] as const,
  merchantOrders: (storefrontId?: string | null) => ["firebase", "orders", "merchant", storefrontId ?? "none"] as const,
  order: (orderId?: string | null) => ["firebase", "orders", "detail", orderId ?? ""] as const,
  mine: (uid?: string | null) => ["firebase", "storefronts", "mine", uid ?? "guest"] as const,
  detail: (slug?: string | null) => ["firebase", "storefronts", "detail", slug ?? ""] as const,
};

export const paymentCountries = [
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "NG", name: "Nigeria" },
  { code: "UG", name: "Uganda" },
];

export const paymentPartners = [
  { code: "mpesa_daraja", name: "M-PESA", countryCode: "KE", currencyCode: "KES" },
  { code: "mtn_momo", name: "MTN MoMo", countryCode: "GH", currencyCode: "GHS" },
  { code: "airtel_money", name: "Airtel Money", countryCode: "UG", currencyCode: "UGX" },
  { code: "flutterwave_ke", name: "Flutterwave", countryCode: "KE", currencyCode: "KES" },
  { code: "flutterwave_gh", name: "Flutterwave", countryCode: "GH", currencyCode: "GHS" },
  { code: "flutterwave_ng", name: "Flutterwave", countryCode: "NG", currencyCode: "NGN" },
  { code: "flutterwave_ug", name: "Flutterwave", countryCode: "UG", currencyCode: "UGX" },
];

function asDate(value: unknown, fallback = new Date()) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return fallback;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `shop-${crypto.randomUUID().slice(0, 8)}`;
}

function mediaType(mimeType: string): "image" | "video" {
  return mimeType.startsWith("video/") ? "video" : "image";
}

function storageName(file: File) {
  const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${crypto.randomUUID()}.${extension}`;
}

function mapStorefront(id: string, data: StorefrontDoc, viewer?: AppUser | null): FirebaseStorefront {
  const storefront: FirebaseStorefront = {
    id,
    ownerUserId: data.ownerUserId,
    name: data.name,
    slug: data.slug,
    bio: data.bio ?? null,
    category: data.category ?? null,
    contactPhone: data.contactPhone ?? null,
    contactEmail: data.contactEmail ?? null,
    visibility: data.visibility ?? "draft",
    verificationState: data.verificationState ?? "unverified",
    coverUrl: data.coverUrl ?? null,
    coverPath: data.coverPath ?? null,
    ownerCity: data.ownerCity ?? null,
    ownerCountryCode: data.ownerCountryCode ?? null,
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
  };

  storefront.discovery = createDiscoveryBadge({
    surface: "shops",
    viewerUserId: viewer?.id ?? null,
    ownerUserId: storefront.ownerUserId,
    viewerCity: viewer?.city,
    viewerCountryCode: viewer?.countryCode,
    itemCity: storefront.ownerCity,
    itemCountryCode: storefront.ownerCountryCode,
    title: storefront.name,
    description: storefront.bio,
    category: storefront.category,
  });

  return storefront;
}

function mapProduct(id: string, data: ProductDoc, viewer?: AppUser | null): FirebaseProduct {
  const product: FirebaseProduct = {
    id,
    storefrontId: data.storefrontId,
    storefrontSlug: data.storefrontSlug,
    storefrontName: data.storefrontName,
    storefrontOwnerUserId: data.storefrontOwnerUserId,
    storefrontCategory: data.storefrontCategory ?? null,
    ownerCity: data.ownerCity ?? null,
    ownerCountryCode: data.ownerCountryCode ?? null,
    title: data.title,
    description: data.description ?? null,
    category: data.category ?? null,
    priceMinor: data.priceMinor,
    currencyCode: data.currencyCode,
    inventoryQuantity: data.inventoryQuantity ?? null,
    status: data.status ?? "active",
    primaryImageUrl: data.primaryImageUrl ?? null,
    media: data.media ?? [],
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
  };

  product.discovery = createDiscoveryBadge({
    surface: "shops",
    viewerUserId: viewer?.id ?? null,
    ownerUserId: product.storefrontOwnerUserId,
    viewerCity: viewer?.city,
    viewerCountryCode: viewer?.countryCode,
    itemCity: product.ownerCity,
    itemCountryCode: product.ownerCountryCode,
    title: product.title,
    description: product.description,
    category: product.category ?? product.storefrontCategory,
  });

  return product;
}

function mapOrder(id: string, data: OrderDoc): FirebaseOrder {
  return {
    id,
    orderReference: data.orderReference ?? `SV-${id.slice(0, 8).toUpperCase()}`,
    buyerUserId: data.buyerUserId,
    storefrontId: data.storefrontId,
    storefrontName: data.storefrontName ?? null,
    storefrontSlug: data.storefrontSlug ?? null,
    storefrontOwnerUserId: data.storefrontOwnerUserId,
    status: data.status ?? "awaiting_payment",
    totalMinor: data.totalMinor ?? 0,
    feeMinor: data.feeMinor ?? 0,
    currencyCode: data.currencyCode ?? "USD",
    items: Array.isArray(data.items) ? (data.items as FirebaseOrderItem[]) : [],
    paymentCountryCode: data.paymentCountryCode ?? null,
    paymentProviderCode: data.paymentProviderCode ?? null,
    createdAt: asDate(data.createdAt),
    updatedAt: asDate(data.updatedAt),
  };
}

function mapMemory(id: string, data: StoryMemoryDoc, viewer?: AppUser | null): FirebaseProductMemory | null {
  if (!data.storefrontId || !data.storefrontSlug || !data.storefrontName) return null;
  const memory: FirebaseProductMemory = {
    id,
    authorUserId: data.authorUserId,
    authorName: data.storefrontName,
    textBody: data.textBody ?? null,
    productName: data.productName ?? null,
    productDescription: data.productDescription ?? null,
    productPriceMinor: data.productPriceMinor ?? null,
    productCurrencyCode: data.productCurrencyCode ?? null,
    storefrontId: data.storefrontId,
    storefrontSlug: data.storefrontSlug,
    storefrontName: data.storefrontName,
    media: data.media ?? [],
    publishedAt: asDate(data.publishedAt),
  };

  memory.discovery = createDiscoveryBadge({
    surface: "shops",
    viewerUserId: viewer?.id ?? null,
    ownerUserId: memory.authorUserId,
    viewerCity: viewer?.city,
    viewerCountryCode: viewer?.countryCode,
    isProductMemory: true,
    title: memory.productName,
    description: memory.productDescription ?? memory.textBody,
  });

  return memory;
}

function matchesQuery(queryValue: string | undefined, values: Array<string | null | undefined>) {
  const needle = queryValue?.trim().toLowerCase();
  if (!needle) return true;
  return values.some(value => value?.toLowerCase().includes(needle));
}

async function uploadShopFile(path: string, file: File): Promise<FirebaseProductMedia> {
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { id: crypto.randomUUID(), path, url, mimeType: file.type, type: mediaType(file.type) };
}

export async function listFirebaseStorefronts(queryValue?: string, viewer?: AppUser | null) {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "storefronts"), where("visibility", "==", "public"), orderBy("updatedAt", "desc"), limit(60)));
  return snapshot.docs
    .map(item => mapStorefront(item.id, item.data() as StorefrontDoc, viewer))
    .filter(item => matchesQuery(queryValue, [item.name, item.category, item.bio]))
    .sort((left, right) => (right.discovery?.score ?? 0) - (left.discovery?.score ?? 0) || right.updatedAt.getTime() - left.updatedAt.getTime());
}

export async function listFirebaseProducts(queryValue?: string, viewer?: AppUser | null) {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "products"), where("status", "==", "active"), orderBy("createdAt", "desc"), limit(80)));
  return snapshot.docs
    .map(item => mapProduct(item.id, item.data() as ProductDoc, viewer))
    .filter(item => matchesQuery(queryValue, [item.title, item.description, item.category, item.storefrontName, item.storefrontCategory]))
    .sort((left, right) => (right.discovery?.score ?? 0) - (left.discovery?.score ?? 0) || right.createdAt.getTime() - left.createdAt.getTime());
}

export async function listFirebaseProductMemories(queryValue?: string, viewer?: AppUser | null) {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "stories"), where("audience", "==", "public"), where("isMemory", "==", true), orderBy("publishedAt", "desc"), limit(60)));
  return snapshot.docs
    .map(item => mapMemory(item.id, item.data() as StoryMemoryDoc, viewer))
    .filter((item): item is FirebaseProductMemory => Boolean(item))
    .filter(item => matchesQuery(queryValue, [item.productName, item.productDescription, item.textBody, item.storefrontName]))
    .sort((left, right) => (right.discovery?.score ?? 0) - (left.discovery?.score ?? 0) || right.publishedAt.getTime() - left.publishedAt.getTime());
}

export async function listFirebaseBuyerOrders(user?: AppUser | null) {
  if (!user) return [];
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "orders"), where("buyerUserId", "==", user.id), orderBy("createdAt", "desc"), limit(80)));
  return snapshot.docs.map(item => mapOrder(item.id, item.data() as OrderDoc));
}

export async function listFirebaseMerchantOrders(storefrontId?: string | null) {
  if (!storefrontId) return [];
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "orders"), where("storefrontId", "==", storefrontId), orderBy("createdAt", "desc"), limit(80)));
  return snapshot.docs.map(item => mapOrder(item.id, item.data() as OrderDoc));
}

export async function getFirebaseStorefrontBySlug(slug: string, viewer?: AppUser | null): Promise<FirebaseStorefrontDetail | null> {
  const storefrontSnapshot = await getDocs(query(collection(getFirestoreDb(), "storefronts"), where("slug", "==", slug), limit(1)));
  const storefrontDoc = storefrontSnapshot.docs[0];
  if (!storefrontDoc) return null;
  const storefront = mapStorefront(storefrontDoc.id, storefrontDoc.data() as StorefrontDoc, viewer);
  if (storefront.visibility !== "public" && storefront.ownerUserId !== viewer?.id) return null;

  const [productSnapshot, memorySnapshot] = await Promise.all([
    getDocs(query(collection(getFirestoreDb(), "products"), where("storefrontId", "==", storefront.id), orderBy("createdAt", "desc"), limit(80))),
    getDocs(query(collection(getFirestoreDb(), "stories"), where("storefrontId", "==", storefront.id), where("isMemory", "==", true), orderBy("publishedAt", "desc"), limit(80))),
  ]);

  const products = productSnapshot.docs
    .map(item => mapProduct(item.id, item.data() as ProductDoc, viewer))
    .filter(item => storefront.ownerUserId === viewer?.id || item.status === "active");
  const memories = memorySnapshot.docs
    .map(item => mapMemory(item.id, item.data() as StoryMemoryDoc, viewer))
    .filter((item): item is FirebaseProductMemory => Boolean(item));

  return { storefront, products, memories };
}

export async function getMyFirebaseStorefront(user: AppUser): Promise<FirebaseStorefrontDetail | null> {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "storefronts"), where("ownerUserId", "==", user.id), limit(1)));
  const storefrontDoc = snapshot.docs[0];
  if (!storefrontDoc) return null;
  return getFirebaseStorefrontBySlug((storefrontDoc.data() as StorefrontDoc).slug, user);
}

export async function getPublicFirebaseStorefrontForOwner(ownerUserId: string, viewer?: AppUser | null) {
  const snapshot = await getDocs(query(collection(getFirestoreDb(), "storefronts"), where("ownerUserId", "==", ownerUserId), where("visibility", "==", "public"), limit(1)));
  const storefrontDoc = snapshot.docs[0];
  if (!storefrontDoc) return null;
  return mapStorefront(storefrontDoc.id, storefrontDoc.data() as StorefrontDoc, viewer);
}

export async function saveFirebaseStorefront(user: AppUser, input: StorefrontInput, existingId?: string | null) {
  const db = getFirestoreDb();
  const slug = slugify(input.name);
  const payload = {
    ...input,
    ownerUserId: user.id,
    ownerCity: user.city ?? null,
    ownerCountryCode: user.countryCode ?? null,
    slug,
    updatedAt: serverTimestamp(),
  };

  if (existingId) {
    await setDoc(doc(db, "storefronts", existingId), payload, { merge: true });
    return existingId;
  }

  const storefrontRef = await addDoc(collection(db, "storefronts"), {
    ...payload,
    verificationState: "unverified",
    coverUrl: null,
    coverPath: null,
    createdAt: serverTimestamp(),
  });
  return storefrontRef.id;
}

export async function uploadFirebaseStorefrontBanner(user: AppUser, storefrontId: string, file: File) {
  const path = `shops/${user.id}/banners/${storageName(file)}`;
  const media = await uploadShopFile(path, file);
  await setDoc(doc(getFirestoreDb(), "storefronts", storefrontId), { coverUrl: media.url, coverPath: media.path, updatedAt: serverTimestamp() }, { merge: true });
  return media.url;
}

export async function createFirebaseProduct(user: AppUser, storefront: FirebaseStorefront, input: ProductInput, files: { images: File[]; video?: File | null }) {
  const db = getFirestoreDb();
  const productRef = await addDoc(collection(db, "products"), {
    ...input,
    storefrontId: storefront.id,
    storefrontSlug: storefront.slug,
    storefrontName: storefront.name,
    storefrontOwnerUserId: user.id,
    storefrontCategory: storefront.category,
    ownerCity: storefront.ownerCity,
    ownerCountryCode: storefront.ownerCountryCode,
    primaryImageUrl: null,
    media: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const media: FirebaseProductMedia[] = [];
  for (const file of files.images.slice(0, 5)) {
    media.push(await uploadShopFile(`shops/${user.id}/products/${productRef.id}/${storageName(file)}`, file));
  }
  if (files.video) {
    media.push(await uploadShopFile(`shops/${user.id}/products/${productRef.id}/${storageName(files.video)}`, files.video));
  }

  if (media.length) {
    await setDoc(productRef, {
      media,
      primaryImageUrl: media.find(item => item.type === "image")?.url ?? null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await updateDoc(doc(db, "storefronts", storefront.id), { updatedAt: serverTimestamp() });
  return productRef.id;
}

export async function saveFirebaseSettlement(user: AppUser, storefrontId: string, settlement: Record<string, string>) {
  await setDoc(doc(getFirestoreDb(), "storefronts", storefrontId, "private", "settlement"), {
    ownerUserId: user.id,
    ...settlement,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function submitFirebaseVerification(storefrontId: string) {
  await setDoc(doc(getFirestoreDb(), "storefronts", storefrontId), { verificationState: "pending", updatedAt: serverTimestamp() }, { merge: true });
}

export async function createFirebaseOrder(user: AppUser, product: FirebaseProduct) {
  await addDoc(collection(getFirestoreDb(), "orders"), {
    orderReference: `SV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    buyerUserId: user.id,
    storefrontId: product.storefrontId,
    storefrontName: product.storefrontName,
    storefrontSlug: product.storefrontSlug,
    storefrontOwnerUserId: product.storefrontOwnerUserId,
    items: [{ productId: product.id, quantity: 1, priceMinor: product.priceMinor, currencyCode: product.currencyCode, title: product.title }],
    status: "awaiting_payment",
    totalMinor: product.priceMinor,
    feeMinor: 0,
    currencyCode: product.currencyCode,
    paymentCountryCode: null,
    paymentProviderCode: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateFirebaseOrderStatus(orderId: string, status: FirebaseOrderStatus) {
  await updateDoc(doc(getFirestoreDb(), "orders", orderId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** Reads a single order. Firestore rules already restrict reads to the buyer and
 *  the seller, so a missing or forbidden document both resolve to null. */
export async function getFirebaseOrderById(orderId: string): Promise<FirebaseOrder | null> {
  if (!orderId) return null;
  const snapshot = await getDoc(doc(getFirestoreDb(), "orders", orderId));
  if (!snapshot.exists()) return null;
  return mapOrder(snapshot.id, snapshot.data() as OrderDoc);
}

/**
 * Records how the buyer intends to pay and returns the order.
 *
 * Payment partners are not live yet, so this deliberately does NOT move the
 * order out of `awaiting_payment` - the seller still has to confirm. It only
 * persists the country/provider choice so the charge can be raised later
 * without asking the buyer again.
 */
export async function confirmFirebaseOrderCheckout(
  orderId: string,
  input: { countryCode: string; providerCode: string },
): Promise<FirebaseOrder | null> {
  await updateDoc(doc(getFirestoreDb(), "orders", orderId), {
    paymentCountryCode: input.countryCode,
    paymentProviderCode: input.providerCode,
    updatedAt: serverTimestamp(),
  });
  return getFirebaseOrderById(orderId);
}

export function startFirebaseStorefrontSupport(user: AppUser, storefront: FirebaseStorefront) {
  return createSupportConversation({
    viewer: user,
    ownerUserId: storefront.ownerUserId,
    storefrontId: storefront.id,
    storefrontSlug: storefront.slug,
    storefrontName: storefront.name,
  });
}

export function useFirebaseStorefronts(queryValue: string, user?: AppUser | null) {
  return useQuery({
    queryKey: [...firebaseShopQueryKeys.storefronts, queryValue, user?.id ?? "guest"],
    queryFn: () => listFirebaseStorefronts(queryValue, user),
  });
}

export function useFirebaseProducts(queryValue: string, user?: AppUser | null) {
  return useQuery({
    queryKey: [...firebaseShopQueryKeys.products, queryValue, user?.id ?? "guest"],
    queryFn: () => listFirebaseProducts(queryValue, user),
  });
}

export function useFirebaseProductMemories(queryValue: string, user?: AppUser | null) {
  return useQuery({
    queryKey: [...firebaseShopQueryKeys.memories, queryValue, user?.id ?? "guest"],
    queryFn: () => listFirebaseProductMemories(queryValue, user),
  });
}

export function useFirebaseBuyerOrders(user?: AppUser | null) {
  return useQuery({
    queryKey: firebaseShopQueryKeys.buyerOrders(user?.id),
    queryFn: () => listFirebaseBuyerOrders(user),
    enabled: Boolean(user),
  });
}

export function useFirebaseMerchantOrders(storefrontId?: string | null) {
  return useQuery({
    queryKey: firebaseShopQueryKeys.merchantOrders(storefrontId),
    queryFn: () => listFirebaseMerchantOrders(storefrontId),
    enabled: Boolean(storefrontId),
  });
}

export function useFirebaseOrder(orderId?: string | null, user?: AppUser | null) {
  return useQuery({
    queryKey: firebaseShopQueryKeys.order(orderId),
    queryFn: () => getFirebaseOrderById(orderId!),
    enabled: Boolean(orderId) && Boolean(user),
  });
}

export function useFirebaseStorefrontDetail(slug?: string | null, user?: AppUser | null) {
  return useQuery({
    queryKey: firebaseShopQueryKeys.detail(slug),
    queryFn: () => getFirebaseStorefrontBySlug(slug ?? "", user),
    enabled: Boolean(slug),
  });
}

export function useMyFirebaseStorefront(user?: AppUser | null) {
  return useQuery({
    queryKey: firebaseShopQueryKeys.mine(user?.id),
    queryFn: () => getMyFirebaseStorefront(user!),
    enabled: Boolean(user),
  });
}

export function useFirebaseShopMutations() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: firebaseShopQueryKeys.storefronts }),
      queryClient.invalidateQueries({ queryKey: firebaseShopQueryKeys.products }),
      queryClient.invalidateQueries({ queryKey: firebaseShopQueryKeys.memories }),
      queryClient.invalidateQueries({ queryKey: ["firebase", "orders"] }),
    ]);
  };

  return {
    saveStorefront: useMutation({
      mutationFn: ({ user, input, existingId }: { user: AppUser; input: StorefrontInput; existingId?: string | null }) => saveFirebaseStorefront(user, input, existingId),
      onSuccess: invalidate,
    }),
    uploadBanner: useMutation({
      mutationFn: ({ user, storefrontId, file }: { user: AppUser; storefrontId: string; file: File }) => uploadFirebaseStorefrontBanner(user, storefrontId, file),
      onSuccess: invalidate,
    }),
    createProduct: useMutation({
      mutationFn: ({ user, storefront, input, files }: { user: AppUser; storefront: FirebaseStorefront; input: ProductInput; files: { images: File[]; video?: File | null } }) => createFirebaseProduct(user, storefront, input, files),
      onSuccess: invalidate,
    }),
    saveSettlement: useMutation({
      mutationFn: ({ user, storefrontId, settlement }: { user: AppUser; storefrontId: string; settlement: Record<string, string> }) => saveFirebaseSettlement(user, storefrontId, settlement),
      onSuccess: invalidate,
    }),
    submitVerification: useMutation({
      mutationFn: ({ storefrontId }: { storefrontId: string }) => submitFirebaseVerification(storefrontId),
      onSuccess: invalidate,
    }),
    createOrder: useMutation({
      mutationFn: ({ user, product }: { user: AppUser; product: FirebaseProduct }) => createFirebaseOrder(user, product),
      onSuccess: invalidate,
    }),
    confirmCheckout: useMutation({
      mutationFn: ({ orderId, countryCode, providerCode }: { orderId: string; countryCode: string; providerCode: string }) =>
        confirmFirebaseOrderCheckout(orderId, { countryCode, providerCode }),
      onSuccess: invalidate,
    }),
    updateOrderStatus: useMutation({
      mutationFn: ({ orderId, status }: { orderId: string; status: FirebaseOrderStatus }) => updateFirebaseOrderStatus(orderId, status),
      onSuccess: invalidate,
    }),
    support: useMutation({
      mutationFn: ({ user, storefront }: { user: AppUser; storefront: FirebaseStorefront }) => startFirebaseStorefrontSupport(user, storefront),
    }),
  };
}
