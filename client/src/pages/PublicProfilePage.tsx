import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Loader2, MapPin, UserRound } from "lucide-react";
import { Link, useRoute } from "wouter";

export default function PublicProfilePage() {
  const [, params] = useRoute("/people/:userId");
  const userId = Number(params?.userId);
  const profile = trpc.account.profile.useQuery({ userId }, { enabled: Number.isInteger(userId) && userId > 0, retry: false });

  if (profile.isLoading) return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#31583a]" /></div></SavannaShell>;
  if (!profile.data) return <SavannaShell><section className="grid min-h-[60vh] place-items-center rounded-[30px] border border-dashed border-[#cbd6c6] bg-[#f5f7f3] text-center"><div><UserRound className="mx-auto size-8 text-[#9aac96]" /><h1 className="mt-4 font-display text-3xl font-semibold text-[#263126]">This profile is unavailable.</h1><Link href="/"><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#31583a]"><ArrowLeft className="size-4" /> Back to Savanna</span></Link></div></section></SavannaShell>;
  const item = profile.data;
  return <SavannaShell><div className="mx-auto max-w-[760px] space-y-6"><Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-[#496348]"><ArrowLeft className="size-4" /> Back to Savanna</Link><section className="rounded-[30px] border border-[#dce1d3] bg-white p-7 shadow-[0_14px_35px_rgba(39,54,37,0.04)]"><div className="flex items-start justify-between gap-4"><span className="grid size-16 place-items-center rounded-[22px] bg-[#e8dfc9] font-display text-2xl font-semibold text-[#80522a]">{item.displayName.slice(0, 1).toUpperCase()}</span><SafetyActions targetDomain="profile" targetId={String(item.userId)} targetLabel={item.displayName} blockUserId={item.userId} /></div><h1 className="mt-6 font-display text-4xl font-semibold tracking-[-0.06em] text-[#263126]">{item.displayName}</h1>{item.bio ? <p className="mt-3 max-w-xl text-sm leading-7 text-[#536250]">{item.bio}</p> : null}{item.city || item.countryCode ? <p className="mt-5 flex items-center gap-2 text-sm text-[#697567]"><MapPin className="size-4 text-[#658463]" />{[item.city, item.countryCode].filter(Boolean).join(", ")}</p> : null}</section></div></SavannaShell>;
}
