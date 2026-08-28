import { Button } from "@/components/ui/button";
import { ConnectionPill, InstallSavannaButton, PwaStatusBanner } from "@/components/PwaExperience";
import { MobileStoriesHeader } from "@/components/StoriesPanel";
import { AnimatedPlusIcon, MobileNavIcon, type MobileNavIconName } from "@/components/AnimatedNavIcons";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Command,
  Search,
} from "lucide-react";
import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";

const navigation = [
  { href: "/messages", label: "Messages" },
  { href: "/shops", label: "Shops" },
  { href: "/learn", label: "Learn" },
  { href: "/orders", label: "Orders" },
  { href: "/profile", label: "Profile" },
];

type SavannaShellProps = {
  children: ReactNode;
  context?: ReactNode;
};

export function SavannaShell({ children, context }: SavannaShellProps) {
  const [location, setLocation] = useLocation();
  const isMessagesWorkspace = location === "/messages";
  const usesIconRail = ["/messages", "/shops", "/learn", "/orders", "/profile"].includes(location);

  return (
    <div className="savanna-app min-h-screen bg-[#fcfaf4] text-[#2c2114]">
      <a className="skip-link" href="#savanna-main">
        Skip to content
      </a>

      <PwaStatusBanner />

      <MobileStoriesHeader onOpenProfile={() => setLocation("/profile")} />

      <div className={cn("mx-auto flex min-h-screen", usesIconRail ? "max-w-none" : "max-w-[1720px]")}>
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col lg:flex", usesIconRail ? "savanna-message-rail w-[84px] items-center border-r px-3 py-5" : "w-[248px] border-r border-[#eadfca] bg-[#f6f0e2] px-4 py-7")}>
          {usesIconRail ? <>
            <Link href="/messages" aria-label="Savanna" className="sr-only">Savanna</Link>
            <nav aria-label="Primary navigation" className="flex flex-1 flex-col items-center gap-3">
              {navigation.map((item) => {
                const active = location === item.href;
                return <Link href={item.href} key={item.href} title={item.label} aria-label={item.label} className={cn("grid size-11 place-items-center rounded-2xl transition-all duration-200", active ? "bg-[#D9A441]/20 text-[#A87820] dark:text-[#D9A441]" : "text-[#8a765d]")}><MobileNavIcon name={item.label as MobileNavIconName} active={active} size={22} /><span className="sr-only">{item.label}</span></Link>;
              })}
            </nav>
            <div className="mt-auto"><Button size="icon" className="savanna-brand-token size-11 rounded-2xl shadow-none" aria-label="Open creator menu"><AnimatedPlusIcon size={20} /></Button></div>
          </> : <>
          <Link href="/" aria-label="Savanna home" className="mb-11 px-3 text-[32px]">
            <span className="savanna-wordmark">Savanna</span>
          </Link>

          <nav aria-label="Primary navigation" className="space-y-1">
            {navigation.map((item) => {
              const active = location === item.href;
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium transition-all duration-200",
                    active
                      ? "bg-[#5d3a0c] text-white shadow-[0_10px_25px_rgba(93,58,12,0.18)]"
                      : "text-[#695c4a] hover:bg-[#f1dfbf] hover:text-[#5d3a0c]"
                  )}
                >
                  <MobileNavIcon name={item.label as MobileNavIconName} active={active} size={21} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-4">
            <Button className="savanna-brand-token h-12 w-full rounded-2xl shadow-none" aria-label="Open creator menu">
              <AnimatedPlusIcon size={16} className="mr-2" /> Create
            </Button>
            <InstallSavannaButton />
            <button className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-[#f1dfbf]" aria-label="Open account menu">
              <span className="grid size-10 place-items-center rounded-2xl bg-[#f3ddb2] font-semibold text-[#7b4a0d]">S</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#3d2d1a]">Your Savanna</span>
              <span className="block truncate text-xs text-[#8a765d]">Personal account</span>
              </span>
              <ChevronDown className="size-4 text-[#71806d]" />
            </button>
            <ConnectionPill />
          </div>
          </>}
        </aside>

        <section className="min-w-0 flex-1 pb-24 lg:pb-0">
          {!usesIconRail ? <div className="hidden h-[76px] items-center justify-between border-b border-[#eadfca]/70 bg-[#fcfaf4]/72 px-7 backdrop-blur-xl lg:flex xl:px-10">
            <button className="group flex h-10 w-[min(440px,42vw)] items-center gap-3 rounded-xl border border-[#d7ddd0] bg-white/65 px-3 text-left text-sm text-[#7a8276] shadow-[0_4px_12px_rgba(39,54,37,0.035)] transition-colors hover:border-[#b7c5b4]" aria-label="Open search and command menu">
              <Search className="size-4" />
              <span className="flex-1">Search Savanna</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-[#eef0e8] px-1.5 py-1 font-mono text-[10px] text-[#687462]">
                <Command className="size-3" /> K
              </span>
            </button>
            <div className="flex items-center gap-2">
              <Button className="savanna-brand-token rounded-xl px-4 shadow-none">
                <AnimatedPlusIcon size={16} className="mr-1.5" /> Create
              </Button>
            </div>
          </div> : null}

          <main id="savanna-main" className={cn(isMessagesWorkspace ? "min-h-screen p-0" : usesIconRail ? "min-h-[calc(100vh-76px)] px-4 py-5 sm:px-6 lg:min-h-screen lg:px-7 lg:py-8 xl:px-10" : "min-h-[calc(100vh-76px)] px-4 py-5 sm:px-6 lg:px-7 lg:py-8 xl:px-10")}>
            <div className={cn(isMessagesWorkspace ? "w-full" : "mx-auto", !isMessagesWorkspace && (context ? "max-w-[1280px]" : "max-w-[1050px]"))}>{children}</div>
          </main>
        </section>

        {context ? (
          <aside className="sticky top-0 hidden h-screen w-[328px] shrink-0 border-l border-[#eadfca] bg-[#faf4e8] px-6 py-8 2xl:block">{context}</aside>
        ) : null}
      </div>

      <nav aria-label="Mobile navigation" className="savanna-mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 flex border-t border-[#eadfca] bg-[#fcfaf4]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        {navigation.slice(0, 4).map((item) => {
          const active = location === item.href;
          return (
            <Link href={item.href} key={item.href} className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium">
              <span className={cn("grid h-9 place-items-center transition-[width,background-color] duration-200", active ? "w-14 rounded-full bg-[#D9A441]/20 text-[#D9A441] dark:text-[#D9A441]" : "w-9 rounded-xl text-[#8a765d]")}>
                <MobileNavIcon name={item.label as MobileNavIconName} active={active} size={22} />
              </span>
              <span className={cn("truncate", active ? "text-[#D9A441] dark:text-[#D9A441]" : "text-[#8a765d]")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
