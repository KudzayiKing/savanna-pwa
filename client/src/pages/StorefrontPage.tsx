import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, BadgeCheck, Loader2, MessageCircle, Package, ShoppingBag, Store } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function StorefrontPage() {
  const [, params] = useRoute("/shops/:slug");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const shop = trpc.commerce.storefronts.detail.useQuery({ slug: params?.slug ?? "" }, { enabled: Boolean(params?.slug) });
  const support = trpc.commerce.storefronts.supportConversation.useMutation({ onSuccess: () => navigate("/messages"), onError: error => toast.error(error.message) });
  const createOrder = trpc.commerce.orders.create.useMutation({ onSuccess: () => { toast.success("Order created. Confirm payment next."); navigate("/orders"); }, onError: error => toast.error(error.message) });

  if (shop.isLoading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div></SavannaShell>;
  if (!shop.data) return <SavannaShell><section className="grid min-h-[60vh] place-items-center text-center"><div><Store className="mx-auto size-8 text-[#D9A441]" /><h1 className="mt-4 font-display text-3xl font-semibold">This storefront is unavailable.</h1><Link href="/shops"><Button variant="outline" className="mt-5 rounded-xl">Back to shops</Button></Link></div></section></SavannaShell>;

  const { storefront, products } = shop.data;

  return <SavannaShell>
    <div className="space-y-6">
      <Link href="/shops" className="inline-flex items-center gap-1 text-sm font-semibold text-[#D9A441]"><ArrowLeft className="size-4" /> All shops</Link>

      <section className="overflow-hidden rounded-[30px] border border-[#DDE3DC] bg-[#F6F5F5] shadow-[0_12px_30px_rgba(21,26,23,0.06)]">
        {storefront.coverUrl ? <img src={storefront.coverUrl} alt="" className="h-44 w-full object-cover" /> : <div className="h-44 bg-[radial-gradient(circle_at_76%_26%,rgba(217,164,65,0.52),transparent_24%),linear-gradient(135deg,#fff7e2_0%,#D9A441_100%)]" />}
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
            <Button onClick={() => isAuthenticated ? support.mutate({ storefrontId: storefront.id }) : startLogin()} disabled={support.isPending} variant="outline" className="rounded-xl border-[#DDE3DC] text-[#D9A441] hover:bg-[#D9A441]/20"><MessageCircle className="mr-2 size-4" />Ask a question</Button>
            {storefront.contactPhone ? <a href={`tel:${storefront.contactPhone}`}><Button variant="outline" className="rounded-xl border-[#DDE3DC] text-[#D9A441]">Call seller</Button></a> : null}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D9A441]">Catalog</p><h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17]">Available now</h2></div>
          <span className="text-sm text-[#5F6861]">Prices shown before checkout</span>
        </div>
        {products.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{products.map(product => <article key={product.id} className="overflow-hidden rounded-[24px] border border-[#DDE3DC] bg-[#F6F5F5] shadow-[0_10px_25px_rgba(21,26,23,0.05)]">
          <Link href={`/shops/${storefront.slug}/products/${product.id}`}>
            {product.primaryImageUrl ? <img src={product.primaryImageUrl} alt="" className="h-40 w-full object-cover transition-transform hover:scale-[1.02]" /> : <div className="grid h-40 place-items-center bg-[#D9A441]/20 transition-transform hover:scale-[1.02]"><Package className="size-10 text-[#D9A441]" /></div>}
          </Link>
          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5F6861]">{product.category || "Product"}</p>
            <Link href={`/shops/${storefront.slug}/products/${product.id}`}><h3 className="mt-1 text-base font-semibold text-[#151A17] hover:text-[#D9A441]">{product.title}</h3></Link>
            <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-[#5F6861]">{product.description || "More details from this Savanna seller."}</p>
            <div className="mt-5 flex items-center justify-between gap-3"><span className="text-lg font-semibold text-[#D9A441]">{formatPrice(product.priceMinor, product.currencyCode)}</span><Button onClick={() => isAuthenticated ? createOrder.mutate({ items: [{ productId: product.id, quantity: 1 }] }) : startLogin()} disabled={createOrder.isPending} className="rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]"><ShoppingBag className="mr-1.5 size-4" />Buy</Button></div>
          </div>
        </article>)}</div> : <div className="rounded-[24px] border border-dashed border-[#DDE3DC] bg-[#F6F5F5] p-8 text-sm text-[#5F6861]">This storefront does not have public products yet.</div>}
      </section>
    </div>
  </SavannaShell>;
}
