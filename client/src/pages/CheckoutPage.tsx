import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { startLogin } from "@/const";
import { useNetworkState } from "@/hooks/useNetworkState";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CircleAlert, Loader2, LockKeyhole, ReceiptText, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useRoute } from "wouter";

function formatPrice(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function CheckoutPage() {
  const [, params] = useRoute("/checkout/:subjectType/:subjectId");
  const { isAuthenticated, loading } = useAuth();
  const { isOnline } = useNetworkState();
  const subjectType = params?.subjectType === "course" ? "course" : "order";
  const subjectId = Number(params?.subjectId);
  const [countryCode, setCountryCode] = useState("KE");
  const [providerCode, setProviderCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const countries = trpc.payments.countries.useQuery();
  const partners = trpc.payments.partners.useQuery({ countryCode });
  const orderIntent = trpc.payments.createOrderIntent.useMutation({ onError: error => toast.error(error.message) });
  const enrollmentIntent = trpc.payments.createEnrollmentIntent.useMutation({ onError: error => toast.error(error.message) });
  const selectedPartner = partners.data?.find(partner => partner.code === providerCode) ?? null;
  const orderQuote = trpc.payments.quoteOrder.useQuery({ orderId: subjectId, countryCode, providerCode }, { enabled: isAuthenticated && subjectType === "order" && Number.isInteger(subjectId) && Boolean(providerCode), retry: false });
  const enrollmentQuote = trpc.payments.quoteEnrollment.useQuery({ enrollmentId: subjectId, countryCode, providerCode }, { enabled: isAuthenticated && subjectType === "course" && Number.isInteger(subjectId) && Boolean(providerCode), retry: false });
  const quote = subjectType === "order" ? orderQuote.data : enrollmentQuote.data;
  const result = orderIntent.data ?? enrollmentIntent.data;
  const isBusy = orderIntent.isPending || enrollmentIntent.isPending;

  useEffect(() => {
    setProviderCode(partners.data?.[0]?.code ?? "");
  }, [partners.data]);

  const beginRequest = () => {
    if (!isOnline) return toast.error("Reconnect to create a payment request");
    if (!Number.isInteger(subjectId) || subjectId <= 0) return toast.error("This checkout request is invalid");
    if (!selectedPartner) return toast.error("Choose a payment partner");
    if (!confirmed || !quote) return toast.error("Confirm the amount and recipient before continuing");
    if (subjectType === "order") orderIntent.mutate({ orderId: subjectId, countryCode, providerCode });
    else enrollmentIntent.mutate({ enrollmentId: subjectId, countryCode, providerCode });
  };

  if (loading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#9a6410]" /></div></SavannaShell>;
  if (!isAuthenticated) return <SavannaShell><section className="grid min-h-[62vh] place-items-center rounded-[30px] border border-[#eadfca] bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f7e5bd] text-[#9a6410]"><Smartphone className="size-6" /></span><h1 className="mt-6 font-display text-4xl font-semibold tracking-[-0.06em] text-[#3d2d1a]">Confirm payments with clarity.</h1><p className="mt-4 text-sm leading-7 text-[#796b56]">Sign in to review the recipient and payment request.</p><Button onClick={() => startLogin()} className="mt-6 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">Sign in to continue</Button></div></section></SavannaShell>;

  return <SavannaShell><div className="mx-auto max-w-[760px] space-y-6"><Link href="/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-[#7b4a0d]"><ArrowLeft className="size-4" /> Back to orders</Link><header><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Partner-led checkout</p><h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#3d2d1a]">Check every detail before you pay.</h1><p className="mt-3 text-sm leading-6 text-[#796b56]">Savanna prepares the payment request; the selected provider handles authorization and transaction processing.</p></header>{!isOnline ? <div role="status" className="flex gap-3 rounded-2xl border border-[#e5c79c] bg-[#fff5e2] p-4 text-sm leading-6 text-[#6f491d]"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p>You are offline. Review this checkout if needed, but reconnect before creating or authorizing any payment request.</p></div> : null}{result ? <section className="rounded-[30px] border border-[#e7d3ab] bg-[#fff8e8] p-7 shadow-[0_14px_35px_rgba(94,58,11,0.08)]"><span className="grid size-12 place-items-center rounded-2xl bg-[#f7e5bd] text-[#9a6410]"><ReceiptText className="size-6" /></span><p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Payment request created</p><h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#3d2d1a]">{result.intent.paymentReference}</h2><div className="mt-6 grid gap-3 rounded-2xl bg-white p-5 sm:grid-cols-2"><div><p className="text-xs text-[#8a765d]">Recipient</p><p className="mt-1 font-semibold text-[#4a3824]">{result.intent.recipientLabel}</p></div><div><p className="text-xs text-[#8a765d]">Partner</p><p className="mt-1 font-semibold text-[#4a3824]">{result.partner.name}</p></div><div><p className="text-xs text-[#8a765d]">Total request</p><p className="mt-1 text-lg font-semibold text-[#7b4a0d]">{formatPrice(result.intent.totalMinor, result.intent.currencyCode)}</p></div><div><p className="text-xs text-[#8a765d]">Status</p><p className="mt-1 font-semibold text-[#9a6410]">Awaiting provider authorization</p></div></div><div className="mt-5 flex gap-3 rounded-2xl border border-[#e5d3ae] bg-[#fffaf0] p-4 text-sm leading-6 text-[#775b31]"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p><strong>Live provider connection is not enabled in this environment.</strong> No funds have moved. When a country partner is configured, Savanna will issue the provider prompt and only mark this request paid after a verified callback.</p></div><Link href={`/payments/${result.intent.id}`}><Button className="mt-6 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">View payment status</Button></Link></section> : <section className="rounded-[30px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.05)] sm:p-8"><div className="grid gap-6 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="country" className="text-sm font-semibold text-[#4a3824]">Country</label><select id="country" value={countryCode} onChange={event => { setCountryCode(event.target.value); setConfirmed(false); }} className="flex h-11 w-full rounded-xl border border-[#eadfca] bg-white px-3 text-sm">{countries.data?.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></div><div className="space-y-2"><label htmlFor="provider" className="text-sm font-semibold text-[#4a3824]">Payment partner</label><select id="provider" value={providerCode} onChange={event => { setProviderCode(event.target.value); setConfirmed(false); }} className="flex h-11 w-full rounded-xl border border-[#eadfca] bg-white px-3 text-sm" disabled={partners.isLoading}>{partners.data?.map(partner => <option key={partner.code} value={partner.code}>{partner.name}</option>)}</select></div></div><div className="mt-5 rounded-2xl border border-[#eadfca] bg-[#fffdf8] p-5">{quote ? <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-[#8a765d]">Recipient</p><p className="mt-1 font-semibold text-[#4a3824]">{quote.recipientLabel}</p></div><div><p className="text-xs text-[#8a765d]">Subtotal</p><p className="mt-1 font-semibold text-[#4a3824]">{formatPrice(quote.subtotalMinor, quote.currencyCode)}</p></div><div><p className="text-xs text-[#8a765d]">Fee</p><p className="mt-1 font-semibold text-[#4a3824]">{formatPrice(quote.feeMinor, quote.currencyCode)}</p></div><div><p className="text-xs text-[#8a765d]">Total you will authorize</p><p className="mt-1 text-lg font-semibold text-[#7b4a0d]">{formatPrice(quote.totalMinor, quote.currencyCode)}</p></div></div> : <p className="text-sm text-[#775b31]">{(orderQuote.isFetching || enrollmentQuote.isFetching) ? "Loading payment details…" : "A verified merchant settlement profile is required before this payment can be requested."}</p>}</div><div className="mt-5 rounded-2xl bg-[#fff6e2] p-5"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f7e5bd] text-[#9a6410]"><ShieldCheck className="size-4" /></span><div><p className="font-semibold text-[#4a3824]">Your confirmation is required</p><p className="mt-1 text-sm leading-6 text-[#796b56]">{selectedPartner?.consentCopy ?? "Select a country and provider to see its payment-request disclosure."}</p></div></div></div><label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#eadfca] bg-white p-4 text-sm leading-6 text-[#665846]"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!quote} className="mt-1 size-4 accent-[#9a6410]" /><span>I confirm that Savanna should create a payment request for the amount and recipient shown above. I understand that payment data is processed by the selected provider under its own terms.</span></label><Button onClick={beginRequest} disabled={!isOnline || !quote || !confirmed || !selectedPartner || isBusy} className="mt-6 rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">{isBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LockKeyhole className="mr-2 size-4" />}{isOnline ? "Create payment request" : "Reconnect to pay"}</Button></section>}</div></SavannaShell>;
}
