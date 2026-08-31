import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedPlusIcon, MobileNavIcon } from "@/components/AnimatedNavIcons";
import { CommunityVisibilitySelect } from "@/components/CommunityVisibilitySelect";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useFirebaseCommunities, useFirebaseCommunityMutations, type FirebaseCommunityVisibility } from "@/lib/firebaseCommunities";
import { cn } from "@/lib/utils";
import { Bot, Loader2, Megaphone, MessageSquare, Search, Share2, ShieldCheck, Store } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const communitySections = [
  {
    title: "Groups",
    copy: "Rooms for people who already share context.",
    icon: MessageSquare,
  },
  {
    title: "Channels",
    copy: "Broadcast spaces without group-chat noise.",
    icon: Megaphone,
  },
  {
    title: "Shops",
    copy: "Find trusted storefronts through people.",
    icon: Store,
  },
  {
    title: "Automation",
    copy: "Helpers arrive after the human network is alive.",
    icon: Bot,
  },
  {
    title: "Launch",
    copy: "Start with communities that create conversations.",
    icon: ShieldCheck,
  },
];

function initialCommunityForm() {
  return {
    name: "",
    description: "",
    city: "",
    visibility: "public" as FirebaseCommunityVisibility,
  };
}

export default function CommunitiesPage() {
  const { user, isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(initialCommunityForm);
  const handledInviteCode = useRef<string | null>(null);
  const communities = useFirebaseCommunities(search);
  const communityMutations = useFirebaseCommunityMutations(user);
  const visibleCommunities = useMemo(() => communities.data ?? [], [communities.data]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (!code || handledInviteCode.current === code) return;
    handledInviteCode.current = code;
    communityMutations.joinInvite.mutate(code, {
      onSuccess: () => {
        params.delete("invite");
        const queryString = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${queryString ? `?${queryString}` : ""}`);
        toast.success("Joined community");
      },
      onError: error => toast.error(error.message),
    });
  }, [user]);

  const buildInviteLink = (code: string) => `${window.location.origin}/communities?invite=${encodeURIComponent(code)}`;

  const shareCommunityInvite = async (code: string, name: string) => {
    const url = buildInviteLink(code);
    const shareApi = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    const canShare = typeof shareApi.share === "function";
    try {
      if (canShare) {
        await shareApi.share!({ title: name, text: "Join this Savanna community.", url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      toast.success(canShare ? "Invite ready to share" : "Invite link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this invite link.");
    }
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAuthenticated) return toast.error("Sign in to create a community");
    communityMutations.create.mutate(
      {
        name: form.name,
        description: form.description,
        city: form.city,
        visibility: form.visibility,
      },
      {
        onSuccess: () => {
          setForm(initialCommunityForm());
          setCreateOpen(false);
          toast.success("Community created");
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  const createCommunityDrawer = (
    <Drawer open={createOpen} onOpenChange={setCreateOpen}>
      <DrawerContent className="savanna-new-chat-drawer rounded-t-[28px] border-[#ead2a4] bg-[#fffaf0] dark:border-[#5b4833] dark:bg-[#21180f]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-display text-2xl text-[#3d2d1a] dark:text-[#fff8ed]">Create community</DrawerTitle>
          <DrawerDescription>Start a public or private place for people to gather.</DrawerDescription>
        </DrawerHeader>
        <form className="space-y-3 px-4" onSubmit={handleCreate}>
          <Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Community name" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" />
          <Input value={form.city} onChange={event => setForm(current => ({ ...current, city: event.target.value }))} placeholder="City or area" className="savanna-new-chat-input bg-white dark:bg-[#2a2119]" />
          <textarea
            value={form.description}
            onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
            placeholder="What is this community for?"
            className="savanna-new-chat-input min-h-24 w-full resize-none rounded-xl border border-[#ead2a4] bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]/35 dark:bg-[#2a2119]"
          />
          <CommunityVisibilitySelect value={form.visibility} onChange={visibility => setForm(current => ({ ...current, visibility }))} />
          <DrawerFooter className="px-0">
            <Button type="submit" disabled={communityMutations.create.isPending} className="savanna-brand-token rounded-xl shadow-none">
              {communityMutations.create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <AnimatedPlusIcon className="mr-2 size-4" />}
              Create community
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );

  return (
    <SavannaShell>
      <div className="savanna-route-communities space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#D9A441]">
              <MobileNavIcon name="Communities" active size={16} /> Communities
            </span>
            <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-[#151A17] sm:text-4xl dark:text-[#E9EDEF]">Gather around what matters.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">Groups, channels, shops, stories, and local discovery in one place.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="savanna-brand-token hidden h-11 shrink-0 rounded-2xl px-4 shadow-none sm:inline-flex">
            <AnimatedPlusIcon className="mr-2" size={16} /> Create
          </Button>
        </header>

        <label className="savanna-route-search savanna-desktop-chat-search flex h-12 items-center gap-3 rounded-2xl border border-[#DDE3DC] bg-white px-4 dark:border-[#26343A] dark:bg-[#23282C]">
          <Search className="size-4 text-[#5F6861] dark:text-[#AEBAC1]" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search communities, groups, channels, or shops" aria-label="Search communities" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8A938D]" />
        </label>

        <section className="snap-x overflow-x-auto pb-1" aria-label="Community types">
          <div className="flex w-max gap-3">
          {communitySections.map(section => {
            const Icon = section.icon;
            return (
              <article key={section.title} className="savanna-community-card w-[156px] shrink-0 snap-start rounded-[22px] border border-[#DDE3DC] bg-[#F6F5F5] p-4 dark:border-[#26343A] dark:bg-[#111B21]">
                <span className="grid size-10 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                  <Icon className="size-4" />
                </span>
                <h2 className="mt-4 text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{section.title}</h2>
                <p className="mt-1.5 text-xs leading-5 text-[#5F6861] dark:text-[#AEBAC1]">{section.copy}</p>
              </article>
            );
          })}
          </div>
        </section>

        <section className="savanna-community-card rounded-[28px] border border-[#DDE3DC] bg-[#F6F5F5] p-5 dark:border-[#26343A] dark:bg-[#111B21]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D9A441]">Active spaces</p>
              <h2 className="mt-1 font-display text-3xl font-semibold text-[#151A17] dark:text-[#E9EDEF]">Find your people.</h2>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="icon" className="savanna-brand-token shrink-0 rounded-2xl shadow-none" aria-label="Create community">
              <AnimatedPlusIcon size={18} />
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {communities.isLoading ? (
              <div className="grid min-h-36 place-items-center">
                <Loader2 className="size-5 animate-spin text-[#D9A441]" />
              </div>
            ) : visibleCommunities.length ? (
              visibleCommunities.map(community => (
                <article key={community.id} className="rounded-2xl bg-white p-4 dark:bg-[#172127]">
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                      <MobileNavIcon name="Communities" active size={20} />
                    </span>
                    <Link href={`/communities/${community.id}`} className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{community.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5F6861] dark:text-[#AEBAC1]">{community.description || "A Savanna community for local conversation and discovery."}</p>
                      <p className="mt-2 text-[11px] font-semibold text-[#D9A441]">{community.memberCount} {community.memberCount === 1 ? "member" : "members"}{community.city ? ` · ${community.city}` : ""}</p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {community.inviteCode ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => shareCommunityInvite(community.inviteCode!, community.name)}
                          className="size-9 rounded-full bg-[#D9A441]/10 text-[#D9A441] shadow-none hover:bg-[#D9A441]/20"
                          aria-label={`Share ${community.name} invite`}
                        >
                          <Share2 className="size-4" />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        onClick={() => communityMutations.join.mutate(community.id, { onSuccess: () => toast.success("Joined community"), onError: error => toast.error(error.message) })}
                        disabled={!isAuthenticated || communityMutations.join.isPending}
                        className={cn("savanna-brand-token h-9 rounded-full px-4 text-xs shadow-none", !isAuthenticated && "opacity-70")}
                      >
                        Join
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl bg-white p-6 text-center dark:bg-[#172127]">
                <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[#D9A441]/20 text-[#D9A441]">
                  <MobileNavIcon name="Communities" active size={24} />
                </span>
                <h3 className="mt-4 font-display text-2xl font-semibold text-[#151A17] dark:text-[#E9EDEF]">No public communities yet.</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">Create the first one for your area, market, school, team, or shared interest.</p>
              </div>
            )}
          </div>
        </section>
        {createCommunityDrawer}
      </div>
    </SavannaShell>
  );
}
