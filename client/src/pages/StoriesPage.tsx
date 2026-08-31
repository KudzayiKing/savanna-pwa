import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedPlusIcon } from "@/components/AnimatedNavIcons";
import { SavannaShell } from "@/components/SavannaShell";
import { SafetyActions } from "@/components/SafetyActions";
import { StoryComposer } from "@/components/StoriesPanel";
import { Button } from "@/components/ui/button";
import { useFirebaseCommunityDiscoveryPosts, useFirebaseCommunityMutations, type FirebaseCommunityDiscoveryPost } from "@/lib/firebaseCommunities";
import { useFirebaseMessageMemories } from "@/lib/firebaseChat";
import { useCommentFirebaseStory, useDeleteFirebaseStoryComment, useFirebaseStories, useFirebaseStory, useFirebaseStoryAnalytics, useFirebaseStoryComments, useLogFirebaseStoryPlacementEvent, useReactToFirebaseStory, useReplyToFirebaseStory, useSaveFirebaseStoryMemory, useViewFirebaseStory, type FirebaseStory, type FirebaseStoryPlacementAction } from "@/lib/firebaseStories";
import { useFollowedUserIds } from "@/lib/userProfile";
import { cn } from "@/lib/utils";
import { ArrowLeft, BarChart3, Bookmark, BookmarkCheck, Eye, Heart, Loader2, Megaphone, MessageCircle, MoreVertical, Pause, Play, Send, Share2, ShoppingBag, Sparkles, Store, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type StoryDiscoveryTab = "for_you" | "near_you" | "following" | "shops" | "community";

type StoryFeedItem =
  | { kind: "story"; story: FirebaseStory }
  | { kind: "community-post"; post: FirebaseCommunityDiscoveryPost }
  | { kind: "ad-slot"; slotId: string; context: StoryAdContext };

type StoryContentItem = Exclude<StoryFeedItem, { kind: "ad-slot" }>;

type StoryAdContext = {
  surface: "stories";
  tab: StoryDiscoveryTab;
  viewerUserId: string | null;
  viewerCity: string | null;
  viewerCountryCode: string | null;
  nearbyStoryCount: number;
  shopStoryCount: number;
  communityPostCount: number;
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
  if (minor == null || !currency) return null;
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

function communityPostIsNearViewer(post: FirebaseCommunityDiscoveryPost, userCity?: string | null, userCountryCode?: string | null) {
  const postCity = post.communityCity?.trim().toLowerCase();
  const viewerCity = userCity?.trim().toLowerCase();
  const postCountry = post.communityCountryCode?.trim().toLowerCase();
  const viewerCountry = userCountryCode?.trim().toLowerCase();
  return Boolean(
    post.discovery.slot === "around_you"
    || (postCity && viewerCity && postCity === viewerCity)
    || (postCountry && viewerCountry && postCountry === viewerCountry)
  );
}

function storyMatchesTab(story: FirebaseStory, tab: StoryDiscoveryTab, followedUserIds: Set<string>, userCity?: string | null, userCountryCode?: string | null, currentUserId?: string | null) {
  if (tab === "for_you") return true;
  if (tab === "near_you") return isNearViewer(story, userCity, userCountryCode);
  if (tab === "following") return story.authorUserId === currentUserId || followedUserIds.has(story.authorUserId);
  if (tab === "shops") return Boolean(story.storefrontId || story.productName || story.discovery.slot === "product_memory");
  if (tab === "community") return Boolean(story.communityId);
  return false;
}

function contentItemId(item: StoryContentItem) {
  return item.kind === "story" ? item.story.id : `community-${item.post.communityId}-${item.post.id}`;
}

function contentItemTime(item: StoryContentItem) {
  return item.kind === "story" ? item.story.publishedAt : item.post.createdAt;
}

function contentMatchesTab(item: StoryContentItem, tab: StoryDiscoveryTab, followedUserIds: Set<string>, userCity?: string | null, userCountryCode?: string | null, currentUserId?: string | null) {
  if (item.kind === "story") return storyMatchesTab(item.story, tab, followedUserIds, userCity, userCountryCode, currentUserId);
  if (tab === "for_you") return true;
  if (tab === "near_you") return communityPostIsNearViewer(item.post, userCity, userCountryCode);
  if (tab === "shops") return Boolean(item.post.productId || item.post.storefrontId);
  if (tab === "community") return true;
  return false;
}

function buildStoryAdContext(items: StoryContentItem[], tab: StoryDiscoveryTab, viewerUserId: string | null, viewerCity: string | null, viewerCountryCode: string | null, precedingStoryId: string | null): StoryAdContext {
  const stories = items.filter((item): item is Extract<StoryContentItem, { kind: "story" }> => item.kind === "story").map(item => item.story);
  return {
    surface: "stories",
    tab,
    viewerUserId,
    viewerCity,
    viewerCountryCode,
    nearbyStoryCount: stories.filter(story => isNearViewer(story, viewerCity, viewerCountryCode)).length,
    shopStoryCount: stories.filter(story => story.storefrontId || story.productName).length,
    communityPostCount: items.filter(item => item.kind === "community-post").length,
    precedingStoryId,
  };
}

function buildStoriesFeedItems(items: StoryContentItem[], tab: StoryDiscoveryTab, viewerUserId: string | null, viewerCity: string | null, viewerCountryCode: string | null): StoryFeedItem[] {
  const adsEnabled = false;
  return items.flatMap((item, index): StoryFeedItem[] => {
    if (!adsEnabled || index === 0 || index % 6 !== 0) return [item];
    return [
      {
        kind: "ad-slot",
        slotId: `stories-${tab}-${index}`,
        context: buildStoryAdContext(items, tab, viewerUserId, viewerCity, viewerCountryCode, items[index - 1] ? contentItemId(items[index - 1]) : null),
      },
      item,
    ];
  });
}

function StoryAnalyticsPill({ story }: { story: FirebaseStory }) {
  const { user } = useAuth();
  const analytics = useFirebaseStoryAnalytics(story, user);
  if (story.authorUserId !== user?.id) return null;
  const data = analytics.data;
  return (
    <div className="flex max-w-xl flex-wrap items-center gap-2 rounded-[20px] border border-white/10 bg-black/24 p-2 text-xs font-semibold text-white/78 backdrop-blur-xl">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D9A441]/20 px-2.5 py-1 text-[#F8E8C4]">
        <BarChart3 className="size-3.5" /> Creator stats
      </span>
      {analytics.isLoading ? (
        <span className="inline-flex items-center gap-1.5 px-1"><Loader2 className="size-3 animate-spin" /> Loading</span>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 px-1"><Eye className="size-3.5" /> {data?.viewCount ?? 0}</span>
          <span className="inline-flex items-center gap-1.5 px-1"><Heart className="size-3.5" /> {data?.likeCount ?? 0}</span>
          <span className="inline-flex items-center gap-1.5 px-1"><MessageCircle className="size-3.5" /> {data?.commentCount ?? 0}</span>
          <span className="inline-flex items-center gap-1.5 px-1"><Send className="size-3.5" /> {data?.replyCount ?? 0}</span>
          <span className="inline-flex items-center gap-1.5 px-1"><Bookmark className="size-3.5" /> {data?.saveCount ?? 0}</span>
        </>
      )}
    </div>
  );
}

function CommunityPostReel({ post }: { post: FirebaseCommunityDiscoveryPost }) {
  const { user } = useAuth();
  const communityMutations = useFirebaseCommunityMutations(user);
  const postLabel = post.discovery.label === "Yours" ? "Community" : post.discovery.label;
  const productPrice = formatPrice(post.productPriceMinor, post.productCurrencyCode);
  const productHref = post.productId && post.storefrontSlug ? `/shops/${post.storefrontSlug}/products/${post.productId}` : post.storefrontSlug ? `/shops/${post.storefrontSlug}` : null;
  const reactToPost = (emoji: string, successMessage: string) => {
    if (!user) return toast.error("Sign in to react to community posts");
    communityMutations.reactToPost.mutate({ communityId: post.communityId, postId: post.id, emoji }, {
      onSuccess: () => toast.success(successMessage),
      onError: error => toast.error(error.message),
    });
  };

  return (
    <section className="savanna-story-reel relative min-h-[100dvh] snap-start overflow-hidden bg-[#0A1014] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,164,65,0.22),transparent_36%),linear-gradient(145deg,#0A1014,#10181d_54%,#221b10)]" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href="/communities" aria-label="Back to communities" className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#F8E8C4] backdrop-blur-xl">{postLabel}</span>
        <Link href={`/communities/${post.communityId}`} aria-label={`Open ${post.communityName}`} className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
          <MessageCircle className="size-5" />
        </Link>
      </div>

      <div className="relative z-10 flex min-h-[100dvh] flex-col justify-end px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-28">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#F8E8C4] backdrop-blur-xl">
            <Megaphone className="size-3.5" /> {post.kind}
          </span>
          {post.title ? <h1 className="mt-5 font-display text-4xl font-semibold leading-tight sm:text-5xl">{post.title}</h1> : null}
          <p className={cn("whitespace-pre-wrap leading-8 text-white/88", post.title ? "mt-4 text-xl" : "mt-5 font-display text-4xl font-semibold")}>{post.body}</p>
          {productHref ? (
            <Link href={productHref} className="mt-4 flex items-center gap-3 rounded-[24px] border border-white/12 bg-black/28 p-3 backdrop-blur-xl">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[18px] bg-[#D9A441]/20 text-[#F8E8C4]">
                {post.productPrimaryImageUrl ? <img src={post.productPrimaryImageUrl} alt="" className="size-full object-cover" /> : <ShoppingBag className="size-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{post.productName || post.storefrontName || "Shop listing"}</span>
                {post.productDescription ? <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-white/68">{post.productDescription}</span> : null}
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#F8E8C4]">
                  <Store className="size-3.5" /> {post.storefrontName || "Visit shop"}
                </span>
              </span>
              {productPrice ? <span className="shrink-0 text-xs font-semibold text-[#F8E8C4]">{productPrice}</span> : null}
            </Link>
          ) : null}
          <Link href={`/communities/${post.communityId}`} className="mt-6 flex items-center gap-3 rounded-[24px] border border-white/12 bg-black/24 p-3 backdrop-blur-xl">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#F8E8C4]">
              <MessageCircle className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{post.communityName}</span>
              <span className="block truncate text-xs text-white/62">{post.communityMemberCount} members{post.communityCity ? ` · ${post.communityCity}` : ""}</span>
            </span>
          </Link>
        </div>
      </div>

      <div className="absolute bottom-[calc(6.15rem+env(safe-area-inset-bottom))] right-3 z-10 flex flex-col items-center gap-3 sm:right-5">
        <Link href={`/people/${post.authorUserId}`} className="grid size-12 place-items-center overflow-hidden rounded-full bg-black/28 text-sm font-semibold text-[#F8E8C4] backdrop-blur-xl" aria-label={`Open ${post.authorName}'s profile`}>
          {post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" className="size-full object-cover" /> : post.authorName.slice(0, 1).toUpperCase()}
        </Link>
        <Link href={`/communities/${post.communityId}`} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl" aria-label="Open community discussion">
          <MessageCircle className="size-5" />
        </Link>
        <button type="button" onClick={() => reactToPost("heart", "Liked")} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl" aria-label="Like community post">
          <Heart className="size-5" />
        </button>
        <button type="button" onClick={() => reactToPost("save", "Community post saved")} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl" aria-label="Save community post">
          <Bookmark className="size-5" />
        </button>
        <button type="button" onClick={async () => {
          const url = `${window.location.origin}/communities/${post.communityId}`;
          await navigator.clipboard.writeText(url);
          toast.success("Community link copied");
        }} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl" aria-label="Share community post">
          <Share2 className="size-5" />
        </button>
        <SafetyActions targetDomain="community_post" targetId={`${post.communityId}/${post.id}`} targetLabel="this community post" blockUserId={post.authorUserId} />
      </div>
    </section>
  );
}

function StoryProgressBars({ storyId, paused }: { storyId: string; paused: boolean }) {
  return (
    <>
      <style>{`@keyframes savannaStoryProgress { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
      <div className="pointer-events-none flex flex-1 gap-1" aria-hidden="true">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/24">
          <span
            key={storyId}
            className="block h-full rounded-full bg-[#D9A441]"
            style={{ animation: "savannaStoryProgress 7s linear forwards", animationPlayState: paused ? "paused" : "running" }}
          />
        </span>
      </div>
    </>
  );
}

function StoryMedia({ story, paused, muted }: { story: FirebaseStory; paused: boolean; muted: boolean }) {
  const media = story.media?.[0];
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (paused) void video.pause();
    else void video.play().catch(() => undefined);
  }, [muted, paused, story.id]);

  if (media?.url && media.type === "image") return <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" />;
  if (media?.url && media.type === "video") return <video ref={videoRef} src={media.url} className="absolute inset-0 h-full w-full object-cover" autoPlay muted={muted} loop playsInline controls={false} />;
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

function CommunityOverlay({ story }: { story: FirebaseStory }) {
  if (!story.communityId) return null;
  return (
    <Link href={`/communities/${story.communityId}`} className="flex items-center gap-3 rounded-[22px] border border-white/15 bg-black/28 p-3 text-white backdrop-blur-xl">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#F8E8C4]">
        <MessageCircle className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{story.communityName || "Community story"}</span>
        <span className="block truncate text-xs text-white/62">Open community</span>
      </span>
    </Link>
  );
}

function ReelStory({
  story,
  onComments,
  onPrevious,
  onNext,
  activeTab,
  isSaved,
}: {
  story: FirebaseStory;
  onComments: () => void;
  onPrevious: () => void;
  onNext: () => void;
  activeTab: StoryDiscoveryTab;
  isSaved: boolean;
}) {
  const { user } = useAuth();
  const view = useViewFirebaseStory();
  const react = useReactToFirebaseStory();
  const saveMemory = useSaveFirebaseStoryMemory();
  const reply = useReplyToFirebaseStory();
  const logPlacement = useLogFirebaseStoryPlacementEvent();
  const [replyDraft, setReplyDraft] = useState("");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [saved, setSaved] = useState(isSaved);
  const [liked, setLiked] = useState(false);
  const viewedRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const profileInitial = story.authorName.slice(0, 1).toUpperCase();
  const label = story.discovery.label === "Yours" ? "Your story" : story.discovery.label;

  useEffect(() => setSaved(isSaved), [isSaved]);

  const recordPlacement = (action: FirebaseStoryPlacementAction) => {
    if (!user) return;
    logPlacement.mutate({
      user,
      placementId: `story-${story.id}`,
      action,
      tab: activeTab,
      sourceKind: "story",
      storyId: story.id,
      communityId: story.communityId,
      storefrontId: story.storefrontId,
      broadCity: user.city ?? story.authorCity,
      countryCode: user.countryCode ?? story.authorCountryCode,
    });
  };

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !user || viewedRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.65 || viewedRef.current) return;
      viewedRef.current = true;
      view.mutate({ storyId: story.id, user });
      recordPlacement("impression");
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
        recordPlacement("reply");
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
      recordPlacement("share");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this story");
    }
  };

  return (
    <section ref={sectionRef} className="savanna-story-reel relative min-h-[100dvh] snap-start overflow-hidden bg-[#0A1014] text-white">
      <StoryMedia story={story} paused={paused} muted={muted} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/48 via-black/8 to-black/76" />
      <button type="button" aria-label="Previous story" onClick={onPrevious} className="absolute bottom-36 left-0 top-24 z-[5] w-1/3" />
      <button type="button" aria-label="Next story" onClick={onNext} className="absolute bottom-36 right-16 top-24 z-[5] w-1/3 sm:right-20" />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href="/messages" aria-label="Back to messages" className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
          <ArrowLeft className="size-5" />
        </Link>
        <StoryProgressBars storyId={story.id} paused={paused} />
        <span className="rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#F8E8C4] backdrop-blur-xl">{label}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? "Play story" : "Pause story"} className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
            {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
          </button>
          <button type="button" onClick={() => setMuted(value => !value)} aria-label={muted ? "Unmute story" : "Mute story"} className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <button type="button" aria-label="Story options" className="grid size-10 place-items-center rounded-full bg-black/24 text-white backdrop-blur-xl">
            <MoreVertical className="size-5" />
          </button>
        </div>
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
        <CommunityOverlay story={story} />
        <StoryAnalyticsPill story={story} />
        <form onSubmit={submitReply} className="flex max-w-xl items-center gap-2 rounded-full border border-white/12 bg-black/24 p-2 backdrop-blur-xl">
          <input value={replyDraft} onChange={event => setReplyDraft(event.target.value)} placeholder="Reply privately" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-white/55" />
          <Button type="submit" size="icon" disabled={reply.isPending || !replyDraft.trim()} className="savanna-brand-token size-9 rounded-full shadow-none">
            {reply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>

      <div className="absolute bottom-[calc(6.15rem+env(safe-area-inset-bottom))] right-3 z-10 flex flex-col items-center gap-3 sm:right-5">
        <button type="button" onClick={() => user ? react.mutate({ storyId: story.id, user, emoji: "heart" }, { onSuccess: () => { setLiked(true); recordPlacement("like"); toast.success("Liked"); }, onError: error => toast.error(error.message) }) : toast.error("Sign in to like stories")} className={cn("grid size-12 place-items-center rounded-full bg-black/28 backdrop-blur-xl", liked ? "text-[#D9A441]" : "text-white")}>
          <Heart className={cn("size-5", liked && "fill-current")} />
        </button>
        <button type="button" onClick={() => { recordPlacement("comment"); onComments(); }} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl">
          <MessageCircle className="size-5" />
        </button>
        <button type="button" onClick={shareStory} className="grid size-12 place-items-center rounded-full bg-black/28 text-white backdrop-blur-xl">
          <Share2 className="size-5" />
        </button>
        <button type="button" onClick={() => {
          if (!user) return toast.error("Sign in to save stories");
          if (saved) return toast.info("Already saved to Memory");
          saveMemory.mutate({ story, user }, { onSuccess: () => { setSaved(true); recordPlacement("save"); toast.success("Saved to Memory"); }, onError: error => toast.error(error.message) });
        }} className={cn("grid size-12 place-items-center rounded-full bg-black/28 backdrop-blur-xl", saved ? "text-[#D9A441]" : "text-white")} aria-label={saved ? "Saved to Memory" : "Save story to Memory"}>
          {saved ? <BookmarkCheck className="size-5" /> : <Bookmark className="size-5" />}
        </button>
        <SafetyActions targetDomain="story" targetId={story.id} targetLabel="this Story" blockUserId={story.authorUserId} />
      </div>
    </section>
  );
}

function CommentsSheet({ story, onClose }: { story: FirebaseStory; onClose: () => void }) {
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const comments = useFirebaseStoryComments(story.id, true, user);
  const comment = useCommentFirebaseStory();
  const deleteComment = useDeleteFirebaseStoryComment();
  const commentCount = comments.data?.length ?? 0;

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
            <p className="text-sm font-semibold">Comments · {commentCount}</p>
            <p className="text-xs text-[#5F6861] dark:text-[#AEBAC1]">{story.authorName}'s story</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="rounded-full"><X className="size-5" /></Button>
        </div>
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {comments.isLoading ? <div className="grid h-28 place-items-center text-center text-sm text-[#5F6861] dark:text-[#AEBAC1]"><div><Loader2 className="mx-auto size-4 animate-spin text-[#D9A441]" /><p className="mt-2">Loading comments</p></div></div> : comments.data?.length ? comments.data.map(item => {
            const canDelete = item.userId === user?.id || story.authorUserId === user?.id;
            return (
            <article key={item.id} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D9A441]/20 text-xs font-semibold text-[#D9A441]">{item.userPhotoURL ? <img src={item.userPhotoURL} alt="" className="size-full object-cover" /> : item.userName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1 rounded-2xl bg-[#F6F5F5] px-3 py-2 dark:bg-[#23282C]">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-xs font-semibold">{item.userName}</p>
                  {canDelete ? (
                    <button
                      type="button"
                      disabled={deleteComment.isPending}
                      onClick={() => deleteComment.mutate({ storyId: story.id, commentId: item.id }, {
                        onSuccess: () => toast.success("Comment removed"),
                        onError: error => toast.error(error.message),
                      })}
                      className="grid size-7 shrink-0 place-items-center rounded-full text-[#8A938D] hover:bg-[#D9A441]/10 hover:text-[#D9A441]"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-sm leading-5 text-[#5F6861] dark:text-[#AEBAC1]">{item.body}</p>
                {item.userId !== user?.id ? (
                  <div className="mt-2">
                    <SafetyActions targetDomain="story_comment" targetId={`${story.id}/${item.id}`} targetLabel="this comment" blockUserId={item.userId} />
                  </div>
                ) : null}
              </div>
            </article>
          );}) : <p className="py-10 text-center text-sm text-[#5F6861] dark:text-[#AEBAC1]">No comments yet. Be the first to add context.</p>}
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
  const storyParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedStoryId = storyParams.get("story");
  const shouldOpenComposer = storyParams.get("compose") === "1";
  const composerCommunityId = storyParams.get("communityId");
  const composerCommunityName = storyParams.get("communityName");
  const composerStorefrontId = storyParams.get("storefrontId");
  const composerStorefrontSlug = storyParams.get("storefrontSlug");
  const composerStorefrontName = storyParams.get("storefrontName");
  const composerProductId = storyParams.get("productId");
  const composerProductName = storyParams.get("productName");
  const composerProductDescription = storyParams.get("productDescription");
  const composerProductCurrencyCode = storyParams.get("productCurrencyCode");
  const composerProductPriceMinor = Number(storyParams.get("productPriceMinor"));
  const [activeTab, setActiveTab] = useState<StoryDiscoveryTab>("for_you");
  const [composing, setComposing] = useState(false);
  const [commentStory, setCommentStory] = useState<FirebaseStory | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const stories = useFirebaseStories(user, true);
  const requestedStory = useFirebaseStory(requestedStoryId, user);
  const communityPosts = useFirebaseCommunityDiscoveryPosts(user, true);
  const savedMemories = useFirebaseMessageMemories(user);
  const followedUserIdsQuery = useFollowedUserIds(user, true);
  const followedUserIds = useMemo(() => new Set(followedUserIdsQuery.data ?? []), [followedUserIdsQuery.data]);
  const savedStoryIds = useMemo(() => new Set((savedMemories.data ?? []).filter(memory => memory.sourceType === "story" && memory.storyId).map(memory => memory.storyId as string)), [savedMemories.data]);

  useEffect(() => {
    if (shouldOpenComposer && isAuthenticated) setComposing(true);
  }, [isAuthenticated, shouldOpenComposer]);

  const filteredContent = useMemo(() => {
    const storySource = [...(stories.data ?? [])];
    if (requestedStory.data && !storySource.some(story => story.id === requestedStory.data?.id)) storySource.unshift(requestedStory.data);
    const source: StoryContentItem[] = [
      ...storySource.map(story => ({ kind: "story" as const, story })),
      ...(communityPosts.data ?? []).map(post => ({ kind: "community-post" as const, post })),
    ];
    return source
      .filter(item => contentItemId(item) === requestedStoryId || contentMatchesTab(item, activeTab, followedUserIds, user?.city, user?.countryCode, user?.id))
      .sort((left, right) => {
        if (requestedStoryId) {
          const requestedDelta = Number(contentItemId(right) === requestedStoryId) - Number(contentItemId(left) === requestedStoryId);
          if (requestedDelta) return requestedDelta;
        }
        const scoreDelta = (right.kind === "story" ? right.story.discovery.score : right.post.discovery.score) - (left.kind === "story" ? left.story.discovery.score : left.post.discovery.score);
        return scoreDelta || contentItemTime(right).getTime() - contentItemTime(left).getTime();
      });
  }, [activeTab, communityPosts.data, followedUserIds, requestedStory.data, requestedStoryId, stories.data, user?.city, user?.countryCode, user?.id]);

  const feedItems = useMemo(
    () => buildStoriesFeedItems(filteredContent, activeTab, user?.id ?? null, user?.city ?? null, user?.countryCode ?? null),
    [activeTab, filteredContent, user?.city, user?.countryCode, user?.id],
  );

  const openComposer = () => {
    if (!isAuthenticated) {
      toast.error("Sign in to share a Story");
      navigate("/login");
      return;
    }
    setComposing(true);
  };

  const moveFeed = (direction: -1 | 1) => {
    const node = feedRef.current;
    if (!node) return;
    node.scrollBy({ top: direction * node.clientHeight, behavior: "smooth" });
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

        <div ref={feedRef} className="h-[100dvh] snap-y snap-mandatory overflow-y-auto overscroll-contain">
          {stories.isLoading || communityPosts.isLoading || requestedStory.isLoading ? (
            <section className="grid min-h-[100dvh] snap-start place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></section>
          ) : feedItems.length ? (
            feedItems.map(item => {
              if (item.kind === "story") return <ReelStory key={item.story.id} story={item.story} onComments={() => setCommentStory(item.story)} onPrevious={() => moveFeed(-1)} onNext={() => moveFeed(1)} activeTab={activeTab} isSaved={savedStoryIds.has(item.story.id)} />;
              if (item.kind === "community-post") return <CommunityPostReel key={`${item.post.communityId}-${item.post.id}`} post={item.post} />;
              return <AdSlotPreview key={item.slotId} item={item} />;
            })
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
              <StoryComposer
                compact
                onDone={() => setComposing(false)}
                communityMode={Boolean(composerCommunityId)}
                communityId={composerCommunityId ?? undefined}
                communityName={composerCommunityName}
                businessMode={Boolean(composerStorefrontId)}
                storefrontId={composerStorefrontId ?? undefined}
                storefrontSlug={composerStorefrontSlug}
                storefrontName={composerStorefrontName}
                initialProductId={composerProductId}
                initialProductName={composerProductName}
                initialProductDescription={composerProductDescription}
                initialProductPriceMinor={Number.isFinite(composerProductPriceMinor) ? composerProductPriceMinor : null}
                initialProductCurrencyCode={composerProductCurrencyCode}
              />
            </div>
          </div>
        ) : null}

        {commentStory ? <CommentsSheet story={commentStory} onClose={() => setCommentStory(null)} /> : null}
      </div>
    </SavannaShell>
  );
}
