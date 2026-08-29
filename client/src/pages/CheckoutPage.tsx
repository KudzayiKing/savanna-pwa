import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { startLogin } from "@/const";
import { useNetworkState } from "@/hooks/useNetworkState";
import {
  paymentCountries,
  paymentPartners,
  useFirebaseOrder,
  useFirebaseShopMutations,
} from "@/lib/firebaseShops";
import { ArrowLeft, CircleAlert, Loader2, LockKeyhole, ReceiptText, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function CheckoutPage() {
  const [, params] = useRoute("/checkout/:subjectType/:subjectId");
  const { user, isAuthenticated, loading } = useAuth();
  const { isOnline } = useNetworkState();
  const subjectType = params?.subjectType === "course" ? "course" : "order";
  // Firestore document ids are strings - do not coerce this to a number.
  const subjectId = params?.subjectId ?? "";

  const [countryCode, setCountryCode] = useState("KE");
  const [providerCode, setProviderCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [placed, setPlaced] = useState(false);

  const orderQuery = useFirebaseOrder(subjectType === "order" ? subjectId : null, user);
  const order = orderQuery.data ?? null;
  const shopMutations = useFirebaseShopMutations();

  const countryPartners = useMemo(
    () => paymentPartners.filter(partner => partner.countryCode === countryCode),
    [countryCode],
  );
  const selectedPartner = countryPartners.find(partner => partner.code === providerCode) ?? null;

  const subtotal = order?.totalMinor ?? 0;
  const fees = order?.feeMinor ?? 0;
  const total = subtotal + fees;

  useEffect(() => {
    setProviderCode(countryPartners[0]?.code ?? "");
  }, [countryPartners]);

  const beginRequest = () => {
    if (!isOnline) return toast.error("Reconnect to confirm this order");
    if (!order) return toast.error("This checkout request is invalid");
    if (!selectedPartner) return toast.error("Choose how you plan to pay");
    if (!confirmed) return toast.error("Confirm the amount and recipient before continuing");
    shopMutations.confirmCheckout.mutate(
      { orderId: order.id, countryCode, providerCode },
      {
        onSuccess: () => {
          setPlaced(true);
          toast.success("Order confirmed. The seller has been notified.");
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  if (loading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#9a6410]" /></div></SavannaShell>;

  if (!isAuthenticated) return <SavannaShell><section className="grid min-h-[62vh] place-items-center rounded-[30px] border border-[#DDE3DC] bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><Smartphone className="size-6" /></span><h1 className="mt-6 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">Confirm orders with clarity.</h1><p className="mt-4 text-sm leading-7 text-[#5F6861]">Sign in to review the recipient and confirm your order.</p><Button onClick={() => startLogin()} className="savanna-brand-token mt-6 rounded-xl px-5 shadow-none"><Smartphone className="mr-2 size-4" />Sign in to continue</Button></div></section></SavannaShell>;

  // Learning is hidden for the MVP, so the course checkout path has nothing to
  // serve. Say so plainly instead of calling a router that is not deployed.
  if (subjectType === "course") return <SavannaShell><div className="savanna-route-orders mx-auto max-w-[760px] space-y-6"><Link href="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b4a0d]"><ArrowLeft className="size-4" /> Back to orders</Link><section className="grid min-h-[46vh] place-items-center rounded-[30px] bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f7e5bd] text-[#9a6410]"><CircleAlert className="size-6" /></span><h1 className="mt-6 font-display text-3xl font-semibold tracking-[-0.05em] text-[#3d2d1a]">Course checkout is not available yet.</h1><p className="mt-4 text-sm leading-7 text-[#5F6861]">Savanna Learn has not launched. Only shop orders can be confirmed right now.</p><Link href="/shops"><Button className="mt-6 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">Browse shops</Button></Link></div></section></div></SavannaShell>;

  if (orderQuery.isLoading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#9a6410]" /></div></SavannaShell>;

  if (!order) return <SavannaShell><div className="savanna-route-orders mx-auto max-w-[760px] space-y-6"><Link href="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b4a0d]"><ArrowLeft className="size-4" /> Back to orders</Link><section className="grid min-h-[46vh] place-items-center rounded-[30px] bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f7e5bd] text-[#9a6410]"><CircleAlert className="size-6" /></span><h1 className="mt-6 font-display text-3xl font-semibold tracking-[-0.05em] text-[#3d2d1a]">Order request unavailable.</h1><p className="mt-4 text-sm leading-7 text-[#5F6861]">This order no longer exists, or it belongs to another account.</p><Link href="/orders"><Button className="mt-6 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">Back to orders</Button></Link></div></section></div></SavannaShell>;

  const alreadyPaid = order.status !== "awaiting_payment";

  if (placed || alreadyPaid) return <SavannaShell><div className="savanna-route-orders mx-auto max-w-[760px] space-y-6">
    <Link href="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b4a0d]"><ArrowLeft className="size-4" /> Back to orders</Link>
    <section className="rounded-[30px] border border-[#e7d3ab] bg-[#fff8e8] p-7 shadow-[0_14px_35px_rgba(94,58,11,0.08)]">
      <span className="grid size-12 place-items-center rounded-2xl bg-[#f7e5bd] text-[#9a6410]"><ReceiptText className="size-6" /></span>
      <p className="savanna-route-eyebrow mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">{alreadyPaid ? "Order already settled" : "Order confirmed"}</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#3d2d1a]">{order.orderReference}</h1>
      <div className="mt-6 grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2">
        <div><p className="text-xs text-[#8a765d]">Recipient</p><p className="mt-1 font-semibold text-[#4a3824]">{order.storefrontName ?? "Savanna seller"}</p></div>
        <div><p className="text-xs text-[#8a765d]">Payment method</p><p className="mt-1 font-semibold text-[#4a3824]">{selectedPartner?.name ?? paymentPartners.find(partner => partner.code === order.paymentProviderCode)?.name ?? "Not selected"}</p></div>
        <div><p className="text-xs text-[#8a765d]">Total</p><p className="savanna-order-amount mt-1 text-lg font-semibold text-[#7b4a0d]">{formatPrice(total, order.currencyCode)}</p></div>
        <div><p className="text-xs text-[#8a765d]">Status</p><p className="mt-1 font-semibold text-[#4a3824]">{order.status.replace(/_/g, " ")}</p></div>
      </div>
      <p className="mt-6 text-sm leading-6 text-[#796b56]">Savanna is not processing payments yet, so nothing has been charged. Your seller can see this order and will arrange payment with you directly. Saved payment methods will work here as soon as the payment partners go live.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/orders"><Button className="rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">View my orders</Button></Link>
        <Link href={order.storefrontSlug ? `/shops/${order.storefrontSlug}` : "/shops"}><Button variant="outline" className="rounded-xl border-[#ead2a4] bg-transparent text-[#9a6410]">Message the seller</Button></Link>
      </div>
    </section>
  </div></SavannaShell>;

  return <SavannaShell><div className="savanna-route-orders mx-auto max-w-[760px] space-y-6">
    <Link href="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b4a0d]"><ArrowLeft className="size-4" /> Back to orders</Link>

    <header>
      <p className="savanna-route-eyebrow text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Order confirmation</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#3d2d1a]">Check every detail before you confirm.</h1>
      <p className="mt-3 text-sm leading-6 text-[#796b56]">Savanna is not processing payments yet. Confirming records how you plan to pay and notifies the seller, who will arrange payment with you directly.</p>
    </header>

    {!isOnline ? <div role="status" className="flex gap-3 rounded-2xl border border-[#e5c79c] bg-[#fff5e2] p-4 text-sm leading-6 text-[#6f491d]"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p>You are offline. Review this order if needed, but reconnect before confirming it.</p></div> : null}

    <section className="rounded-[30px] bg-white p-7 shadow-[0_14px_35px_rgba(94,58,11,0.045)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-[#8a765d]">Order</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.045em] text-[#3d2d1a]">{order.orderReference}</h2>
          <p className="mt-1 text-xs text-[#8a765d]">Placed {order.createdAt.toLocaleString()}</p>
        </div>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><ReceiptText className="size-5" /></span>
      </div>

      {order.items.length ? <ul className="mt-6 space-y-2 border-t border-[#f0e6d5] pt-5">{order.items.map((item, index) => <li key={`${item.productId}-${index}`} className="flex items-center justify-between gap-4 text-sm"><span className="min-w-0 flex-1 truncate text-[#4a3824]">{item.quantity} × {item.title}</span><span className="font-semibold text-[#7b4a0d]">{formatPrice(item.priceMinor * item.quantity, item.currencyCode)}</span></li>)}</ul> : null}

      <dl className="mt-5 space-y-2 border-t border-[#f0e6d5] pt-5 text-sm">
        <div className="flex items-center justify-between gap-4"><dt className="text-[#796b56]">Subtotal</dt><dd className="font-semibold text-[#4a3824]">{formatPrice(subtotal, order.currencyCode)}</dd></div>
        <div className="flex items-center justify-between gap-4"><dt className="text-[#796b56]">Fees</dt><dd className="font-semibold text-[#4a3824]">{formatPrice(fees, order.currencyCode)}</dd></div>
        <div className="flex items-center justify-between gap-4 border-t border-[#f0e6d5] pt-3"><dt className="font-semibold text-[#3d2d1a]">Total due</dt><dd className="savanna-order-amount text-lg font-semibold text-[#7b4a0d]">{formatPrice(total, order.currencyCode)}</dd></div>
      </dl>
    </section>

    <section className="rounded-[30px] bg-white p-7 shadow-[0_14px_35px_rgba(94,58,11,0.045)]">
      <h2 className="font-display text-xl font-semibold tracking-[-0.04em] text-[#3d2d1a]">How you plan to pay</h2>
      <p className="mt-2 text-sm leading-6 text-[#796b56]">This is saved on the order so we can charge it automatically once payment partners are live. Nothing is charged now.</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a765d]">Country</span>
          <select value={countryCode} onChange={event => setCountryCode(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#eadfca] bg-white px-3 text-sm text-[#4a3824] outline-none focus:border-[#D9A441]">
            {paymentCountries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8a765d]">Payment method</span>
          <select value={providerCode} onChange={event => setProviderCode(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#eadfca] bg-white px-3 text-sm text-[#4a3824] outline-none focus:border-[#D9A441]">
            {countryPartners.length ? countryPartners.map(partner => <option key={partner.code} value={partner.code}>{partner.name}</option>) : <option value="">No partner in this country yet</option>}
          </select>
        </label>
      </div>

      {selectedPartner && selectedPartner.currencyCode !== order.currencyCode ? <p role="status" className="mt-4 flex gap-3 rounded-2xl border border-[#e5c79c] bg-[#fff5e2] p-4 text-sm leading-6 text-[#6f491d]"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span>This order is priced in {order.currencyCode} but {selectedPartner.name} settles in {selectedPartner.currencyCode}. Your seller will confirm the converted amount with you.</span></p> : null}

      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#eadfca] p-4 text-sm leading-6 text-[#4a3824]">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4 accent-[#D9A441]" />
        <span>I confirm the total of <strong className="font-semibold">{formatPrice(total, order.currencyCode)}</strong> to <strong className="font-semibold">{order.storefrontName ?? "this Savanna seller"}</strong>, and I understand Savanna is not processing the payment yet.</span>
      </label>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={beginRequest} disabled={shopMutations.confirmCheckout.isPending || !confirmed || !selectedPartner} className="rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">
          {shopMutations.confirmCheckout.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
          Confirm order
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#8a765d]"><LockKeyhole className="size-3.5" />Recorded against your account</span>
      </div>
    </section>
  </div></SavannaShell>;
}
