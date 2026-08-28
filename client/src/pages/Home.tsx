import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SavannaShell } from "@/components/SavannaShell";
import { StoriesPanel } from "@/components/StoriesPanel";
import { ArrowRight, CirclePlay, MessageCircle, Store, Verified } from "lucide-react";
import { Link } from "wouter";

const discoveryCards = [
  { title: "Shop local, clearly", copy: "Discover storefronts with transparent prices and direct support.", action: "Explore shops", icon: Store, tint: "bg-[#e8dfc9]" },
  { title: "Learn from people you trust", copy: "Find structured courses and keep your learning progress in one place.", action: "Discover learning", icon: CirclePlay, tint: "bg-[#f2e8cd]" },
];

function HomeContent() {
  return (
    <div className="space-y-9">
      <div className="hidden lg:block"><StoriesPanel /></div>

      <section className="grid gap-4 md:grid-cols-2">
        {discoveryCards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className={`${card.tint} savanna-discovery-card group relative overflow-hidden rounded-[26px] p-6 sm:p-7`}>
              <Icon className="absolute -right-4 -top-3 size-28 text-black/[0.06] transition-transform duration-300 group-hover:scale-110" />
              <div className="relative max-w-[280px]">
                <p className="font-display text-2xl font-semibold tracking-[-0.04em] text-[#3d2d1a]">{card.title}</p>
                <p className="mt-2 text-sm leading-6 text-[#796b56]">{card.copy}</p>
                <Button variant="link" className="mt-5 h-auto px-0 font-semibold text-[#7b4a0d] hover:text-[#5d3a0c]">
                  {card.action} <ArrowRight className="ml-1.5 size-4" />
                </Button>
              </div>
            </article>
          );
        })}
      </section>

      <section id="savanna-onboarding" className="rounded-[28px] border border-[#dce1d3] bg-white p-6 shadow-[0_12px_30px_rgba(39,54,37,0.035)] sm:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Your Savanna</p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#3d2d1a]">A calmer way to connect and grow.</h2>
          </div>
          <Link href="/profile">
            <Button variant="outline" className="rounded-xl border-[#ead2a4] bg-transparent text-[#7b4a0d] hover:bg-[#fff1d4]">
              Set up your profile
            </Button>
          </Link>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {["Choose your privacy", "Start a conversation", "Open a shop or course"].map((item, index) => (
            <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#fff9ec] p-4">
              <span className="grid size-7 place-items-center rounded-lg bg-[#f8edcf] text-xs font-bold text-[#7b4a0d]">0{index + 1}</span>
              <span className="text-sm font-medium text-[#5b4934]">{item}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HomeContext() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Start here</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.05em] text-[#3d2d1a]">Set your pace.</h2>
      </div>
      <div className="rounded-[22px] border border-[#ead2a4] bg-white/70 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#f7e5bd] text-[#9a6410]"><Verified className="size-5" /></span>
          <div>
            <p className="text-sm font-semibold text-[#4a3824]">Privacy comes first</p>
            <p className="mt-1 text-xs leading-5 text-[#796b56]">Keep your profile details and connection preferences in your control.</p>
          </div>
        </div>
        <Link href="/profile"><Button variant="link" className="mt-3 h-auto px-0 text-xs font-semibold text-[#7b4a0d]">Review privacy settings <ArrowRight className="ml-1 size-3" /></Button></Link>
      </div>
      <div className="rounded-[22px] bg-[#5d3a0c] p-5 text-white">
        <MessageCircle className="size-5 text-[#f8edcf]" />
        <p className="mt-5 font-display text-xl font-semibold tracking-[-0.04em]">Conversations, without the clutter.</p>
        <p className="mt-2 text-xs leading-5 text-[#f8edcf]">Message spaces are designed for people, groups, and customer support.</p>
        <Link href="/messages"><Button className="mt-4 rounded-xl bg-white text-[#5d3a0c] shadow-none hover:bg-[#fff1d4]">Open messages</Button></Link>
      </div>
      <Badge variant="outline" className="border-[#ead2a4] bg-transparent px-3 py-1 text-[11px] font-medium text-[#8a765d]">Savanna is in early build</Badge>
    </div>
  );
}

export default function Home() {
  return <SavannaShell context={<HomeContext />}><HomeContent /></SavannaShell>;
}
