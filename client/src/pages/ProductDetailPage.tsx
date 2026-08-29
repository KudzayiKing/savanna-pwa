import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { startLogin } from "@/const";
import { useFirebaseShopMutations, useFirebaseStorefrontDetail } from "@/lib/firebaseShops";
import { ArrowLeft, Loader2, MessageCircle, Package, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";

function price(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function ProductDetailPage() {
  const [, params] = useRoute("/shops/:slug/products/:productId");
  const [, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const shop = useFirebaseStorefrontDetail(params?.slug, user);
  const shopMutations = useFirebaseShopMutations();
  const productId = params?.productId ?? "";

  if (shop.isLoading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div></SavannaShell>;
  const product = shop.data?.products.find(item => item.id === productId);
  if (!shop.data || !product) return <SavannaShell><section className="grid min-h-[60vh] place-items-center text-center"><div><Package className="mx-auto size-8 text-[#D9A441]" /><h1 className="mt-4 font-display text-3xl font-semibold">This product is unavailable.</h1><Link href="/shops"><Button variant="outline" className="mt-5 rounded-xl">Back to shops</Button></Link></div></section></SavannaShell>;

  const { storefront } = shop.data;
  const images = product.media.filter(item => item.type === "image" && item.url);
  const video = product.media.find(item => item.type === "video" && item.url);

  return <SavannaShell>
    <div className="mx-auto max-w-[980px] space-y-6">
      <Link href={`/shops/${storefront.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#D9A441]"><ArrowLeft className="size-4" /> {storefront.name}</Link>
      <section className="grid overflow-hidden rounded-[30px] border border-[#DDE3DC] bg-[#F6F5F5] shadow-[0_12px_30px_rgba(21,26,23,0.06)] md:grid-cols-[1.05fr_1fr]">
        <div className="space-y-3 bg-white p-3">
          {product.primaryImageUrl ? <img src={product.primaryImageUrl} alt="" className="aspect-square w-full rounded-[24px] object-cover md:aspect-[4/5]" /> : <div className="grid aspect-square w-full place-items-center rounded-[24px] bg-[#D9A441]/20 md:aspect-[4/5]"><Package className="size-16 text-[#D9A441]" /></div>}
          {images.length > 1 ? <div className="grid grid-cols-5 gap-2">{images.slice(0, 5).map(item => <img key={item.id} src={item.url ?? ""} alt="" className="aspect-square rounded-xl object-cover" />)}</div> : null}
          {video?.url ? <video controls playsInline src={video.url} className="mx-auto aspect-[9/16] max-h-[520px] w-full max-w-[300px] rounded-[22px] bg-black object-cover" /> : null}
        </div>
        <div className="p-7 sm:p-9">
          <div className="flex items-start justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D9A441]">{product.category || "Product"}</p><SafetyActions targetDomain="product" targetId={String(product.id)} targetLabel={product.title} blockUserId={storefront.ownerUserId} /></div>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">{product.title}</h1>
          <p className="mt-5 text-2xl font-semibold text-[#D9A441]">{price(product.priceMinor, product.currencyCode)}</p>
          <p className="mt-5 text-sm leading-7 text-[#5F6861]">{product.description || "The seller has not added more product details yet. Contact them directly if you have a question."}</p>
          {product.inventoryQuantity !== null ? <p className="mt-5 text-sm text-[#5F6861]">{product.inventoryQuantity > 0 ? `${product.inventoryQuantity} available` : "Currently unavailable"}</p> : null}
          <div className="mt-7 flex flex-wrap gap-3">
            <Button onClick={() => isAuthenticated && user ? shopMutations.createOrder.mutate({ user, product }, { onSuccess: () => { toast.success("Order created. Confirm payment next."); navigate("/orders"); }, onError: error => toast.error(error.message) }) : startLogin()} disabled={shopMutations.createOrder.isPending || product.status !== "active"} className="rounded-xl bg-[#D9A441] text-[#151A17] shadow-none hover:bg-[#E8B64A]"><ShoppingBag className="mr-2 size-4" />Order now</Button>
            <Button onClick={() => isAuthenticated && user ? shopMutations.support.mutate({ user, storefront }, { onSuccess: () => navigate("/messages"), onError: error => toast.error(error.message) }) : startLogin()} disabled={shopMutations.support.isPending} variant="outline" className="rounded-xl border-[#DDE3DC] text-[#D9A441]"><MessageCircle className="mr-2 size-4" />Ask a question</Button>
          </div>
        </div>
      </section>
    </div>
  </SavannaShell>;
}
