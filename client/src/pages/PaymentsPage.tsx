import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { CircleDollarSign, Loader2, ReceiptText } from "lucide-react";
import { Link } from "wouter";

function money(minor: number, currency: string) { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100); }

export default function PaymentsPage() {
  const { isAuthenticated, loading } = useAuth();
  const payments = trpc.payments.mine.useQuery(undefined, { enabled: isAuthenticated });
  if (loading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#31583a]" /></div></SavannaShell>;
  if (!isAuthenticated) return <SavannaShell><section className="grid min-h-[60vh] place-items-center rounded-[30px] border border-[#DDE3DC] bg-white p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><CircleDollarSign className="size-7" /></span><h1 className="mt-4 font-display text-3xl font-semibold text-[#151A17]">Your payment requests, in one place.</h1><Button onClick={() => startLogin()} className="savanna-brand-token mt-5 rounded-xl px-5 shadow-none"><CircleDollarSign className="mr-2 size-4" />Sign in to payments</Button></div></section></SavannaShell>;
  return <SavannaShell><div className="mx-auto max-w-[920px] space-y-6"><header><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b8065]">Payments</p><h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#263126]">Every request, clearly recorded.</h1><p className="mt-3 text-sm leading-6 text-[#697567]">Receipts appear only after a verified provider result.</p></header>{payments.isLoading ? <Loader2 className="size-6 animate-spin text-[#31583a]" /> : payments.data?.length ? <div className="space-y-3">{payments.data.map(payment => <Link key={payment.id} href={`/payments/${payment.id}`}><article className="flex flex-col justify-between gap-3 rounded-[22px] border border-[#dce1d3] bg-white p-5 shadow-[0_8px_20px_rgba(39,54,37,0.03)] transition hover:border-[#b8cbb4] sm:flex-row sm:items-center"><div><p className="font-semibold text-[#354135]">{payment.paymentReference}</p><p className="mt-1 text-xs text-[#74816f]">{payment.providerCode} · {new Date(payment.createdAt).toLocaleString()}</p></div><div className="text-left sm:text-right"><p className="font-semibold text-[#24482f]">{money(payment.totalMinor, payment.currencyCode)}</p><p className="mt-1 text-xs font-semibold capitalize text-[#80572c]">{payment.state.replaceAll("_", " ")}</p></div></article></Link>)}</div> : <div className="rounded-[24px] border border-dashed border-[#cbd6c6] bg-[#f5f7f3] p-8 text-sm text-[#74816f]">You do not have any payment requests yet.</div>}</div></SavannaShell>;
}
