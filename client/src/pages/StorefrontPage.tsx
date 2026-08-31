import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { startLogin } from "@/const";
import { useFirebaseShopMutations, useFirebaseStorefrontDetail } from "@/lib/firebaseShops";
import { ArrowLeft, BadgeCheck, Image as ImageIcon, Loader2, MessageCircle, Package, Play, ShoppingBag, Sparkles, Store, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function StorefrontPage() {
  const [, params] = useRoute("/shops/:slug");
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const shop = useFirebaseStorefrontDetail(params?.slug, user);
  const shopMutations = useFirebaseShopMutations();
  const [activeTab, setActiveTab] = useState<"catalog" | "memories">("catalog");

  if (shop.isLoading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div></SavannaShell>;
  if (!shop.data) return <SavannaShell><section className="grid min-h-[60vh] place-items-center text-center"><div><Store className="mx-auto size-8 text-[#D9A441]" /><h1 className="mt-4 font-display text-3xl font-semibold">This storefront is unavailable.</h1><Link href="/shops"><Button variant="outline" className="mt-5 rounded-xl">Back to shops</Button></Link></div></section></SavannaShell>;

  const { storefront, products, memories = [] } = shop.data;
  const isOwner = user?.id === storefront.ownerUserId;
  const storyComposerHref = `/stories?compose=1&storefrontId=${encodeURIComponent(storefront.id)}&storefrontSlug=${encodeURIComponent(storefront.slug)}&storefrontName=${encodeURIComponent(storefront.name)}`;

  return <SavannaShell>
    <div className="space-y-6">
      <Link href="/shops" className="inline-flex items-center gap-1 text-sm font-semibold text-[#D9A441]"><ArrowLeft className="size-4" /> All shops</Link>

      <section className="overflow-hidden rounded-[30px] border border-[#DDE3DC] bg-white shadow-[0_12px_30px_rgba(21,26,23,0.06)]">
        {storefront.coverUrl ? <img src={storefront.coverUrl} alt="" className="h-44 w-full object-cover" /> : <div className="h-44 bg-[#D9A441]/20" />}
        <div className="relative p-6 sm:p-8">
          <span className="absolute -top-12 grid size-20 place-items-center rounded-[24px] border-4 border-white bg-[#D9A441]/20 text-3xl font-semibold text-[#D9A441]">{storefront.name.slice(0, 1).toUpperCase()}</span>
          <div className="ml-[104px] flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">{storefront.name}</h1>
                {storefront.verificationState === "verified" ? <BadgeCheck className="size-5 text-[#D9A441]" /> : null}
              </div>
              <p className="mt-1 text-sm text-[#5F6861]">{storefront.category || "Independent business"}</p>
            </div>
            <SafetyActions targetDomain="storefront" targetId={String(storefront.id)} targetLabel={storefront.name} blockUserId={storefront.ownerUserId} />
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-[#5F6861]">{storefront.bio || "This seller has chosen a simple Savanna storefront with direct support and transparent pricing."}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {isOwner ? (
              <Link href={storyComposerHref}>
                <Button type="button" className="savanna-brand-token rounded-xl shadow-none"><Sparkles className="mr-2 size-4" />Share story</Button>
              </Link>
            ) : null}
            <Button onClick={() => isAuthenticated && user ? shopMutations.support.mutate({ user, storefront }, { onSuccess: () => navigate("/messages"), onError: error => toast.error(error.message) }) : startLogin()} disabled={shopMutations.support.isPending} variant="outline" className="rounded-xl border-[#DDE3DC] text-[#D9A441] hover:bg-[#D9A441]/20"><MessageCircle className="mr-2 size-4" />Ask a question</Button>
            {storefront.contactPhone ? <a href={`tel:${storefront.contactPhone}`}><Button variant="outline" className="rounded-xl border-[#DDE3DC] text-[#D9A441]">Call seller</Button></a> : null}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-5 inline-flex rounded-full border border-[#eadfca] bg-white p-1 shadow-[0_12px_28px_rgba(94,58,11,0.035)]">
          {([
            ["catalog", "Catalog", Package],
            ["memories", "Memories", Play],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              data-active={activeTab === value}
              className={`inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${activeTab === value ? "bg-[#D9A441]/20 text-[#D9A441]" : "text-[#5F6861] hover:bg-[#D9A441]/10 hover:text-[#A87820]"}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D9A441]">{activeTab === "catalog" ? "Catalog" : "Memories"}</p><h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17]">{activeTab === "catalog" ? "Available now" : "Product stories"}</h2></div>
          <span className="text-sm text-[#5F6861]">{activeTab === "catalog" ? "Prices shown before checkout" : "Saved beyond 24 hours"}</span>
        </div>
        {activeTab === "catalog" ? (
          products.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{products.map(product => <article key={product.id} className="overflow-hidden rounded-[24px] border border-[#DDE3DC] bg-white shadow-[0_10px_25px_rgba(21,26,23,0.05)]">
          <Link href={`/shops/${storefront.slug}/products/${product.id}`}>
            {product.primaryImageUrl ? <img src={product.primaryImageUrl} alt="" className="h-40 w-full object-cover transition-transform hover:scale-[1.02]" /> : <div className="grid h-40 place-items-center bg-[#D9A441]/20 transition-transform hover:scale-[1.02]"><Package className="size-10 text-[#D9A441]" /></div>}
          </Link>
          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5F6861]">{product.category || "Product"}</p>
            <Link href={`/shops/${storefront.slug}/products/${product.id}`}><h3 className="mt-1 text-base font-semibold text-[#151A17] hover:text-[#D9A441]">{product.title}</h3></Link>
            <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#5F6861]">{product.description || "More details from this Savanna seller."}</p>
            <div className="mt-5 flex items-center justify-between gap-3"><span className="text-lg font-semibold text-[#D9A441]">{formatPrice(product.priceMinor, product.currencyCode)}</span><Button onClick={() => isAuthenticated && user ? shopMutations.createOrder.mutate({ user, product }, { onSuccess: () => { toast.success("Order created. Confirm payment next."); navigate("/orders"); }, onError: error => toast.error(error.message) }) : startLogin()} disabled={shopMutations.createOrder.isPending} className="rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]"><ShoppingBag className="mr-1.5 size-4" />Buy</Button></div>
          </div>
        </article>)}</div> : <div className="rounded-[24px] border border-dashed border-[#DDE3DC] bg-white p-8 text-sm text-[#5F6861]">This storefront does not have public products yet.</div>
        ) : (
          memories.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{memories.map(memory => {
            const media = memory.media?.[0];
            return (
              <Link key={memory.id} href={`/stories?story=${memory.id}`} className="group overflow-hidden rounded-[24px] border border-[#DDE3DC] bg-white shadow-[0_10px_25px_rgba(21,26,23,0.05)]">
                <div className="relative grid aspect-[3/4] place-items-center overflow-hidden bg-[#151A17]">
                  {media?.url && media.type === "image" ? <img src={media.url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : null}
                  {media?.url && media.type === "video" ? <video src={media.url} className="h-full w-full object-cover" controls playsInline /> : null}
                  {!media?.url ? <span className="absolute inset-0 bg-[#D9A441]/20" /> : null}
                  <span className="absolute inset-0 bg-black/20" />
                  <span className="absolute left-4 top-4 grid size-10 place-items-center rounded-2xl bg-white/18 text-[#F8E8C4] backdrop-blur-md">
                    {media?.type === "video" ? <Video className="size-5" /> : media?.type === "image" ? <ImageIcon className="size-5" /> : <Play className="size-5" />}
                  </span>
                  <p className="absolute inset-x-4 bottom-4 line-clamp-3 text-lg font-semibold leading-6 text-white">{memory.textBody || memory.productDescription || "A product memory from this shop."}</p>
                </div>
                <div className="p-5">
                  <h3 className="text-base font-semibold text-[#151A17]">{memory.productName || "Product memory"}</h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#5F6861]">{memory.productDescription || "A short story from this seller."}</p>
                  {memory.productPriceMinor && memory.productCurrencyCode ? <p className="mt-5 text-lg font-semibold text-[#D9A441]">{formatPrice(memory.productPriceMinor, memory.productCurrencyCode)}</p> : null}
                </div>
              </Link>
            );
          })}</div> : <div className="rounded-[24px] border border-dashed border-[#DDE3DC] bg-white p-8 text-sm text-[#5F6861]">This storefront does not have product Memories yet.</div>
        )}
      </section>
    </div>
  </SavannaShell>;
}
