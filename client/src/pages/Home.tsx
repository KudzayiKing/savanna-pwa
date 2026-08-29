import { AnimatedStoreIcon } from "@/components/AnimatedNavIcons";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useFirebaseConversations } from "@/lib/firebaseChat";
import { useFirebaseStories } from "@/lib/firebaseStories";
import { useFirebaseProducts, useFirebaseStorefronts } from "@/lib/firebaseShops";
import {
  ArrowRight,
  Bell,
  Home as HomeIcon,
  MessageCircle,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { Link } from "wouter";

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || "friend";
}

function HomeContent() {
  const { isAuthenticated, user } = useAuth();
  const conversations = useFirebaseConversations(user);
  const stories = useFirebaseStories(user, true);
  const shops = useFirebaseStorefronts("", user);
  const products = useFirebaseProducts("", user);

  const conversationCount = conversations.data?.length ?? (isAuthenticated ? 0 : 3);
  const onlineCount = Math.min(2, Math.max(1, conversationCount));
  const story = stories.data?.[0];
  const marketplaceCount = products.data?.length ?? shops.data?.length ?? 4;
  const name = firstName(user?.name ?? user?.email);

  const houseItems = [
    { label: `${conversationCount} conversations waiting`, href: "/messages", icon: MessageCircle },
    { label: `${onlineCount} people you frequently talk to are online`, href: "/messages", icon: Users },
    { label: "New activity in your groups", href: "/messages", icon: Sparkles },
    { label: `${story?.authorName ?? "Someone"} shared something with you`, href: "/messages", icon: Bell },
    { label: `Your local marketplace has ${marketplaceCount} new listings`, href: "/shops", icon: Store },
  ];

  const storyCards = stories.data?.length
    ? stories.data.slice(0, 5).map(item => ({
      id: item.id,
      authorName: item.authorName,
      textBody: item.textBody || "A new moment from your Savanna circle.",
    }))
    : [
      { id: "preview-1", authorName: "Sarah", textBody: "Fresh ideas from your circle." },
      { id: "preview-2", authorName: "Ayo", textBody: "A quick update from the marketplace." },
      { id: "preview-3", authorName: "Zawadi", textBody: "Something worth checking in on." },
    ];

  return (
    <div className="savanna-home-page space-y-7">
      <section className="rounded-[30px] border border-[#eadfca] bg-white p-5 shadow-[0_14px_34px_rgba(94,58,11,0.04)] sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <p className="text-sm font-semibold text-[#9a6410]">{greetingForNow()}, {name}</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.055em] text-[#151A17] sm:text-5xl">Your House</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5f6861]">
              A living view of your people, conversations, stories, and local commerce.
            </p>
          </div>
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
            <HomeIcon className="size-6" />
          </span>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {houseItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className="group min-h-[132px] rounded-2xl border border-[#eadfca] bg-[#fcfbf8] p-4 transition-transform hover:-translate-y-0.5"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]">
                  <Icon className="size-5" />
                </span>
                <p className="mt-4 text-sm font-semibold leading-5 text-[#151A17]">{item.label}</p>
                <ArrowRight className="mt-3 size-4 text-[#D9A441] transition-transform group-hover:translate-x-1" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_12px_28px_rgba(94,58,11,0.035)] sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">From Your People</p>
              <h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17]">Stories moving through Savanna</h2>
            </div>
            <Link href="/profile" className="hidden text-sm font-semibold text-[#9a6410] sm:inline-flex">
              Your page <ArrowRight className="ml-1 size-4" />
            </Link>
          </div>

          <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
            {storyCards.map((item, index) => (
              <article
                key={item.id}
                className="relative flex h-[360px] w-[205px] shrink-0 flex-col justify-between overflow-hidden rounded-[28px] bg-[#151A17] p-4 text-white"
              >
                <div className="absolute inset-0 bg-[#D9A441]/20" />
                <div className="relative flex items-center gap-2">
                  <span className="grid size-10 place-items-center rounded-full bg-white/15 text-sm font-semibold text-[#F8E8C4]">
                    {item.authorName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold">{item.authorName}</span>
                </div>
                <div className="relative">
                  <span className="mb-3 inline-flex rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-[#F8E8C4]">
                    Story {index + 1}
                  </span>
                  <p className="text-xl font-semibold leading-7">{item.textBody}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <section className="rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_12px_28px_rgba(94,58,11,0.035)]">
            <div className="flex items-start gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                <AnimatedStoreIcon size={24} />
              </span>
              <div>
                <p className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Local marketplace</p>
                <p className="mt-1 text-sm leading-6 text-[#5f6861]">
                  New storefronts and products sit beside the conversations that created the trust.
                </p>
              </div>
            </div>
            <Link href="/shops">
              <Button className="savanna-brand-token mt-5 rounded-xl shadow-none">
                Explore shops <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
          </section>

          <section className="rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_12px_28px_rgba(94,58,11,0.035)]">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
              <ShieldCheck className="size-6" />
            </span>
            <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Your identity anchors the network.</p>
            <p className="mt-2 text-sm leading-6 text-[#5f6861]">
              Keep your avatar, bio, stories, and business presence connected from one profile.
            </p>
            <Link href="/profile">
              <Button variant="outline" className="mt-5 rounded-xl border-[#ead2a4] bg-white text-[#9a6410] hover:bg-[#D9A441]/10">
                Open profile
              </Button>
            </Link>
          </section>
        </div>
      </section>

      {!isAuthenticated ? (
        <section className="rounded-[28px] border border-[#eadfca] bg-[#fcfbf8] p-5 text-center sm:p-6">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17]">Come in through your house.</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#5f6861]">
            Sign in to make the hub reflect your real conversations, stories, and marketplace activity.
          </p>
          <Button onClick={startLogin} className="savanna-brand-token mt-5 rounded-xl shadow-none">
            Sign in to Savanna
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function HomeContext() {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Home</p>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.05em] text-[#151A17]">Your daily map.</h2>
      </div>
      {[
        { href: "/messages", label: "Open conversations", icon: MessageCircle },
        { href: "/shops", label: "Browse shops", icon: Store },
        { href: "/profile", label: "Update your page", icon: Users },
      ].map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-2xl border border-[#eadfca] bg-white p-4 text-sm font-semibold text-[#151A17]">
            <span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">{item.label}</span>
            <ArrowRight className="size-4 text-[#D9A441]" />
          </Link>
        );
      })}
      <div className="rounded-[24px] bg-[#151A17] p-5 text-white">
        <PackageSearch className="size-5 text-[#D9A441]" />
        <p className="mt-5 font-display text-xl font-semibold tracking-[-0.04em]">Savanna should feel like a place you return to.</p>
        <p className="mt-2 text-xs leading-5 text-[#d8d3c8]">The home hub now gathers people, stories, messages, and commerce before you choose where to go.</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <SavannaShell context={<HomeContext />}>
      <HomeContent />
    </SavannaShell>
  );
}
