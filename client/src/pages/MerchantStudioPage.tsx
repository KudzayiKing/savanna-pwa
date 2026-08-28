import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { BadgeCheck, CheckCircle2, CircleDollarSign, Loader2, PackagePlus, Store, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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

export default function MerchantStudioPage() {
  const { isAuthenticated, loading } = useAuth();
  const mine = trpc.commerce.storefronts.mine.useQuery(undefined, { enabled: isAuthenticated });
  const countries = trpc.payments.countries.useQuery();
  const [storefront, setStorefront] = useState<StorefrontForm>(blankStorefront);
  const [product, setProduct] = useState({ title: "", description: "", currencyCode: "KES", price: "", inventory: "" });
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
  const createProduct = trpc.commerce.storefronts.createProduct.useMutation({
    onSuccess: () => { mine.refetch(); setProduct({ title: "", description: "", currencyCode: "KES", price: "", inventory: "" }); toast.success("Product added"); },
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
    return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#9a6410]" /></div></SavannaShell>;
  }

  if (!isAuthenticated) {
    return <SavannaShell><section className="grid min-h-[62vh] place-items-center rounded-[30px] border border-[#eadfca] bg-white p-8 text-center"><div className="max-w-md"><Store className="mx-auto size-8 text-[#9a6410]" /><h1 className="mt-6 font-display text-4xl font-semibold tracking-[-0.06em] text-[#3d2d1a]">Bring your business to Savanna.</h1><p className="mt-4 text-sm leading-7 text-[#796b56]">Set up your profile, catalog, verification request, and payout details in clear steps.</p><Button onClick={startLogin} className="mt-6 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">Sign in to start selling</Button></div></section></SavannaShell>;
  }

  const storefrontId = mine.data?.storefront?.id ?? 0;
  const hasStorefront = storefrontId > 0;
  const verificationState = mine.data?.storefront?.verificationState ?? "unverified";
  const pendingSave = createStorefront.isPending || updateStorefront.isPending;
  const steps = [
    ["Storefront", mine.data?.onboarding?.profileComplete],
    ["Catalog", mine.data?.onboarding?.catalogComplete],
    ["Settlement", mine.data?.onboarding?.settlementComplete],
    ["Review", verificationState === "verified"],
  ] as const;

  function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const input = { ...storefront, bio: storefront.bio || null, category: storefront.category || null, contactPhone: storefront.contactPhone || null, contactEmail: storefront.contactEmail || null };
    if (hasStorefront) updateStorefront.mutate({ storefrontId, ...input });
    else createStorefront.mutate(input);
  }

  return (
    <SavannaShell>
      <div className="mx-auto max-w-[960px] space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Merchant studio</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#3d2d1a]">Your business, clearly presented.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#796b56]">Public storefront details, settlement credentials, and customer messages are deliberately kept separate.</p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          {steps.map(([label, complete], index) => <div key={label} className="flex items-center gap-3 rounded-2xl bg-[#fff6e2] p-4"><span className="grid size-7 place-items-center rounded-lg bg-white text-xs font-bold text-[#9a6410]">{complete ? <CheckCircle2 className="size-4" /> : index + 1}</span><span className="text-sm font-semibold text-[#5b4934]">{label}</span></div>)}
        </div>

        <section className="rounded-[28px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.05)] sm:p-8">
          <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f7e5bd] text-[#9a6410]"><UserRound className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Storefront profile</h2><p className="mt-1 text-sm text-[#796b56]">The Instagram-style public face of your business.</p></div></div>
          <form className="mt-6 space-y-5" onSubmit={saveProfile}>
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="shop-name">Business name</Label><Input id="shop-name" required value={storefront.name} onChange={event => setStorefront(current => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="shop-category">Category</Label><Input id="shop-category" value={storefront.category} onChange={event => setStorefront(current => ({ ...current, category: event.target.value }))} placeholder="Fresh food, tailoring, tutoring" /></div></div>
            <div className="space-y-2"><Label htmlFor="shop-bio">Business bio</Label><Textarea id="shop-bio" value={storefront.bio} onChange={event => setStorefront(current => ({ ...current, bio: event.target.value }))} maxLength={700} /></div>
            <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="shop-phone">Contact phone</Label><Input id="shop-phone" value={storefront.contactPhone} onChange={event => setStorefront(current => ({ ...current, contactPhone: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="shop-email">Contact email</Label><Input id="shop-email" type="email" value={storefront.contactEmail} onChange={event => setStorefront(current => ({ ...current, contactEmail: event.target.value }))} /></div></div>
            <div className="space-y-2"><Label htmlFor="shop-visibility">Visibility</Label><select id="shop-visibility" value={storefront.visibility} onChange={event => setStorefront(current => ({ ...current, visibility: event.target.value as StorefrontForm["visibility"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"><option value="draft">Draft — only you can see it</option><option value="public">Public — listed on Savanna Shops</option><option value="paused">Paused — hidden from discovery</option></select></div>
            <Button type="submit" disabled={pendingSave} className="rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">{pendingSave ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Store className="mr-2 size-4" />}{hasStorefront ? "Save storefront" : "Create storefront"}</Button>
          </form>
        </section>

        {hasStorefront ? <>
          <section className="rounded-[28px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.05)] sm:p-8">
            <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#fff1d4] text-[#9a6410]"><PackagePlus className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Catalog and pricing</h2><p className="mt-1 text-sm text-[#796b56]">Every product shows a transparent price before checkout.</p></div></div>
            <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); const priceMinor = Math.round(Number(product.price) * 100); if (!Number.isFinite(priceMinor) || priceMinor <= 0) return toast.error("Enter a valid price"); createProduct.mutate({ storefrontId, title: product.title, description: product.description || null, currencyCode: product.currencyCode, priceMinor, inventoryQuantity: product.inventory ? Number(product.inventory) : null, status: "active" }); }}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="product-title">Product title</Label><Input id="product-title" required value={product.title} onChange={event => setProduct(current => ({ ...current, title: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="product-price">Price</Label><Input id="product-price" type="number" min="0" step="0.01" required value={product.price} onChange={event => setProduct(current => ({ ...current, price: event.target.value }))} /></div></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="product-description">Description</Label><Textarea id="product-description" value={product.description} onChange={event => setProduct(current => ({ ...current, description: event.target.value }))} maxLength={1800} /></div><div className="space-y-2"><Label htmlFor="product-stock">Stock (optional)</Label><Input id="product-stock" type="number" min="0" value={product.inventory} onChange={event => setProduct(current => ({ ...current, inventory: event.target.value }))} /></div></div>
              <Button type="submit" disabled={createProduct.isPending} className="rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]"><PackagePlus className="mr-2 size-4" />Add product</Button>
            </form>
          </section>

          <section className="rounded-[28px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.05)] sm:p-8">
            <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f7e5bd] text-[#9a6410]"><CircleDollarSign className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Settlement details</h2><p className="mt-1 text-sm text-[#796b56]">Recipient references are encrypted and never shown on your public profile.</p></div></div>
            <form className="mt-6 space-y-5" onSubmit={event => { event.preventDefault(); saveSettlement.mutate({ storefrontId, ...settlement }); }}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="settlement-country">Country</Label><select id="settlement-country" value={settlement.countryCode} onChange={event => setSettlement(current => ({ ...current, countryCode: event.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm">{countries.data?.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="settlement-provider">Payment partner</Label><select id="settlement-provider" value={settlement.providerCode} onChange={event => setSettlement(current => ({ ...current, providerCode: event.target.value }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm">{partners.data?.map(partner => <option key={partner.code} value={partner.code}>{partner.name}</option>)}</select></div></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="recipient-alias">Recipient name</Label><Input id="recipient-alias" required value={settlement.recipientAlias} onChange={event => setSettlement(current => ({ ...current, recipientAlias: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="recipient-reference">Recipient account or wallet reference</Label><Input id="recipient-reference" required value={settlement.recipientReference} onChange={event => setSettlement(current => ({ ...current, recipientReference: event.target.value }))} /></div></div>
              <div className="rounded-2xl border border-[#ead2a4] bg-[#fffaf0] p-4 text-sm leading-6 text-[#775b31]">The selected partner remains disabled until Savanna has verified merchant eligibility, credentials, and its callback configuration.</div>
              <Button type="submit" disabled={saveSettlement.isPending} className="rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]"><CircleDollarSign className="mr-2 size-4" />Submit settlement details</Button>
            </form>
          </section>

          <section className="rounded-[28px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.05)] sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Verification review</h2><p className="mt-2 text-sm leading-6 text-[#796b56]">Status: <strong className="capitalize">{verificationState}</strong>. Submit your storefront after your public profile and payout details are ready.</p></div><BadgeCheck className="size-6 text-[#a4660d]" /></div>{verificationState === "unverified" || verificationState === "rejected" ? <Button onClick={() => submitVerification.mutate({ storefrontId })} disabled={submitVerification.isPending} className="mt-5 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">{submitVerification.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <BadgeCheck className="mr-2 size-4" />}Request verification</Button> : null}</section>
        </> : null}
      </div>
    </SavannaShell>
  );
}
