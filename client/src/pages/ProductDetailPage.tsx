import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, MessageCircle, Package, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";

function price(minor: number, currency: string) { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100); }

export default function ProductDetailPage() {
  const [, params] = useRoute("/shops/:slug/products/:productId");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const shop = trpc.commerce.storefronts.detail.useQuery({ slug: params?.slug ?? "" }, { enabled: Boolean(params?.slug) });
  const createOrder = trpc.commerce.orders.create.useMutation({ onSuccess: () => { toast.success("Order created. Confirm payment next."); navigate("/orders"); }, onError: error => toast.error(error.message) });
  const support = trpc.commerce.storefronts.supportConversation.useMutation({ onSuccess: () => navigate("/messages"), onError: error => toast.error(error.message) });
  const productId = Number(params?.productId);
  if (shop.isLoading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#31583a]" /></div></SavannaShell>;
  const product = shop.data?.products.find(item => item.id === productId);
  if (!shop.data || !product) return <SavannaShell><section className="grid min-h-[60vh] place-items-center text-center"><div><Package className="mx-auto size-8 text-[#9aac96]" /><h1 className="mt-4 font-display text-3xl font-semibold">This product is unavailable.</h1><Link href="/shops"><Button variant="outline" className="mt-5 rounded-xl">Back to shops</Button></Link></div></section></SavannaShell>;
  const { storefront } = shop.data;
  return <SavannaShell><div className="mx-auto max-w-[980px] space-y-6"><Link href={`/shops/${storefront.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[#496348]"><ArrowLeft className="size-4" /> {storefront.name}</Link><section className="grid overflow-hidden rounded-[30px] border border-[#dce1d3] bg-white shadow-[0_14px_35px_rgba(39,54,37,0.04)] md:grid-cols-[1.05fr_1fr]"><div className="grid min-h-[320px] place-items-center bg-[radial-gradient(circle_at_70%_25%,rgba(215,160,93,0.6),transparent_25%),linear-gradient(135deg,#e9e0c9_0%,#dce7d8_100%)]"><Package className="size-16 text-[#557452]/50" /></div><div className="p-7 sm:p-9"><div className="flex items-start justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b8065]">{product.category || "Product"}</p><SafetyActions targetDomain="product" targetId={String(product.id)} targetLabel={product.title} blockUserId={storefront.ownerUserId} /></div><h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.06em] text-[#263126]">{product.title}</h1><p className="mt-5 text-2xl font-semibold text-[#24482f]">{price(product.priceMinor, product.currencyCode)}</p><p className="mt-5 text-sm leading-7 text-[#536250]">{product.description || "The seller has not added more product details yet. Contact them directly if you have a question."}</p>{product.inventoryQuantity !== null ? <p className="mt-5 text-sm text-[#697567]">{product.inventoryQuantity > 0 ? `${product.inventoryQuantity} available` : "Currently unavailable"}</p> : null}<div className="mt-7 flex flex-wrap gap-3"><Button onClick={() => isAuthenticated ? createOrder.mutate({ items: [{ productId: product.id, quantity: 1 }] }) : startLogin()} disabled={createOrder.isPending || product.status !== "active"} className="rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]"><ShoppingBag className="mr-2 size-4" />Order now</Button><Button onClick={() => isAuthenticated ? support.mutate({ storefrontId: storefront.id }) : startLogin()} disabled={support.isPending} variant="outline" className="rounded-xl border-[#cbd6c6] text-[#31583a]"><MessageCircle className="mr-2 size-4" />Ask a question</Button></div></div></section></div></SavannaShell>;
}
