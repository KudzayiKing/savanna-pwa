import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedPlusIcon } from "@/components/AnimatedNavIcons";
import { SavannaShell } from "@/components/SavannaShell";
import { SafetyActions } from "@/components/SafetyActions";
import { StoryComposer } from "@/components/StoriesPanel";
import { Button } from "@/components/ui/button";
import { useCommentFirebaseStory, useFirebaseStories, useFirebaseStoryComments, useReactToFirebaseStory, useReplyToFirebaseStory, useViewFirebaseStory, type FirebaseStory } from "@/lib/firebaseStories";
import { useFollowedUserIds } from "@/lib/userProfile";
import { cn } from "@/lib/utils";
import { ArrowLeft, Bookmark, Heart, Loader2, MessageCircle, MoreVertical, Send, Share2, ShoppingBag, Sparkles, Store, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type StoryDiscoveryTab = "for_you" | "near_you" | "following" | "shops" | "community";

type StoryFeedItem =
  | { kind: "story"; story: FirebaseStory }
  | { kind: "ad-slot"; slotId: string; context: StoryAdContext };

type StoryAdContext = {
  surface: "stories";
  tab: StoryDiscoveryTab;
  viewerUserId: string | null;
  viewerCity: string | null;
  viewerCountryCode: string | null;
  nearbyStoryCount: number;
  shopStoryCount: number;
  precedingStoryId: string | null;
};

const storyTabs: Array<{ value: StoryDiscoveryTab; label: string }> = [
  { value: "for_you", label: "For You" },
  { value: "near_you", label: "Near You" },
  { value: "following", label: "Following" },
  { value: "shops", label: "Shops" },
  { value: "community", label: "Community" },
];

function formatPrice(minor?: number | null, currency?: string | null) {
  if (!minor || !currency) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

function isNearViewer(story: FirebaseStory, userCity?: string | null, userCountryCode?: string | null) {
  const storyCity = story.authorCity?.trim().toLowerCase();
  const viewerCity = userCity?.trim().toLowerCase();
  const storyCountry = story.authorCountryCode?.trim().toLowerCase();
  const viewerCountry = userCountryCode?.trim().toLowerCase();
  return Boolean(
    story.discovery.slot === "around_you"
    || (storyCity && viewerCity && storyCity === viewerCity)
    || (storyCountry && viewerCountry && storyCountry === viewerCountry)
  );
}

function storyMatchesTab(story: FirebaseStory, tab: StoryDiscoveryTab, followedUserIds: Set<string>, userCity?: string | null, userCountryCode?: string | null, currentUserId?: string | null) {
  if (tab === "for_you") return true;
  if (tab === "near_you") return isNearViewer(story, userCity, userCountryCode);
  if (tab === "following") return story.authorUserId === currentUserId || followedUserIds.has(story.authorUserId);
  if (tab === "shops") return Boolean(story.storefrontId || story.productName || story.discovery.slot === "product_memory");
  return !story.storefrontId && (story.discovery.slot === "around_you" || story.audience === "public");
}

function buildStoryAdContext(stories: FirebaseStory[], tab: StoryDiscoveryTab, viewerUserId: string | null, viewerCity: string | null, viewerCountryCode: string | null, precedingStoryId: string | null): StoryAdContext {
  return {
    surface: "stories",
    tab,
    viewerUserId,
    viewerCity,
    viewerCountryCode,
    nearbyStoryCount: stories.filter(story => isNearViewer(story, viewerCity, viewerCountryCode)).length,
    shopStoryCount: stories.filter(story => story.storefrontId || story.productName).length,
    precedingStoryId,
  };
}

function buildStoriesFeedItems(stories: FirebaseStory[], tab: StoryDiscoveryTab, viewerUserId: string | null, viewerCity: string | null, viewerCountryCode: string | null): StoryFeedItem[] {
  const adsEnabled = false;
  return stories.flatMap((story, index): StoryFeedItem[] => {
    const item: StoryFeedItem = { kind: "story", story };
    if (!adsEnabled || index === 0 || index % 6 !== 0) return [item];
    return [
      {
        kind: "ad-slot",
        slotId: `stories-${tab}-${index}`,
        context: buildStoryAdContext(stories, tab, viewerUserId, viewerCity, viewerCountryCode, stories[index - 1]?.id ?? null),
      },
      item,
    ];
  });
}

function StoryMedia({ story }: { story: FirebaseStory }) {
  const media = story.media?.[0];
  if (media?.url && media.type === "image") return <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" />;
  if (media?.url && media.type === "video") return <video src={media.url} className="absolute inset-0 h-full w-full object-cover" autoPlay muted loop playsInline controls={false} />;
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#0A1014]">
      <div className="max-w-[78%] text-center font-display text-4xl font-semibold leading-tight text-[#E9EDEF] sm:text-5xl">
        {story.textBody || "A moment shared"}
      </div>
    </div>
  );
}

function ProductOverlay({ story }: { story: FirebaseStory }) {
  if (!story.productName && !story.storefrontId) return null;
  const price = formatPrice(story.productPriceMinor, story.productCurrencyCode);
  return (
    <div className="rounded-[22px] border border-white/15 bg-black/28 p-3 text-white backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#F8E8C4]">
          <ShoppingBag className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{story.productName || story.storefrontName || "Shop story"}</p>
          {story.productDescription ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/72">{story.productDescription}</p> : null}
          {story.storefrontSlug ? (
            <Link href={`/shops/${story.storefrontSlug}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#F8E8C4]">
              <Store className="size-3.5" /> Visit shop
            </Link>
          ) : null}
        </div>
        {price ? <span className="shrink-0 text-xs font-semibold text-[#F8E8C4]">{price}</span> : null}
      </div>
    </div>
  );
}

function ReelStory({ story, onComments }: { story: FirebaseStory; onComments: () => void }) {
  const { user } = useAuth();
  const view = useViewFirebaseStory();
  const react = useReactToFirebaseStory();
  const reply = useReplyToFirebaseStory();
  const [replyDraft, setReplyDraft] = useState("");
  const viewedRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const profileInitial = story.authorName.slice(0, 1).toUpperCase();
  const label = story.discovery.label === "Yours" ? "Your story" : story.discovery.label;

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !user || viewedRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.65 || viewedRef.current) return;
      viewedRef.current = true;
      view.mutate({ storyId: story.id, user });
    }, { threshold: [0.65] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [story.id, user, view]);

  const submitReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return toast.error("Sign in to reply");
    if (!replyDraft.trim()) return;
    reply.mutate({ story, user, body: replyDraft.trim() }, {
      onSuccess: () => {
        setReplyDraft("");
        toast.success("Reply sent to messages");
      },
      onError: error => toast.error(error.message),
    });
  };

  const shareStory = async () => {
    const url = `${window.location.origin}/stories?story=${encodeURIComponent(story.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${story.authorName} on Savanna`, text: story.textBody ?? "A Savanna story", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Story link copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this story");
    }
  };

  return (
    <section ref={sectionRef} className="savanna-story-reel relative min-h-[100dvh] snap-start overflow-hidden bg-[#0A1014] text-white">
      <StoryMedia story={story} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/48 via-black/8 to-black/76" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href="/messages" aria-label="Back to messages" className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#F8E8C4] backdrop-blur-xl">{label}</span>
        <button type="button" aria-label="Story options" className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
          <MoreVertical className="size-5" />
        </button>
      </div>

      <div className="absolute bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-0 right-16 z-10 space-y-3 p-4 sm:right-20">
        <Link href={`/people/${story.authorUserId}`} className="inline-flex max-w-full items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-white/25 bg-[#D9A441]/20 text-sm font-semibold text-[#F8E8C4] backdrop-blur-xl">{profileInitial}</span>
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">{story.authorName}</span>
            <span className="block truncate text-xs text-white/65">{story.isMemory ? "Memory" : "Story"} on Savanna</span>
          </span>
        </Link>
        {story.textBody && story.media?.[0]?.url ? <p className="line-clamp-3 max-w-xl text-sm leading-6 text-white/88">{story.textBody}</p> : null}
        <ProductOverlay story={story} />
        <form onSubmit={submitReply} className="flex max-w-xl items-center gap-2 rounded-full border border-white/12 bg-black/24 p-2 backdrop-blur-xl">
          <input value={replyDraft} onChange={event => setReplyDraft(event.target.value)} placeholder="Reply privately" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-white/55" />
          <Button type="submit" size="icon" disabled={reply.isPending || !replyDraft.trim()} className="savanna-brand-token size-9 rounded-full shadow-none">
            {reply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>

      <div className="absolute bottom-[calc(6.15rem+env(safe-area-inset-bottom))] right-3 z-10 flex flex-col items-center gap-3 sm:right-5">
        <button type="button" onClick={() => user ? react.mutate({ storyId: story.id, user, emoji: "heart" }, { onSuccess: () => toast.success("Liked"), onError: error => toast.error(error.message) }) : toast.error("Sign in to like stories")} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl">
          <Heart className="size-5" />
        </button>
        <button type="button" onClick={onComments} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl">
          <MessageCircle className="size-5" />
        </button>
        <button type="button" onClick={shareStory} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl">
          <Share2 className="size-5" />
        </button>
        <button type="button" onClick={() => user ? react.mutate({ storyId: story.id, user, emoji: "save" }, { onSuccess: () => toast.success("Saved signal sent"), onError: error => toast.error(error.message) }) : toast.error("Sign in to save stories")} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl">
          <Bookmark className="size-5" />
        </button>
        <SafetyActions targetDomain="story" targetId={story.id} targetLabel="this Story" blockUserId={story.authorUserId} />
      </div>
    </section>
  );
}

function CommentsSheet({ story, onClose }: { story: FirebaseStory; onClose: () => void }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const comments = useFirebaseStoryComments(story.id, true);
  const comment = useCommentFirebaseStory();

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return toast.error("Sign in to comment");
    if (!draft.trim()) return;
    comment.mutate({ storyId: story.id, user, body: draft.trim() }, {
      onSuccess: () => {
        setDraft("");
        toast.success("Comment added");
      },
      onError: error => toast.error(error.message),
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Story comments" className="fixed inset-0 z-[90] flex items-end bg-black/45 p-3">
      <section className="mx-auto flex max-h-[72dvh] w-full max-w-xl flex-col rounded-[28px] bg-white p-4 text-[#151A17] shadow-2xl dark:bg-[#111B21] dark:text-[#E9EDEF]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Comments</p>
            <p className="text-xs text-[#5F6861] dark:text-[#AEBAC1]">{story.authorName}'s story</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="rounded-full"><X className="size-5" /></Button>
        </div>
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {comments.isLoading ? <div className="grid h-28 place-items-center"><Loader2 className="size-4 animate-spin text-[#D9A441]" /></div> : comments.data?.length ? comments.data.map(item => (
            <article key={item.id} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D9A441]/20 text-xs font-semibold text-[#D9A441]">{item.userPhotoURL ? <img src={item.userPhotoURL} alt="" className="size-full object-cover" /> : item.userName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1 rounded-2xl bg-[#F6F5F5] px-3 py-2 dark:bg-[#23282C]">
                <p className="truncate text-xs font-semibold">{item.userName}</p>
                <p className="mt-1 text-sm leading-5 text-[#5F6861] dark:text-[#AEBAC1]">{item.body}</p>
              </div>
            </article>
          )) : <p className="py-10 text-center text-sm text-[#5F6861] dark:text-[#AEBAC1]">No comments yet.</p>}
        </div>
        <form onSubmit={submitComment} className="mt-4 flex items-center gap-2 rounded-full border border-[#DDE3DC] bg-white p-2 dark:border-[#26343A] dark:bg-[#23282C]">
          <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={280} placeholder="Add a comment" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-[#8A938D]" />
          <Button type="submit" size="icon" disabled={comment.isPending || !draft.trim()} className="savanna-brand-token size-9 rounded-full shadow-none">
            {comment.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </section>
    </div>
  );
}

function AdSlotPreview({ item }: { item: Extract<StoryFeedItem, { kind: "ad-slot" }> }) {
  return (
    <section className="savanna-story-reel relative grid min-h-[100dvh] snap-start place-items-center bg-[#0A1014] px-6 text-center text-white">
      <div className="max-w-sm">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
          <Sparkles className="size-6" />
        </span>
        <p className="mt-5 font-display text-3xl font-semibold">Contextual placement ready.</p>
        <p className="mt-3 text-sm leading-6 text-white/65">This slot can later receive ads matched to {item.context.tab.replace("_", " ")}, broad location, shop activity, and recent story context.</p>
      </div>
    </section>
  );
}

export default function StoriesPage() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<StoryDiscoveryTab>("for_you");
  const [composing, setComposing] = useState(false);
  const [commentStory, setCommentStory] = useState<FirebaseStory | null>(null);
  const stories = useFirebaseStories(user, true);
  const followedUserIdsQuery = useFollowedUserIds(user, true);
  const followedUserIds = useMemo(() => new Set(followedUserIdsQuery.data ?? []), [followedUserIdsQuery.data]);

  const filteredStories = useMemo(() => {
    const source = stories.data ?? [];
    return source.filter(story => storyMatchesTab(story, activeTab, followedUserIds, user?.city, user?.countryCode, user?.id));
  }, [activeTab, followedUserIds, stories.data, user?.city, user?.countryCode, user?.id]);

  const feedItems = useMemo(
    () => buildStoriesFeedItems(filteredStories, activeTab, user?.id ?? null, user?.city ?? null, user?.countryCode ?? null),
    [activeTab, filteredStories, user?.city, user?.countryCode, user?.id],
  );

  const openComposer = () => {
    if (!isAuthenticated) {
      toast.error("Sign in to share a Story");
      navigate("/login");
      return;
    }
    setComposing(true);
  };

  return (
    <SavannaShell hideMobileHeader>
      <div className="savanna-route-stories relative -mx-4 -my-5 min-h-[100dvh] bg-[#0A1014] text-white sm:-mx-6 lg:mx-auto lg:-my-8 lg:max-w-[540px]">
        <div className="pointer-events-none fixed inset-x-0 top-0 z-30 mx-auto max-w-[540px] px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-2">
            {storyTabs.map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                data-active={activeTab === tab.value}
                className={cn(
                  "savanna-story-filter-pill shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold backdrop-blur-xl transition-colors",
                  activeTab === tab.value ? "border-[#D9A441]/30 bg-[#D9A441]/20 text-[#D9A441]" : "border-white/10 bg-black/24 text-white/72",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={openComposer} aria-label="Create Story" className="savanna-brand-token fixed right-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.25rem)] z-30 grid size-11 place-items-center rounded-full shadow-none lg:right-[calc(50%-250px)]">
          <AnimatedPlusIcon size={18} />
        </button>

        <div className="h-[100dvh] snap-y snap-mandatory overflow-y-auto overscroll-contain">
          {stories.isLoading ? (
            <section className="grid min-h-[100dvh] snap-start place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></section>
          ) : feedItems.length ? (
            feedItems.map(item => item.kind === "story" ? <ReelStory key={item.story.id} story={item.story} onComments={() => setCommentStory(item.story)} /> : <AdSlotPreview key={item.slotId} item={item} />)
          ) : (
            <section className="grid min-h-[100dvh] snap-start place-items-center px-6 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-16 place-items-center rounded-[24px] bg-[#D9A441]/20 text-[#D9A441]"><Sparkles className="size-7" /></span>
                <h1 className="mt-5 font-display text-4xl font-semibold">No stories here yet.</h1>
                <p className="mt-3 text-sm leading-6 text-white/65">As people, shops, and communities share public stories, this feed will start to feel alive.</p>
                <Button type="button" onClick={openComposer} className="savanna-brand-token mt-6 rounded-xl shadow-none"><AnimatedPlusIcon className="mr-2" size={16} />Share a Story</Button>
              </div>
            </section>
          )}
        </div>

        {composing ? (
          <div role="dialog" aria-modal="true" aria-label="Create Story" className="fixed inset-0 z-[90] grid items-end bg-black/55 p-4">
            <div className="mx-auto w-full max-w-xl rounded-[28px] bg-white p-5 text-[#151A17] shadow-2xl dark:bg-[#111B21] dark:text-[#E9EDEF]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl font-semibold">Share a Story</h2>
                <Button type="button" variant="ghost" size="icon" onClick={() => setComposing(false)} className="rounded-full"><X className="size-5" /></Button>
              </div>
              <StoryComposer compact onDone={() => setComposing(false)} />
            </div>
          </div>
        ) : null}

        {commentStory ? <CommentsSheet story={commentStory} onClose={() => setCommentStory(null)} /> : null}
      </div>
    </SavannaShell>
  );
}
