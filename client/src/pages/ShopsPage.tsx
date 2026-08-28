import { AnimatedSearchIcon, AnimatedStoreIcon } from "@/components/AnimatedNavIcons";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ArrowRight, BadgeCheck, Loader2, PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

const SHOPPING_BANNER_URL = "/shops_banner.png";
type ShopFilter = "all" | "products" | "shops";

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function ShopsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShopFilter>("all");
  const shops = trpc.commerce.storefronts.list.useQuery(query ? { query } : undefined);
  const products = trpc.commerce.storefronts.products.useQuery(query ? { query } : undefined);
  const featuredProducts = useMemo(() => (products.data ?? []).slice(0, 6), [products.data]);
  const isLoading = shops.isLoading || products.isLoading;
  const hasResults = (shops.data?.length ?? 0) > 0 || (products.data?.length ?? 0) > 0;

  return <SavannaShell>
    <div className="savanna-route-shops space-y-7">
      <section className="savanna-discovery-banner overflow-hidden rounded-[26px]" aria-label="Local commerce">
        <img src={SHOPPING_BANNER_URL} alt="Local commerce — the people behind the things you need" className="block aspect-[8/3] w-full object-cover" />
      </section>

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <p className="max-w-2xl text-sm leading-6 text-[#796b56]">Browse public Savanna storefronts, see transparent prices, and open a direct question before you buy.</p>
        <Link href="/shops/manage"><Button className="shrink-0 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]"><AnimatedStoreIcon className="mr-2 size-4" />Open your shop</Button></Link>
      </header>

      <label className="savanna-route-search savanna-desktop-chat-search flex h-12 max-w-xl items-center gap-3 rounded-2xl border border-[#d5ddd0] bg-white px-4 shadow-[0_6px_14px_rgba(39,54,37,0.035)]">
        <AnimatedSearchIcon size={17} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search shops or products" aria-label="Search shops or products" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#92a08e]" />
      </label>

      <div className="savanna-discovery-tabs flex gap-2 overflow-x-auto pb-1" aria-label="Shop discovery filters">
        {([ ["all", "All"], ["products", "Products"], ["shops", "Shops"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} data-active={filter === value} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors">{label}</button>)}
      </div>

      {isLoading ? <div className="grid min-h-72 place-items-center"><Loader2 className="size-6 animate-spin text-[#9a6410]" /></div> : <>
        {filter !== "shops" && featuredProducts.length > 0 ? <section className="savanna-discovery-section space-y-4" aria-labelledby="featured-products-heading">
          <div className="flex items-end justify-between gap-4"><div><p className="savanna-route-eyebrow text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Featured discovery</p><h2 id="featured-products-heading" className="mt-1 font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Featured products</h2></div><span className="text-xs text-[#796b56]">Newest active listings</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{featuredProducts.map(product => <Link key={product.id} href={`/shops/${product.storefrontSlug}/products/${product.id}`} className="savanna-discovery-card group rounded-[22px] bg-white p-4 shadow-[0_8px_20px_rgba(39,54,37,0.03)] transition-transform hover:-translate-y-0.5"><div className="flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f7e5bd] text-[#9a6410]"><PackageSearch className="size-4" /></span><span className="text-lg font-semibold text-[#7b4a0d]">{formatPrice(product.priceMinor, product.currencyCode)}</span></div><p className="mt-4 font-semibold text-[#4a3824]">{product.title}</p><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-[#796b56]">{product.description || "Available from a public Savanna storefront."}</p><div className="mt-4 flex items-center justify-between gap-3 text-xs"><span className="truncate text-[#8a765d]">{product.storefrontName}</span><span className="inline-flex items-center gap-1 font-semibold text-[#9a6410]">View <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span></div></Link>)}</div>
        </section> : null}

        {filter !== "products" && shops.data?.length ? <section className="savanna-discovery-section space-y-4" aria-labelledby="shops-heading">
          <div className="flex items-end justify-between gap-4"><div><p className="savanna-route-eyebrow text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Storefronts</p><h2 id="shops-heading" className="mt-1 font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">Shop directly with local businesses</h2></div><span className="text-xs text-[#796b56]">{shops.data.length} available</span></div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{shops.data.map(shop => <Link key={shop.id} href={`/shops/${shop.slug}`} className="savanna-discovery-card group overflow-hidden rounded-[26px] bg-white shadow-[0_14px_35px_rgba(94,58,11,0.045)] transition-transform hover:-translate-y-0.5"><div className="h-28 bg-[radial-gradient(circle_at_74%_22%,rgba(227,164,60,0.62),transparent_23%),linear-gradient(135deg,#74460d_0%,#d6a552_100%)]" /><div className="relative p-5"><span className="absolute -top-10 grid size-16 place-items-center rounded-[20px] border-4 border-white bg-[#f7e5bd] text-xl font-semibold text-[#9a6410]">{shop.name.slice(0, 1).toUpperCase()}</span><div className="ml-20 flex items-start justify-between gap-2"><div><p className="text-[15px] font-semibold text-[#4a3824]">{shop.name}</p><p className="mt-1 text-xs text-[#8a765d]">{shop.category || "Independent business"}</p></div>{shop.verificationState === "verified" ? <BadgeCheck className="size-4 text-[#a4660d]" /> : null}</div><p className="mt-5 line-clamp-2 min-h-10 text-sm leading-5 text-[#796b56]">{shop.bio || "A Savanna seller with a clear catalog and direct support."}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-[#9a6410]">Visit shop <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span></div></Link>)}</div>
        </section> : null}

        {!hasResults ? <section className="savanna-discovery-empty grid min-h-80 place-items-center rounded-[30px] bg-[#fffaf0] p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f7e5bd] text-[#9a6410]"><AnimatedStoreIcon size={24} /></span><h2 className="mt-5 font-display text-3xl font-semibold tracking-[-0.05em] text-[#3d2d1a]">Your local catalog begins here.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#8a765d]">No public shops or active products match this view yet. Merchant onboarding puts owners in control of their profile, products, prices, and settlement preferences.</p><Link href="/shops/manage"><Button variant="outline" className="mt-6 rounded-xl border-[#ead2a4] bg-transparent text-[#9a6410]">Set up a storefront</Button></Link></div></section> : null}
      </>}
    </div>
  </SavannaShell>;
}
