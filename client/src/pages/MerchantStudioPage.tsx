import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ImagePlus,
  Loader2,
  PackagePlus,
  Store,
  UserRound,
  Video,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type StorefrontForm = {
  name: string;
  bio: string;
  category: string;
  contactPhone: string;
  contactEmail: string;
  visibility: "draft" | "public" | "paused";
};

const blankStorefront: StorefrontForm = {
  name: "",
  bio: "",
  category: "",
  contactPhone: "",
  contactEmail: "",
  visibility: "draft",
};

const blankProduct = {
  title: "",
  description: "",
  currencyCode: "KES",
  price: "",
  inventory: "",
};

const storefrontBannerMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const productMediaMimeTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4"] as const;
const visibilityOptions = [
  { value: "draft", label: "Draft - only you can see it" },
  { value: "public", label: "Public - listed on Savanna Shops" },
  { value: "paused", label: "Paused - hidden from discovery" },
] as const;

function isAllowedMimeType<T extends readonly string[]>(mimeType: string, allowedTypes: T): mimeType is T[number] {
  return allowedTypes.includes(mimeType);
}

function fileToUpload<T extends readonly string[]>(file: File, allowedTypes: T) {
  return new Promise<{ fileName: string; mimeType: T[number]; base64Data: string; byteSize: number }>((resolve, reject) => {
    if (!isAllowedMimeType(file.type, allowedTypes)) {
      reject(new Error("Choose a supported file type"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const [, base64Data] = value.split(",");
      if (!base64Data) reject(new Error("Could not read selected file"));
      else resolve({ fileName: file.name, mimeType: file.type, base64Data, byteSize: file.size });
    };
    reader.onerror = () => reject(new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
}

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function MerchantStudioPage() {
  const { isAuthenticated, loading } = useAuth();
  const mine = trpc.commerce.storefronts.mine.useQuery(undefined, { enabled: isAuthenticated });
  const countries = trpc.payments.countries.useQuery();
  const [storefront, setStorefront] = useState<StorefrontForm>(blankStorefront);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [product, setProduct] = useState(blankProduct);
  const [productImages, setProductImages] = useState<File[]>([]);
  const [productVideo, setProductVideo] = useState<File | null>(null);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const productImagesInputRef = useRef<HTMLInputElement>(null);
  const productVideoInputRef = useRef<HTMLInputElement>(null);
  const [settlement, setSettlement] = useState({ countryCode: "KE", providerCode: "mpesa_daraja", recipientAlias: "", recipientReference: "" });
  const partners = trpc.payments.partners.useQuery({ countryCode: settlement.countryCode });

  const createStorefront = trpc.commerce.storefronts.create.useMutation({
    onSuccess: () => { mine.refetch(); toast.success("Storefront created"); },
    onError: error => toast.error(error.message),
  });
  const updateStorefront = trpc.commerce.storefronts.update.useMutation({
    onSuccess: () => { mine.refetch(); toast.success("Storefront saved"); },
    onError: error => toast.error(error.message),
  });
  const uploadCover = trpc.commerce.storefronts.uploadCover.useMutation({
    onError: error => toast.error(error.message),
  });
  const createProduct = trpc.commerce.storefronts.createProduct.useMutation({
    onError: error => toast.error(error.message),
  });
  const uploadProductMedia = trpc.commerce.storefronts.uploadProductMedia.useMutation({
    onError: error => toast.error(error.message),
  });
  const saveSettlement = trpc.commerce.storefronts.saveSettlement.useMutation({
    onSuccess: () => { mine.refetch(); setSettlement(current => ({ ...current, recipientReference: "" })); toast.success("Settlement details submitted"); },
    onError: error => toast.error(error.message),
  });
  const submitVerification = trpc.commerce.storefronts.submitVerification.useMutation({
    onSuccess: () => { mine.refetch(); toast.success("Verification request submitted"); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!mine.data?.storefront) return;
    setStorefront({
      name: mine.data.storefront.name,
      bio: mine.data.storefront.bio ?? "",
      category: mine.data.storefront.category ?? "",
      contactPhone: mine.data.storefront.contactPhone ?? "",
      contactEmail: mine.data.storefront.contactEmail ?? "",
      visibility: mine.data.storefront.visibility,
    });
  }, [mine.data]);

  useEffect(() => {
    const firstPartner = partners.data?.[0];
    if (firstPartner && !partners.data?.some(partner => partner.code === settlement.providerCode)) {
      setSettlement(current => ({ ...current, providerCode: firstPartner.code }));
    }
  }, [partners.data, settlement.providerCode]);

  if (loading) {
    return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div></SavannaShell>;
  }

  if (!isAuthenticated) {
    return <SavannaShell><section className="savanna-profile-page grid min-h-[62vh] place-items-center rounded-[30px] border border-[#DDE3DC] bg-[#F6F5F5] p-8 text-center shadow-[0_12px_30px_rgba(21,26,23,0.06)]"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><Store className="size-7" /></span><h1 className="mt-6 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">Bring your business to Savanna.</h1><p className="mt-4 text-sm leading-7 text-[#5F6861]">Set up your profile, catalog, verification request, and payout details in clear steps.</p><Button onClick={startLogin} className="mt-6 rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]">Sign in to start selling</Button></div></section></SavannaShell>;
  }

  const storefrontId = mine.data?.storefront?.id ?? 0;
  const storefrontSlug = mine.data?.storefront?.slug ?? null;
  const hasStorefront = storefrontId > 0;
  const verificationState = mine.data?.storefront?.verificationState ?? "unverified";
  const pendingSave = createStorefront.isPending || updateStorefront.isPending || uploadCover.isPending;
  const pendingProduct = createProduct.isPending || uploadProductMedia.isPending;
  const steps = [
    ["Storefront", mine.data?.onboarding?.profileComplete],
    ["Catalog", mine.data?.onboarding?.catalogComplete],
    ["Settlement", mine.data?.onboarding?.settlementComplete],
    ["Review", verificationState === "verified"],
  ] as const;
  const selectedVisibility = visibilityOptions.find(option => option.value === storefront.visibility) ?? visibilityOptions[0];

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const input = { ...storefront, bio: storefront.bio || null, category: storefront.category || null, contactPhone: storefront.contactPhone || null, contactEmail: storefront.contactEmail || null };
    const saved = hasStorefront ? { id: storefrontId } : await createStorefront.mutateAsync(input);
    if (hasStorefront) await updateStorefront.mutateAsync({ storefrontId, ...input });
    if (bannerFile) {
      await uploadCover.mutateAsync({ storefrontId: saved.id, ...(await fileToUpload(bannerFile, storefrontBannerMimeTypes)) });
      setBannerFile(null);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
      toast.success("Shop banner saved");
    }
    await mine.refetch();
  }

  async function addProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!hasStorefront) return toast.error("Create the storefront before adding products");
    if (productImages.length > 5) return toast.error("Choose up to 5 product images");
    const priceMinor = Math.round(Number(product.price) * 100);
    if (!Number.isFinite(priceMinor) || priceMinor <= 0) return toast.error("Enter a valid price");
    const created = await createProduct.mutateAsync({
      storefrontId,
      title: product.title,
      description: product.description || null,
      currencyCode: product.currencyCode,
      priceMinor,
      inventoryQuantity: product.inventory ? Number(product.inventory) : null,
      status: "active",
    });
    for (const file of productImages) {
      await uploadProductMedia.mutateAsync({ productId: created.id, ...(await fileToUpload(file, productMediaMimeTypes)) });
    }
    if (productVideo) {
      await uploadProductMedia.mutateAsync({ productId: created.id, ...(await fileToUpload(productVideo, productMediaMimeTypes)) });
    }
    setProduct(blankProduct);
    setProductImages([]);
    setProductVideo(null);
    if (productImagesInputRef.current) productImagesInputRef.current.value = "";
    if (productVideoInputRef.current) productVideoInputRef.current.value = "";
    await mine.refetch();
    toast.success("Product added");
  }

  return (
    <SavannaShell>
      <div className="savanna-profile-page mx-auto max-w-[960px] space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D9A441]">Merchant studio</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">Your business, clearly presented.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5F6861]">Public storefront details, product media, settlement credentials, and customer messages are deliberately kept separate.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          {steps.map(([label, complete], index) => <div key={label} className="flex items-center gap-3 rounded-2xl bg-[#D9A441]/20 p-4"><span className="grid size-7 place-items-center rounded-lg bg-white text-xs font-bold text-[#D9A441]">{complete ? <CheckCircle2 className="size-4" /> : index + 1}</span><span className="text-sm font-semibold text-[#151A17]">{label}</span></div>)}
        </div>

        <section className="rounded-[28px] border border-[#DDE3DC] bg-[#F6F5F5] p-6 shadow-[0_12px_30px_rgba(21,26,23,0.06)] sm:p-8">
          <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><UserRound className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Storefront profile</h2><p className="mt-1 text-sm text-[#5F6861]">The public face of your business.</p></div></div>
          {mine.data?.storefront?.coverUrl ? <img src={mine.data.storefront.coverUrl} alt="" className="mt-6 aspect-[16/7] w-full rounded-[22px] object-cover" /> : null}
          <form className="mt-6 space-y-5" onSubmit={saveProfile}>
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="shop-name">Business name</Label><Input id="shop-name" required value={storefront.name} onChange={event => setStorefront(current => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="shop-category">Category</Label><Input id="shop-category" value={storefront.category} onChange={event => setStorefront(current => ({ ...current, category: event.target.value }))} placeholder="Fresh food, tailoring, tutoring" /></div></div>
            <div className="space-y-2"><Label htmlFor="shop-bio">Business bio</Label><Textarea id="shop-bio" value={storefront.bio} onChange={event => setStorefront(current => ({ ...current, bio: event.target.value }))} maxLength={700} /></div>
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="shop-phone">Contact phone</Label><Input id="shop-phone" value={storefront.contactPhone} onChange={event => setStorefront(current => ({ ...current, contactPhone: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="shop-email">Contact email</Label><Input id="shop-email" type="email" value={storefront.contactEmail} onChange={event => setStorefront(current => ({ ...current, contactEmail: event.target.value }))} /></div></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="shop-banner">Shop banner</Label><Input ref={bannerInputRef} id="shop-banner" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setBannerFile(event.target.files?.[0] ?? null)} /><p className="text-xs text-[#5F6861]">{bannerFile ? bannerFile.name : "JPG, PNG, or WebP"}</p></div>
              <div className="relative space-y-2" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setVisibilityOpen(false); }}>
                <Label id="shop-visibility-label" htmlFor="shop-visibility">Visibility</Label>
                {visibilityOpen ? <div role="menu" aria-labelledby="shop-visibility-label" className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-md border border-input bg-white p-1 shadow-[0_12px_28px_rgba(21,26,23,0.12)]">{visibilityOptions.map(option => { const active = option.value === storefront.visibility; return <button key={option.value} type="button" role="menuitemradio" aria-checked={active} onClick={() => { setStorefront(current => ({ ...current, visibility: option.value })); setVisibilityOpen(false); }} className={`flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm font-medium transition-colors ${active ? "bg-[#D9A441]/20 text-[#A87820]" : "text-[#5F6861] hover:bg-[#D9A441]/10 hover:text-[#151A17]"}`}>{active ? <Check className="size-4 shrink-0" /> : <span className="size-4 shrink-0" />}<span>{option.label}</span></button>; })}</div> : null}
                <button id="shop-visibility" type="button" aria-haspopup="menu" aria-expanded={visibilityOpen} aria-labelledby="shop-visibility-label shop-visibility-value" onClick={() => setVisibilityOpen(current => !current)} className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-white px-3 py-2 text-left text-sm text-[#151A17] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"><span id="shop-visibility-value" className="truncate">{selectedVisibility.label}</span><ChevronDown className={`size-4 shrink-0 text-[#5F6861] transition-transform ${visibilityOpen ? "rotate-180" : ""}`} /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={pendingSave} className="rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]">{pendingSave ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Store className="mr-2 size-4" />}{hasStorefront ? "Save storefront" : "Create storefront"}</Button>
              {storefrontSlug ? <Link href={`/shops/${storefrontSlug}`}><Button type="button" variant="outline" className="rounded-xl border-[#DDE3DC] bg-white text-[#151A17] hover:bg-[#D9A441]/20">View public profile</Button></Link> : null}
            </div>
          </form>
        </section>

        <section className="rounded-[28px] border border-[#DDE3DC] bg-[#F6F5F5] p-6 shadow-[0_12px_30px_rgba(21,26,23,0.06)] sm:p-8">
            <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><PackagePlus className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Catalog and pricing</h2><p className="mt-1 text-sm text-[#5F6861]">Add product details, 5 images, and 1 portrait product video.</p></div></div>
            {!hasStorefront ? <p className="mt-5 rounded-2xl border border-[#DDE3DC] bg-white p-4 text-sm leading-6 text-[#5F6861]">Create the storefront first, then add as many catalog items as you need.</p> : null}
            <form className={`mt-6 space-y-5 ${!hasStorefront ? "opacity-55" : ""}`} onSubmit={addProduct}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="product-title">Product name</Label><Input id="product-title" required value={product.title} onChange={event => setProduct(current => ({ ...current, title: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="product-price">Price</Label><Input id="product-price" type="number" min="0" step="0.01" required value={product.price} onChange={event => setProduct(current => ({ ...current, price: event.target.value }))} /></div></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="product-description">Product description</Label><Textarea id="product-description" value={product.description} onChange={event => setProduct(current => ({ ...current, description: event.target.value }))} maxLength={1800} /></div><div className="space-y-2"><Label htmlFor="product-stock">Stock (optional)</Label><Input id="product-stock" type="number" min="0" value={product.inventory} onChange={event => setProduct(current => ({ ...current, inventory: event.target.value }))} /></div></div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="product-images">Product images</Label><Input ref={productImagesInputRef} id="product-images" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { const files = Array.from(event.target.files ?? []); if (files.length > 5) toast.error("Choose up to 5 product images"); setProductImages(files.slice(0, 5)); }} /><p className="flex items-center gap-1 text-xs text-[#5F6861]"><ImagePlus className="size-3.5 text-[#D9A441]" />{productImages.length ? `${productImages.length}/5 selected` : "Up to 5 JPG, PNG, or WebP images"}</p></div>
                <div className="space-y-2"><Label htmlFor="product-video">Portrait product video</Label><Input ref={productVideoInputRef} id="product-video" type="file" accept="video/mp4" onChange={event => setProductVideo(event.target.files?.[0] ?? null)} /><p className="flex items-center gap-1 text-xs text-[#5F6861]"><Video className="size-3.5 text-[#D9A441]" />{productVideo ? productVideo.name : "1 MP4 video, portrait preferred"}</p></div>
              </div>
              <Button type="submit" disabled={!hasStorefront || pendingProduct} className="rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]">{pendingProduct ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PackagePlus className="mr-2 size-4" />}Add product</Button>
            </form>

            {mine.data?.products.length ? <div className="mt-7 grid gap-3 sm:grid-cols-2">{mine.data.products.map(item => <article key={item.id} className="rounded-[22px] bg-white p-4"><div className="flex items-center gap-3">{item.primaryImageUrl ? <img src={item.primaryImageUrl} alt="" className="size-14 rounded-2xl object-cover" /> : <span className="grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><PackagePlus className="size-5" /></span>}<div className="min-w-0 flex-1"><p className="truncate font-semibold text-[#151A17]">{item.title}</p><p className="mt-1 text-sm text-[#5F6861]">{formatPrice(item.priceMinor, item.currencyCode)}</p></div><span className="text-xs font-semibold text-[#D9A441]">{item.media.length} media</span></div></article>)}</div> : null}
          </section>

        {hasStorefront ? <>
          <section className="rounded-[28px] border border-[#DDE3DC] bg-[#F6F5F5] p-6 shadow-[0_12px_30px_rgba(21,26,23,0.06)] sm:p-8">
            <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><CircleDollarSign className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Settlement details</h2><p className="mt-1 text-sm text-[#5F6861]">Recipient references are encrypted and never shown on your public profile.</p></div></div>
            <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); saveSettlement.mutate({ storefrontId, ...settlement }); }}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="settlement-country">Country</Label><select id="settlement-country" value={settlement.countryCode} onChange={event => setSettlement(current => ({ ...current, countryCode: event.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm">{countries.data?.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="settlement-provider">Payment partner</Label><select id="settlement-provider" value={settlement.providerCode} onChange={event => setSettlement(current => ({ ...current, providerCode: event.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm">{partners.data?.map(partner => <option key={partner.code} value={partner.code}>{partner.name}</option>)}</select></div></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="recipient-alias">Recipient name</Label><Input id="recipient-alias" required value={settlement.recipientAlias} onChange={event => setSettlement(current => ({ ...current, recipientAlias: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="recipient-reference">Recipient account or wallet reference</Label><Input id="recipient-reference" required value={settlement.recipientReference} onChange={event => setSettlement(current => ({ ...current, recipientReference: event.target.value }))} /></div></div>
              <div className="rounded-2xl border border-[#DDE3DC] bg-white p-4 text-sm leading-6 text-[#5F6861]">The selected partner remains disabled until Savanna has verified merchant eligibility, credentials, and its callback configuration.</div>
              <Button type="submit" disabled={saveSettlement.isPending} className="rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]"><CircleDollarSign className="mr-2 size-4" />Submit settlement details</Button>
            </form>
          </section>

          <section className="rounded-[28px] border border-[#DDE3DC] bg-[#F6F5F5] p-6 shadow-[0_12px_30px_rgba(21,26,23,0.06)] sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Verification review</h2><p className="mt-2 text-sm leading-6 text-[#5F6861]">Status: <strong className="capitalize">{verificationState}</strong>. Submit your storefront after your public profile and payout details are ready.</p></div><BadgeCheck className="size-6 text-[#D9A441]" /></div>{verificationState === "unverified" || verificationState === "rejected" ? <Button onClick={() => submitVerification.mutate({ storefrontId })} disabled={submitVerification.isPending} className="mt-5 rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]">{submitVerification.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <BadgeCheck className="mr-2 size-4" />}Request verification</Button> : null}</section>
        </> : null}
      </div>
    </SavannaShell>
  );
}
