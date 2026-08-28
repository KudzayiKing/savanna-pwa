import { Button } from "@/components/ui/button";
import { SavannaShell } from "@/components/SavannaShell";
import { ArrowRight, Sparkles } from "lucide-react";

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  copy: string;
  action: string;
};

export default function PlaceholderPage({ eyebrow, title, copy, action }: PlaceholderPageProps) {
  return (
    <SavannaShell>
      <section className="grid min-h-[calc(100vh-190px)] place-items-center rounded-[32px] border border-[#dce1d3] bg-[radial-gradient(circle_at_20%_15%,#eef2e8_0,transparent_29%),linear-gradient(145deg,#ffffff_0%,#f4f2ea_100%)] p-7 text-center shadow-[0_20px_60px_rgba(39,54,37,0.05)] sm:p-12">
        <div className="max-w-[530px]">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#dfe8d9] text-[#31583a]"><Sparkles className="size-6" /></span>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8065]">{eyebrow}</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.065em] text-[#263126] sm:text-5xl">{title}</h1>
          <p className="mx-auto mt-4 max-w-[450px] text-[15px] leading-7 text-[#687462]">{copy}</p>
          <Button className="mt-7 rounded-xl bg-[#24482f] px-5 text-white shadow-none hover:bg-[#1b3b25]">{action}<ArrowRight className="ml-2 size-4" /></Button>
        </div>
      </section>
    </SavannaShell>
  );
}
