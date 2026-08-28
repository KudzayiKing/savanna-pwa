import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AnimatedMenuIcon, AnimatedSearchIcon } from "@/components/AnimatedNavIcons";
import { Textarea } from "@/components/ui/textarea";
import { SafetyActions } from "@/components/SafetyActions";
import { trpc } from "@/lib/trpc";
import { ChevronRight, Loader2, Plus, Search, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const storyColors = ["#4CAF68", "#A87820", "#5A9BD5", "#C95C55", "#6F6A60"];

function storyColor(id: number) {
  return storyColors[Math.abs(id) % storyColors.length];
}

export function StoriesPanel() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const stories = trpc.stories.list.useQuery(undefined, { enabled: isAuthenticated });
  const publish = trpc.stories.publishText.useMutation({ onSuccess: () => { utils.stories.list.invalidate(); setComposing(false); setDraft(""); toast.success("Your Story will disappear after 24 hours."); }, onError: error => toast.error(error.message) });
  const view = trpc.stories.view.useMutation();
  const react = trpc.stories.react.useMutation({ onSuccess: () => toast.success("Reaction sent") });
  const [isCompact, setIsCompact] = useState(false);
  const [pull, setPull] = useState(0);
  const [startY, setStartY] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState<"public" | "custom" | "private">("private");
  const [customAudience, setCustomAudience] = useState("");
  const [activeStoryId, setActiveStoryId] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncHeader = () => setIsCompact(window.scrollY > 90);
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
    return () => window.removeEventListener("scroll", syncHeader);
  }, []);

  const activeStory = stories.data?.find(story => story.id === activeStoryId) ?? null;
  const expandedHeight = Math.min(268, 208 + pull);
  const panelHeight = isCompact ? 124 : expandedHeight;

  const finishPull = () => {
    setStartY(null);
    setPull(0);
  };

  return <>
    <section
      className="overflow-hidden rounded-[28px] border border-[#dce1d3] bg-[#e6ecdf] p-4 shadow-[0_20px_60px_rgba(39,54,37,0.07)] transition-[height] duration-300 sm:p-5"
      style={{ height: panelHeight }}
      onPointerDown={event => { if (window.scrollY === 0) setStartY(event.clientY); }}
      onPointerMove={event => { if (startY !== null && window.scrollY === 0) setPull(Math.max(0, Math.min(80, event.clientY - startY))); }}
      onPointerUp={finishPull}
      onPointerCancel={finishPull}
    >
      <div className="mb-4 flex items-center justify-between gap-4 px-1">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-[-0.045em] text-[#213822]">The day, close to you</h1>
        </div>
        <Button variant="ghost" onClick={() => railRef.current?.scrollTo({ left: 0, behavior: "smooth" })} className="shrink-0 rounded-xl text-[#31583a] hover:bg-white/60 hover:text-[#24482f]">
          {isCompact ? "Expand" : "See all"} <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>

      {composing ? <form className="flex flex-col gap-3 sm:flex-row" onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; const customAudienceUserIds = customAudience.split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0); publish.mutate({ textBody: draft.trim(), audience, customAudienceUserIds }); }}><div className="flex-1 space-y-2"><Textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={700} placeholder="Share a moment in words" className="min-h-[100px] border-[#c5d2c1] bg-white/80" />{audience === "custom" ? <input aria-label="Savanna account IDs for custom Story audience" value={customAudience} onChange={event => setCustomAudience(event.target.value)} placeholder="Account IDs, separated by commas" className="h-10 w-full rounded-xl border border-[#c5d2c1] bg-white px-3 text-xs text-[#405340]" /> : null}</div><div className="flex w-full gap-2 sm:w-32 sm:flex-col"><select value={audience} onChange={event => setAudience(event.target.value as typeof audience)} className="h-10 flex-1 rounded-xl border border-[#c5d2c1] bg-white px-2 text-xs text-[#405340]"><option value="public">Public</option><option value="private">Only me</option><option value="custom">Selected people</option></select><Button type="submit" disabled={publish.isPending} className="rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]">{publish.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button><Button type="button" variant="ghost" onClick={() => { setComposing(false); setDraft(""); setCustomAudience(""); }} className="rounded-xl">Cancel</Button></div></form> : <div ref={railRef} className="story-rail flex gap-3 overflow-x-auto pb-1">
        <button onClick={() => isAuthenticated ? setComposing(true) : toast.error("Sign in to share a Story")} className="group relative h-[145px] w-[105px] shrink-0 overflow-hidden rounded-[20px] bg-[#24482f] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24482f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e6ecdf] sm:h-[164px] sm:w-[120px]" style={{ transform: isCompact ? "scale(0.78) translateX(-12px)" : "scale(1)", transformOrigin: "left center", transition: "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)" }}><span className="absolute inset-0 bg-[radial-gradient(circle_at_80%_16%,rgba(213,160,93,0.55),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(18,27,18,0.62))]" /><span className="absolute left-3 top-3 grid size-8 place-items-center rounded-xl border border-white/45 bg-white/25 text-white backdrop-blur-sm"><Plus className="size-4" /></span><span className="absolute inset-x-3 bottom-3 text-xs font-semibold leading-tight text-white">Your story</span></button>
        {stories.isLoading ? <div className="grid h-[145px] w-[105px] place-items-center rounded-[20px] bg-white/30 sm:h-[164px] sm:w-[120px]"><Loader2 className="size-4 animate-spin text-[#31583a]" /></div> : stories.data?.length ? stories.data.map(story => <button key={story.id} onClick={() => { setActiveStoryId(story.id); view.mutate({ storyId: story.id }); }} className="group relative h-[145px] w-[105px] shrink-0 overflow-hidden rounded-[20px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24482f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#e6ecdf] sm:h-[164px] sm:w-[120px]" style={{ background: storyColor(story.id), transform: isCompact ? "scale(0.78) translateX(-18px)" : "scale(1)", transformOrigin: "left center", transition: "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)" }}><span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(18,27,18,0.68))]" /><span className="absolute left-3 top-3 grid size-8 place-items-center rounded-xl border border-white/45 bg-white/25 text-xs font-semibold text-white backdrop-blur-sm">S</span><span className="absolute inset-x-3 bottom-3 line-clamp-3 text-xs font-semibold leading-tight text-white">{story.textBody || "A moment shared"}</span></button>) : <div className="flex h-[145px] w-[230px] shrink-0 flex-col justify-center rounded-[20px] border border-[#cad7c5] bg-white/45 p-4 text-xs leading-5 text-[#52704f] sm:h-[164px]"><Sparkles className="mb-2 size-4" />Stories will appear here from people whose updates you can see.</div>}
      </div>}
    </section>

    {activeStory ? <div role="dialog" aria-modal="true" aria-label="Story viewer" className="fixed inset-0 z-[70] grid place-items-center bg-[#162218]/75 p-4 backdrop-blur-sm"><article className="relative flex min-h-[min(620px,80vh)] w-full max-w-[430px] flex-col overflow-hidden rounded-[28px] p-6 text-white" style={{ background: storyColor(activeStory.id) }}><button onClick={() => setActiveStoryId(null)} aria-label="Close Story" className="absolute right-4 top-4 grid size-9 place-items-center rounded-xl bg-black/15 hover:bg-black/25"><X className="size-5" /></button><div className="pr-10"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">Story</p><p className="mt-1 text-xs text-white/70">Expires {new Date(activeStory.expiresAt).toLocaleString()}</p></div><div className="flex flex-1 items-center"><p className="font-display text-4xl font-semibold leading-tight tracking-[-0.05em]">{activeStory.textBody || "A moment shared"}</p></div><div className="space-y-3"><div className="flex gap-2"><Button onClick={() => react.mutate({ storyId: activeStory.id, emoji: "♥" })} disabled={react.isPending} className="rounded-xl bg-white text-[#24482f] hover:bg-[#edf4e7]">♥ React</Button><Button onClick={() => react.mutate({ storyId: activeStory.id, emoji: "✦" })} disabled={react.isPending} variant="outline" className="rounded-xl border-white/35 bg-white/10 text-white hover:bg-white/20">✦ Appreciate</Button></div><SafetyActions targetDomain="story" targetId={String(activeStory.id)} targetLabel="this Story" blockUserId={activeStory.authorUserId} /></div></article></div> : null}
  </>;
}

export function MobileStoriesHeader({ onOpenProfile }: { onOpenProfile: () => void }) {
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const stories = trpc.stories.list.useQuery(undefined, { enabled: isAuthenticated });
  const ownProfile = trpc.account.profile.useQuery({ userId: user?.id ?? 0 }, { enabled: isAuthenticated && Boolean(user?.id), retry: false });
  const [compact, setCompact] = useState(false);
  const [pull, setPull] = useState(0);
  const [startY, setStartY] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [menuPulse, setMenuPulse] = useState(0);
  const [searchPulse, setSearchPulse] = useState(0);
  const storyPreviewParams = new URLSearchParams(window.location.search);
  const previewCompact = import.meta.env.DEV && storyPreviewParams.get("stories") === "compact";
  const previewStoriesEnabled = import.meta.env.DEV && !stories.data?.length;
  const publish = trpc.stories.publishText.useMutation({ onSuccess: () => { setComposing(false); setDraft(""); utils.stories.list.invalidate(); toast.success("Story shared for 24 hours"); }, onError: error => toast.error(error.message) });
  const view = trpc.stories.view.useMutation();

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
        setCompact(previewCompact || scrollTop > 12);
        frame = 0;
      });
    };
    sync();
    const settledSync = window.requestAnimationFrame(sync);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("hashchange", sync, { passive: true });
    return () => { window.removeEventListener("scroll", sync); window.removeEventListener("hashchange", sync); window.cancelAnimationFrame(settledSync); if (frame) window.cancelAnimationFrame(frame); };
  }, [previewCompact]);

  const expandedHeight = Math.min(126, 88 + pull);
  type MobileStory = NonNullable<typeof stories.data>[number];
  const previewStories: MobileStory[] = previewStoriesEnabled ? [
    { id: -101, authorUserId: -101, authorName: "Ayo", textBody: "Fresh produce is in today.", audience: "public", createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null },
    { id: -102, authorUserId: -102, authorName: "Esi", textBody: "A small thought for the day.", audience: "public", createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null },
    { id: -103, authorUserId: -103, authorName: "Zawadi", textBody: "New lesson is now available.", audience: "public", createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null },
    { id: -104, authorUserId: -104, authorName: "Amina", textBody: "Weekend plans, simply shared.", audience: "public", createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null },
  ] : [];
  const ownStoryInitial = (user?.name?.trim().slice(0, 1) || "S").toUpperCase();
  const ownStoryAvatarUrl = ownProfile.data?.avatarUrl ?? null;
  const storySource = stories.data?.length ? stories.data : previewStories;
  const groupedStories = useMemo(() => {
    const groups = new Map<number, { authorUserId: number; authorName: string; items: MobileStory[] }>();
    for (const story of storySource) {
      const existing = groups.get(story.authorUserId);
      if (existing) existing.items.push(story);
      else groups.set(story.authorUserId, { authorUserId: story.authorUserId, authorName: story.authorName, items: [story] });
    }
    return Array.from(groups.values());
  }, [storySource]);
  const activeGroup = activeGroupIndex === null ? null : groupedStories[activeGroupIndex] ?? null;
  const activeStory = activeGroup?.items[activeStoryIndex] ?? null;
  const openGroup = (groupIndex: number) => {
    setActiveGroupIndex(groupIndex);
    setActiveStoryIndex(0);
    const story = groupedStories[groupIndex]?.items[0];
    if (story && story.id > 0) view.mutate({ storyId: story.id });
  };
  const moveStory = (direction: -1 | 1) => {
    if (!activeGroup) return;
    const nextIndex = Math.max(0, Math.min(activeGroup.items.length - 1, activeStoryIndex + direction));
    if (nextIndex === activeStoryIndex) return;
    setActiveStoryIndex(nextIndex);
    if (activeGroup.items[nextIndex].id > 0) view.mutate({ storyId: activeGroup.items[nextIndex].id });
  };
  useEffect(() => {
    if (!activeGroup) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") moveStory(1);
      if (event.key === "ArrowLeft") moveStory(-1);
      if (event.key === "Escape") setActiveGroupIndex(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeGroup, activeStoryIndex]);
  const collapsedStoriesCluster = compact ? <div aria-label="Collapsed Stories cluster" className="savanna-collapsed-story-cluster flex shrink-0 items-center">{stories.isLoading ? <div className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#A87820] bg-[#FFFDF7]"><Loader2 className="size-3 animate-spin text-[#A87820]" /></div> : groupedStories.slice(0, 3).map((group, groupIndex) => <button key={group.authorUserId} onClick={() => openGroup(groupIndex)} aria-label={`Open ${group.authorName}'s Stories`} className={`grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#D9A441] text-[10px] font-semibold text-white shadow-sm transition-transform hover:scale-105 focus-visible:z-20 ${groupIndex ? "-ml-1.5" : ""}`} style={{ background: storyColor(group.items[0].id), zIndex: groupIndex + 1 }}>{group.authorName.slice(0, 1).toUpperCase()}</button>)}</div> : null;
  return <><header className="savanna-mobile-header fixed inset-x-0 top-0 z-40 bg-[#f7f6f1]/92 backdrop-blur-xl dark:bg-[#0A1014]/95 lg:hidden"><div className="flex h-[68px] items-center justify-between gap-3 px-4"><div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" onPointerDown={() => setMenuPulse(current => current + 1)} onClick={onOpenProfile} aria-label="Open profile" className="size-14 shrink-0 rounded-xl text-[#3d2d1a] dark:text-[#fff8ed]"><AnimatedMenuIcon className="size-[27px]" size={27} pulse={menuPulse} /></Button>{collapsedStoriesCluster}<Link href="/" aria-label="Savanna messages" className="flex shrink-0 items-center whitespace-nowrap text-2xl leading-none"><span className="savanna-wordmark">Savanna</span></Link></div><div className="flex shrink-0 items-center"><Button variant="ghost" size="icon" onPointerDown={() => setSearchPulse(current => current + 1)} aria-label="Search Savanna" className="size-14 rounded-full"><AnimatedSearchIcon className="size-[27px]" size={27} pulse={searchPulse} /></Button></div></div><section
    aria-label="Stories"
    className={`overflow-hidden bg-[#f7f6f1]/92 px-4 backdrop-blur-xl transition-[height,background-color] duration-300 ease-out dark:bg-[#0A1014]/95 ${compact ? "hidden" : "block"}`}
    style={{ height: expandedHeight }}
    onPointerDown={event => { if (window.scrollY === 0) setStartY(event.clientY); }}
    onPointerMove={event => { if (startY !== null && window.scrollY === 0) setPull(Math.max(0, Math.min(36, event.clientY - startY))); }}
    onPointerUp={() => { setStartY(null); setPull(0); }}
    onPointerCancel={() => { setStartY(null); setPull(0); }}
  >
    <div className={`flex h-full ${compact ? "items-center gap-1.5" : "flex-col justify-start gap-0 pt-1"}`}>
      <div className={`story-rail flex min-w-0 flex-1 items-center overflow-x-auto ${compact ? "py-1" : "w-full flex-none gap-3 py-0"}`}>
        {compact ? <div aria-label="Collapsed Stories cluster" className="flex min-w-0 items-center">{stories.isLoading ? <div className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-[#A87820] bg-[#FFFDF7]"><Loader2 className="size-3.5 animate-spin text-[#A87820]" /></div> : <div className="flex min-w-0 items-center">{groupedStories.slice(0, 3).map((group, groupIndex) => <button key={group.authorUserId} onClick={() => openGroup(groupIndex)} aria-label={`Open ${group.authorName}'s Stories`} className={`grid size-10 shrink-0 place-items-center rounded-full border-2 border-[#D9A441] text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105 focus-visible:z-20 ${groupIndex ? "-ml-2" : ""}`} style={{ background: storyColor(group.items[0].id), zIndex: groupIndex + 1 }}>{group.authorName.slice(0, 1).toUpperCase()}</button>)}</div>}</div> : <><div className="flex shrink-0 flex-col items-center gap-1"><button onClick={() => isAuthenticated ? setComposing(true) : toast.error("Sign in to share a Story")} aria-label="Add to your Story" className="relative grid size-14 shrink-0 place-items-center overflow-visible rounded-full bg-[#A87820] p-0.5 text-white shadow-sm transition-transform active:scale-95">{ownStoryAvatarUrl ? <img src={ownStoryAvatarUrl} alt="" className="size-full rounded-full object-cover" /> : <span className="grid size-full place-items-center rounded-full bg-[#6F6A60] text-xs font-semibold text-white">{ownStoryInitial}</span>}<span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-[#f7f6f1] bg-[#D9A441] text-[#111111] shadow-sm dark:border-[#0B0F0E]"><Plus className="size-3" /></span></button><span className="whitespace-nowrap text-[10px] font-medium text-[#9a8467] dark:text-[#9AA1A6]">Your Story</span></div>{stories.isLoading ? <div className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-[#A87820] bg-[#FFFDF7]"><Loader2 className="size-3.5 animate-spin text-[#A87820]" /></div> : groupedStories.slice(0, 8).map((group, groupIndex) => <div key={group.authorUserId} className="flex shrink-0 flex-col items-center gap-1"><button onClick={() => openGroup(groupIndex)} aria-label={`Open ${group.authorName}'s Stories`} className="grid size-14 shrink-0 place-items-center rounded-full border-2 border-[#D9A441] text-xs font-semibold text-white transition-all duration-300" style={{ background: storyColor(group.items[0].id) }}>{group.authorName.slice(0, 1).toUpperCase()}</button><span className="max-w-14 truncate text-center text-[10px] font-medium text-[#9a8467] dark:text-[#9AA1A6]">{group.authorName.split(" ")[0]}</span></div>)}</>}
      </div>
    </div>
  </section></header><div aria-hidden="true" className="savanna-mobile-header-spacer lg:hidden" style={{ height: compact ? 68 : 68 + expandedHeight }} />{composing ? <div role="dialog" aria-modal="true" aria-label="Create Story" className="fixed inset-0 z-[80] grid items-end bg-black/45 p-4"><form onSubmit={event => { event.preventDefault(); if (draft.trim()) publish.mutate({ textBody: draft.trim(), audience: "private", customAudienceUserIds: [] }); }} className="rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#2a2119]"><div className="flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-[#3d2d1a] dark:text-[#fff8ed]">Share a Story</h2><Button type="button" variant="ghost" size="icon" onClick={() => setComposing(false)} aria-label="Close Story composer"><X className="size-5" /></Button></div><Textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={700} placeholder="Share a moment in words" className="mt-4 min-h-28" /><Button type="submit" disabled={publish.isPending || !draft.trim()} className="mt-3 w-full rounded-xl bg-[#5d3a0c] text-white hover:bg-[#412607]">{publish.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}Share Story</Button></form></div> : null}{activeStory && activeGroup ? <div role="dialog" aria-modal="true" aria-label={`${activeGroup.authorName}'s Stories`} className="fixed inset-0 z-[80] flex flex-col bg-black/80 p-4 text-white backdrop-blur-sm"><div className="mx-auto w-full max-w-md"><div className="flex gap-1" aria-label={`Story ${activeStoryIndex + 1} of ${activeGroup.items.length}`}>{activeGroup.items.map((story, index) => <div key={story.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"><div className={`h-full bg-[#e3a43c] transition-transform duration-200 ${index > activeStoryIndex ? "-translate-x-full" : "translate-x-0"}`} /></div>)}</div><div className="mt-3 flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full border border-[#e3a43c] text-xs font-semibold" style={{ background: storyColor(activeStory.id) }}>{activeGroup.authorName.slice(0, 1).toUpperCase()}</span><p className="min-w-0 flex-1 truncate text-sm font-semibold">{activeGroup.authorName}</p><p className="text-xs text-white/65">{activeStoryIndex + 1}/{activeGroup.items.length}</p><Button type="button" variant="ghost" size="icon" onClick={() => setActiveGroupIndex(null)} aria-label="Close Story composer" className="rounded-full text-white hover:bg-white/15"><X className="size-5" /></Button></div></div><div className="relative mx-auto flex w-full max-w-md flex-1 items-center justify-center"><button type="button" onClick={() => moveStory(-1)} aria-label="Previous Story" disabled={activeStoryIndex === 0} className="absolute inset-y-0 left-0 z-10 w-1/4 disabled:cursor-default" /><button type="button" onClick={() => moveStory(1)} disabled={activeStoryIndex === activeGroup.items.length - 1} aria-label="Next Story" className="absolute inset-y-0 right-0 z-10 w-1/4 disabled:cursor-default" /><article className="flex aspect-[3/4] w-full max-h-[62vh] flex-col justify-end rounded-3xl p-7 shadow-2xl" style={{ background: storyColor(activeStory.id) }}><p className="font-display text-3xl font-semibold leading-tight">{activeStory.textBody || "A moment shared"}</p><p className="mt-4 text-xs text-white/70">Expires {new Date(activeStory.expiresAt).toLocaleString()}</p></article></div><div className="mx-auto flex w-full max-w-md justify-between pb-2"><Button type="button" variant="outline" onClick={() => moveStory(-1)} disabled={activeStoryIndex === 0} className="border-white/25 bg-white/10 text-white hover:bg-white/20">Previous</Button><Button type="button" variant="outline" onClick={() => moveStory(1)} disabled={activeStoryIndex === activeGroup.items.length - 1} className="border-white/25 bg-white/10 text-white hover:bg-white/20">Next</Button></div></div> : null}</>;
}
