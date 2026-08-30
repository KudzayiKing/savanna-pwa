import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedPlusIcon, UserIcon } from "@/components/AnimatedNavIcons";
import { SafetyActions } from "@/components/SafetyActions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  type FirebaseStory,
  filterStoriesForFollowingHeader,
  useFirebaseStories,
  usePublishFirebaseStory,
  useReactToFirebaseStory,
  useReplyToFirebaseStory,
  useViewFirebaseStory,
} from "@/lib/firebaseStories";
import { useFollowedUserIds } from "@/lib/userProfile";
import { Bookmark, ChevronRight, Heart, Image as ImageIcon, Loader2, MessageCircle, Send, ShoppingBag, Sparkles, Type, Video, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const storyColors = ["#151A17", "#A87820", "#5A4A34", "#C95C55", "#6F6A60"];
const storyMediaTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4"];

type StoryAudience = "public" | "custom" | "private";
type StoryMode = "text" | "image" | "video";
type StoryItem = FirebaseStory;

type StoryComposerProps = {
  onDone: () => void;
  compact?: boolean;
  storefrontId?: string;
  storefrontSlug?: string | null;
  storefrontName?: string | null;
  businessMode?: boolean;
};

function parseAudienceIds(value: string) {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function storyColor(id: StoryItem["id"]) {
  const value = String(id).split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  return storyColors[Math.abs(value) % storyColors.length];
}

function isFirebaseStoryId(id: StoryItem["id"]) {
  return typeof id === "string" && !id.startsWith("preview-");
}

function formatMemoryPrice(minor?: number | null, currency?: string | null) {
  if (!minor || !currency) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

function StoryMediaFrame({ story, className = "" }: { story: StoryItem; className?: string }) {
  const media = story.media?.[0];
  if (media?.url && media.type === "image") {
    return <img src={media.url} alt="" className={`h-full w-full object-cover ${className}`} />;
  }
  if (media?.url && media.type === "video") {
    return <video src={media.url} className={`h-full w-full object-cover ${className}`} controls playsInline />;
  }
  return <span className={`absolute inset-0 bg-[#D9A441]/20 ${className}`} />;
}

function StoryProductSummary({ story }: { story: StoryItem }) {
  if (!story.productName) return null;
  const price = formatMemoryPrice(story.productPriceMinor, story.productCurrencyCode);
  return (
    <div className="mb-4 rounded-2xl border border-white/20 bg-black/30 p-3 text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <div className="flex items-start gap-2">
        <ShoppingBag className="mt-0.5 size-4 shrink-0 text-[#F8E8C4]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{story.productName}</p>
          {story.productDescription ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/78">{story.productDescription}</p> : null}
        </div>
        {price ? <span className="shrink-0 text-xs font-semibold text-[#F8E8C4]">{price}</span> : null}
      </div>
    </div>
  );
}

function StoryCard({ story, onOpen, compact }: { story: StoryItem; onOpen: () => void; compact?: boolean }) {
  return (
    <button
      key={story.id}
      onClick={onOpen}
      className="group relative h-[145px] w-[105px] shrink-0 overflow-hidden rounded-[20px] bg-[#151A17] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf0] sm:h-[164px] sm:w-[120px]"
      style={{ transform: compact ? "scale(0.78) translateX(-18px)" : "scale(1)", transformOrigin: "left center", transition: "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)" }}
    >
      <StoryMediaFrame story={story} />
      <span className="absolute inset-0 bg-black/20" />
      <span className="absolute left-3 top-3 grid size-8 place-items-center rounded-xl border border-white/45 bg-white/25 text-xs font-semibold text-white backdrop-blur-sm">
        {story.primaryMediaType === "video" ? <Video className="size-4" /> : story.primaryMediaType === "image" ? <ImageIcon className="size-4" /> : story.authorName.slice(0, 1).toUpperCase()}
      </span>
      {story.discovery?.label && story.discovery.label !== "Yours" ? (
        <span className="absolute right-3 top-3 max-w-[72px] truncate rounded-full bg-white/20 px-2 py-1 text-[10px] font-semibold text-[#F8E8C4] backdrop-blur-md">
          {story.discovery.label}
        </span>
      ) : null}
      <span className="absolute inset-x-3 bottom-3 line-clamp-3 text-xs font-semibold leading-tight text-white">{story.textBody || "A moment shared"}</span>
    </button>
  );
}

export function StoryComposer({ onDone, compact = false, storefrontId, storefrontSlug, storefrontName, businessMode = false }: StoryComposerProps) {
  const { user } = useAuth();
  const isBusinessMemory = businessMode || Boolean(storefrontId);
  const [mode, setMode] = useState<StoryMode>("text");
  const [draft, setDraft] = useState("");
  const [audience, setAudience] = useState<StoryAudience>(isBusinessMemory ? "public" : "private");
  const [customAudience, setCustomAudience] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saveToMemories, setSaveToMemories] = useState(isBusinessMemory);
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCurrencyCode, setProductCurrencyCode] = useState("KES");
  const publishStory = usePublishFirebaseStory();
  const isMediaMode = mode === "image" || mode === "video";
  const isPending = publishStory.isPending;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return setFile(null);
    const expected = mode === "video" ? ["video/mp4"] : ["image/jpeg", "image/png", "image/webp"];
    if (!expected.includes(selected.type)) return toast.error(mode === "video" ? "Choose an MP4 video" : "Choose a JPG, PNG, or WebP image");
    const maxSize = mode === "video" ? 20 * 1024 * 1024 : 6 * 1024 * 1024;
    if (selected.size > maxSize) return toast.error(mode === "video" ? "Story videos must be 20 MB or smaller" : "Story images must be 6 MB or smaller");
    setFile(selected);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return toast.error("Sign in to share a Story");
    const shouldSaveToMemories = isBusinessMemory || saveToMemories;
    const productPriceMinor = Math.round(Number(productPrice) * 100);
    const storyText = draft.trim() || (isBusinessMemory ? productDescription.trim() || productName.trim() : "");
    if (isBusinessMemory && !productName.trim()) return toast.error("Add a product name for this Memory");
    if (isBusinessMemory && !productDescription.trim()) return toast.error("Add a short product description");
    if (isBusinessMemory && (!Number.isFinite(productPriceMinor) || productPriceMinor <= 0)) return toast.error("Add a valid product price");
    const memoryFields = {
      saveToMemories: shouldSaveToMemories,
      storefrontId: storefrontId ?? undefined,
      storefrontSlug: storefrontSlug ?? undefined,
      storefrontName: storefrontName ?? undefined,
      productName: isBusinessMemory ? productName.trim() : undefined,
      productDescription: isBusinessMemory ? productDescription.trim() : undefined,
      productPriceMinor: isBusinessMemory ? productPriceMinor : undefined,
      productCurrencyCode: isBusinessMemory ? productCurrencyCode.trim().toUpperCase() : undefined,
    };
    const customAudienceUserIds = parseAudienceIds(customAudience);
    if (audience === "custom" && !customAudienceUserIds.length) return toast.error("Add at least one Savanna account ID");
    if (isMediaMode) {
      if (!file) return toast.error(mode === "video" ? "Choose a video for your Story" : "Choose an image for your Story");
      if (!storyMediaTypes.includes(file.type)) return toast.error("Choose supported Story media");
      try {
        publishStory.mutate({
          user,
          input: {
            textBody: draft.trim() || undefined,
            audience: isBusinessMemory ? "public" : audience,
            customAudienceUserIds,
            ...memoryFields,
            file,
          },
        }, {
          onSuccess: () => {
            onDone();
            toast.success(isBusinessMemory || saveToMemories ? "Story saved to Memories" : "Story shared for 24 hours");
          },
          onError: error => toast.error(error.message),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Story media could not be prepared");
      }
      return;
    }
    if (!storyText) return toast.error("Write something for your Story");
    publishStory.mutate({
      user,
      input: { textBody: storyText, audience: isBusinessMemory ? "public" : audience, customAudienceUserIds, ...memoryFields },
    }, {
      onSuccess: () => {
        onDone();
        toast.success(isBusinessMemory || saveToMemories ? "Story saved to Memories" : "Story shared for 24 hours");
      },
      onError: error => toast.error(error.message),
    });
  };

  return (
    <form className={`space-y-3 ${compact ? "" : "sm:flex sm:items-start sm:gap-3 sm:space-y-0"}`} onSubmit={handleSubmit}>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex rounded-xl bg-[#D9A441]/10 p-1">
          {([
            ["text", "Text", Type],
            ["image", "Image", ImageIcon],
            ["video", "Video", Video],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMode(value); setFile(null); }}
              data-active={mode === value}
              className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold ${mode === value ? "bg-white text-[#9a6410] shadow-sm" : "text-[#7b6647]"}`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <Textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} maxLength={700} placeholder={isMediaMode ? "Add a caption" : "Share a moment in words"} className="min-h-[100px] border-[#eadfca] bg-white/85" />
        {isMediaMode ? <input type="file" accept={mode === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"} onChange={handleFile} className="block h-10 w-full rounded-xl border border-[#eadfca] bg-white px-3 py-2 text-xs text-[#151A17]" /> : null}
        {isBusinessMemory ? (
          <div className="grid gap-3 rounded-2xl border border-[#eadfca] bg-white/70 p-3 sm:grid-cols-2">
            <input value={productName} onChange={event => setProductName(event.target.value)} placeholder="Product name" maxLength={160} className="h-10 rounded-xl border border-[#eadfca] bg-white px-3 text-xs text-[#151A17] outline-none focus:border-[#D9A441]" />
            <input value={productPrice} onChange={event => setProductPrice(event.target.value)} placeholder="Price" type="number" min="0" step="0.01" className="h-10 rounded-xl border border-[#eadfca] bg-white px-3 text-xs text-[#151A17] outline-none focus:border-[#D9A441]" />
            <input value={productDescription} onChange={event => setProductDescription(event.target.value)} placeholder="Short product description" maxLength={280} className="h-10 rounded-xl border border-[#eadfca] bg-white px-3 text-xs text-[#151A17] outline-none focus:border-[#D9A441] sm:col-span-2" />
            <input value={productCurrencyCode} onChange={event => setProductCurrencyCode(event.target.value.toUpperCase().slice(0, 3))} placeholder="KES" maxLength={3} className="h-10 rounded-xl border border-[#eadfca] bg-white px-3 text-xs text-[#151A17] outline-none focus:border-[#D9A441]" />
          </div>
        ) : (
          <label className="flex items-center gap-2 rounded-xl border border-[#eadfca] bg-white/70 px-3 py-2 text-xs font-semibold text-[#7b6647]">
            <input type="checkbox" checked={saveToMemories} onChange={event => setSaveToMemories(event.target.checked)} className="accent-[#D9A441]" />
            <Bookmark className="size-3.5 text-[#D9A441]" /> Save to Memories
          </label>
        )}
        {audience === "custom" ? <input aria-label="Savanna account IDs for custom Story audience" value={customAudience} onChange={event => setCustomAudience(event.target.value)} placeholder="Account IDs, separated by commas" className="h-10 w-full rounded-xl border border-[#eadfca] bg-white px-3 text-xs text-[#151A17]" /> : null}
      </div>
      <div className="flex w-full gap-2 sm:w-36 sm:flex-col">
        <select value={isBusinessMemory ? "public" : audience} disabled={isBusinessMemory} onChange={event => setAudience(event.target.value as StoryAudience)} className="h-10 flex-1 rounded-xl border border-[#eadfca] bg-white px-2 text-xs text-[#151A17] disabled:opacity-80">
          <option value="public">Public</option>
          <option value="private">Only me</option>
          <option value="custom">Selected people</option>
        </select>
        <Button type="submit" disabled={isPending} className="savanna-brand-token rounded-xl">{isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button>
        <Button type="button" variant="ghost" onClick={onDone} className="rounded-xl">Cancel</Button>
      </div>
    </form>
  );
}

function StoryViewer({ story, onClose, onMove, index, total }: { story: StoryItem; onClose: () => void; onMove?: (direction: -1 | 1) => void; index?: number; total?: number }) {
  const { user } = useAuth();
  const [replyDraft, setReplyDraft] = useState("");
  const react = useReactToFirebaseStory();
  const reply = useReplyToFirebaseStory();
  const media = story.media?.[0];

  const handleReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return toast.error("Sign in to reply to Stories");
    if (!isFirebaseStoryId(story.id)) return toast.info("Preview Stories cannot receive replies");
    if (!replyDraft.trim()) return;
    reply.mutate({ story, user, body: replyDraft.trim() }, {
      onSuccess: () => {
        setReplyDraft("");
        toast.success("Reply sent to messages");
      },
      onError: error => toast.error(error.message),
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`${story.authorName}'s Story`} className="fixed inset-0 z-[80] flex flex-col bg-black/80 p-4 text-white backdrop-blur-sm">
      <div className="mx-auto w-full max-w-md">
        {total && total > 1 ? (
          <div className="flex gap-1" aria-label={`Story ${(index ?? 0) + 1} of ${total}`}>
            {Array.from({ length: total }).map((_, progressIndex) => <div key={progressIndex} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"><div className={`h-full bg-[#D9A441] transition-transform duration-200 ${progressIndex > (index ?? 0) ? "-translate-x-full" : "translate-x-0"}`} /></div>)}
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full border border-[#D9A441] text-xs font-semibold" style={{ background: storyColor(story.id) }}>{story.authorName.slice(0, 1).toUpperCase()}</span>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">{story.authorName}</p>
          {total ? <p className="text-xs text-white/65">{(index ?? 0) + 1}/{total}</p> : null}
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close Story" className="rounded-full text-white hover:bg-white/15"><X className="size-5" /></Button>
        </div>
      </div>
      <div className="relative mx-auto flex w-full max-w-md flex-1 items-center justify-center py-4">
        {onMove ? <button type="button" onClick={() => onMove(-1)} aria-label="Previous Story" disabled={index === 0} className="absolute inset-y-0 left-0 z-10 w-1/4 disabled:cursor-default" /> : null}
        {onMove ? <button type="button" onClick={() => onMove(1)} disabled={index === (total ?? 1) - 1} aria-label="Next Story" className="absolute inset-y-0 right-0 z-10 w-1/4 disabled:cursor-default" /> : null}
        <article className="relative flex aspect-[3/4] w-full max-h-[62vh] flex-col justify-end overflow-hidden rounded-3xl bg-[#151A17] p-7 shadow-2xl">
          {media?.url && media.type === "image" ? <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
          {media?.url && media.type === "video" ? <video src={media.url} className="absolute inset-0 h-full w-full object-cover" controls autoPlay playsInline /> : null}
          {!media?.url ? <span className="absolute inset-0 bg-[#D9A441]/20" style={{ backgroundColor: storyColor(story.id) }} /> : null}
          <span className="absolute inset-0 bg-black/25" />
          <div className="relative">
            <StoryProductSummary story={story} />
            <p className="font-display text-3xl font-semibold leading-tight">{story.textBody || "A moment shared"}</p>
            <p className="mt-4 text-xs text-white/70">{story.isMemory ? "Saved to Memories" : `Expires ${new Date(story.expiresAt).toLocaleString()}`}</p>
          </div>
        </article>
      </div>
      <div className="mx-auto w-full max-w-md space-y-3 pb-2">
        <div className="flex gap-2">
          <Button onClick={() => user && isFirebaseStoryId(story.id) ? react.mutate({ storyId: story.id, user, emoji: "heart" }, { onSuccess: () => toast.success("Reaction sent"), onError: error => toast.error(error.message) }) : toast.info("Sign in to react to Stories")} disabled={react.isPending} className="rounded-xl bg-white text-[#151A17] hover:bg-[#fffaf0]"><Heart className="mr-2 size-4" />Like</Button>
          <Button onClick={() => user && isFirebaseStoryId(story.id) ? react.mutate({ storyId: story.id, user, emoji: "spark" }, { onSuccess: () => toast.success("Reaction sent"), onError: error => toast.error(error.message) }) : toast.info("Sign in to react to Stories")} disabled={react.isPending} variant="outline" className="rounded-xl border-white/35 bg-white/10 text-white hover:bg-white/20">Appreciate</Button>
          <div className="ml-auto"><SafetyActions targetDomain="story" targetId={String(story.id)} targetLabel="this Story" blockUserId={story.authorUserId} /></div>
        </div>
        <form onSubmit={handleReply} className="flex items-center gap-2 rounded-2xl bg-white/10 p-2">
          <MessageCircle className="ml-2 size-4 shrink-0 text-white/70" />
          <input value={replyDraft} onChange={event => setReplyDraft(event.target.value)} placeholder="Reply privately" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/55" />
          <Button type="submit" disabled={reply.isPending || !replyDraft.trim()} size="icon" className="savanna-brand-token size-9 shrink-0 rounded-xl"><Send className="size-4" /></Button>
        </form>
      </div>
    </div>
  );
}

export function StoriesPanel() {
  const { isAuthenticated, user } = useAuth();
  const stories = useFirebaseStories(user, true);
  const view = useViewFirebaseStory();
  const [isCompact, setIsCompact] = useState(false);
  const [pull, setPull] = useState(0);
  const [startY, setStartY] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [activeStoryId, setActiveStoryId] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncHeader = () => setIsCompact(window.scrollY > 90);
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
    return () => window.removeEventListener("scroll", syncHeader);
  }, []);

  const activeStory = stories.data?.find(story => story.id === activeStoryId) as StoryItem | undefined;
  const expandedHeight = Math.min(300, 224 + pull);
  const panelHeight = isCompact ? 124 : expandedHeight;
  const finishPull = () => { setStartY(null); setPull(0); };
  const openStory = (story: StoryItem) => {
    setActiveStoryId(story.id);
    if (user && isFirebaseStoryId(story.id)) view.mutate({ storyId: story.id, user });
  };

  return <>
    <section
      className="overflow-hidden rounded-[28px] border border-[#eadfca] bg-[#fffaf0] p-4 shadow-[0_20px_60px_rgba(94,58,11,0.055)] transition-[height] duration-300 sm:p-5"
      style={{ height: panelHeight }}
      onPointerDown={event => { if (window.scrollY === 0) setStartY(event.clientY); }}
      onPointerMove={event => { if (startY !== null && window.scrollY === 0) setPull(Math.max(0, Math.min(80, event.clientY - startY))); }}
      onPointerUp={finishPull}
      onPointerCancel={finishPull}
    >
      <div className="mb-4 flex items-center justify-between gap-4 px-1">
        <h1 className="truncate font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">The day, close to you</h1>
        <Button variant="ghost" onClick={() => railRef.current?.scrollTo({ left: 0, behavior: "smooth" })} className="shrink-0 rounded-xl text-[#9a6410] hover:bg-white/60 hover:text-[#D9A441]">
          {isCompact ? "Expand" : "See all"} <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>

      {composing ? <StoryComposer onDone={() => { setComposing(false); }} /> : (
        <div ref={railRef} className="story-rail flex gap-3 overflow-x-auto pb-1">
          <button onClick={() => isAuthenticated ? setComposing(true) : toast.error("Sign in to share a Story")} className="group relative h-[145px] w-[105px] shrink-0 overflow-hidden rounded-[20px] bg-[#151A17] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf0] sm:h-[164px] sm:w-[120px]" style={{ transform: isCompact ? "scale(0.78) translateX(-12px)" : "scale(1)", transformOrigin: "left center", transition: "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)" }}><span className="absolute inset-0 bg-[#D9A441]/20" /><span className="savanna-brand-token absolute left-3 top-3 grid size-8 place-items-center rounded-xl backdrop-blur-sm"><AnimatedPlusIcon size={16} /></span><span className="absolute inset-x-3 bottom-3 text-xs font-semibold leading-tight text-white">Your story</span></button>
          {stories.isLoading ? <div className="grid h-[145px] w-[105px] place-items-center rounded-[20px] bg-white/45 sm:h-[164px] sm:w-[120px]"><Loader2 className="size-4 animate-spin text-[#D9A441]" /></div> : stories.data?.length ? (stories.data as StoryItem[]).map(story => <StoryCard key={story.id} story={story} compact={isCompact} onOpen={() => openStory(story)} />) : <div className="flex h-[145px] w-[230px] shrink-0 flex-col justify-center rounded-[20px] border border-[#eadfca] bg-white/65 p-4 text-xs leading-5 text-[#5f6861] sm:h-[164px]"><Sparkles className="mb-2 size-4 text-[#D9A441]" />For you and Around you Stories will appear here when relevant public moments are available.</div>}
        </div>
      )}
    </section>
    {activeStory ? <StoryViewer story={activeStory} onClose={() => setActiveStoryId(null)} /> : null}
  </>;
}

export function MobileStoriesHeader() {
  const { isAuthenticated, user } = useAuth();
  const followedUserIds = useFollowedUserIds(user, true);
  const stories = useFirebaseStories(user, true);
  const followingStories = useMemo(() => filterStoriesForFollowingHeader(stories.data ?? [], user, followedUserIds.data ?? []), [followedUserIds.data, stories.data, user]);
  const view = useViewFirebaseStory();
  const [compact, setCompact] = useState(false);
  const [pull, setPull] = useState(0);
  const [startY, setStartY] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const storyPreviewParams = new URLSearchParams(window.location.search);
  const previewCompact = import.meta.env.DEV && storyPreviewParams.get("stories") === "compact";
  const previewStoriesEnabled = import.meta.env.DEV && !followingStories.length;

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

  const expandedHeight = Math.min(116, 78 + pull);
  const previewStories: StoryItem[] = previewStoriesEnabled ? [
    { id: "preview-101", authorUserId: "preview-101", authorName: "Ayo", authorCity: null, authorCountryCode: null, textBody: "Fresh produce is in today.", audience: "public", customAudienceUserIds: [], createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null, isMemory: false, storefrontId: null, storefrontSlug: null, storefrontName: null, productName: null, productDescription: null, productPriceMinor: null, productCurrencyCode: null, discovery: { slot: "for_you", label: "For you", reason: "A nearby public update", score: 55 }, media: [], primaryMediaUrl: null, primaryMediaType: null },
    { id: "preview-102", authorUserId: "preview-102", authorName: "Esi", authorCity: null, authorCountryCode: null, textBody: "A small thought for the day.", audience: "public", customAudienceUserIds: [], createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null, isMemory: false, storefrontId: null, storefrontSlug: null, storefrontName: null, productName: null, productDescription: null, productPriceMinor: null, productCurrencyCode: null, discovery: { slot: "for_you", label: "For you", reason: "A nearby public update", score: 55 }, media: [], primaryMediaUrl: null, primaryMediaType: null },
    { id: "preview-103", authorUserId: "preview-103", authorName: "Zawadi", authorCity: null, authorCountryCode: null, textBody: "New lesson is now available.", audience: "public", customAudienceUserIds: [], createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null, isMemory: false, storefrontId: null, storefrontSlug: null, storefrontName: null, productName: null, productDescription: null, productPriceMinor: null, productCurrencyCode: null, discovery: { slot: "for_you", label: "For you", reason: "A nearby public update", score: 55 }, media: [], primaryMediaUrl: null, primaryMediaType: null },
    { id: "preview-104", authorUserId: "preview-104", authorName: "Amina", authorCity: null, authorCountryCode: null, textBody: "Weekend plans, simply shared.", audience: "public", customAudienceUserIds: [], createdAt: new Date(), publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000), deletedAt: null, isMemory: false, storefrontId: null, storefrontSlug: null, storefrontName: null, productName: null, productDescription: null, productPriceMinor: null, productCurrencyCode: null, discovery: { slot: "for_you", label: "For you", reason: "A nearby public update", score: 55 }, media: [], primaryMediaUrl: null, primaryMediaType: null },
  ] : [];
  const ownStoryInitial = (user?.name?.trim().slice(0, 1) || "S").toUpperCase();
  const ownStoryAvatarUrl = user?.photoURL ?? null;
  const storySource = (followingStories.length ? followingStories : previewStories) as StoryItem[];
  const groupedStories = useMemo(() => {
    const groups = new Map<string, { authorUserId: string; authorName: string; items: StoryItem[] }>();
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
    if (user && story && isFirebaseStoryId(story.id)) view.mutate({ storyId: story.id, user });
  };
  const moveStory = (direction: -1 | 1) => {
    if (!activeGroup) return;
    const nextIndex = Math.max(0, Math.min(activeGroup.items.length - 1, activeStoryIndex + direction));
    if (nextIndex === activeStoryIndex) return;
    setActiveStoryIndex(nextIndex);
    if (user && isFirebaseStoryId(activeGroup.items[nextIndex].id)) view.mutate({ storyId: activeGroup.items[nextIndex].id, user });
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

  const collapsedStoriesCluster = compact ? (
    <div aria-label="Collapsed Stories cluster" className="savanna-collapsed-story-cluster flex shrink-0 items-center">
      {stories.isLoading ? <div className="savanna-brand-token grid size-8 shrink-0 place-items-center rounded-full"><Loader2 className="size-3 animate-spin" /></div> : groupedStories.slice(0, 3).map((group, groupIndex) => <button key={group.authorUserId} onClick={() => openGroup(groupIndex)} aria-label={`Open ${group.authorName}'s Stories`} className={`savanna-brand-token grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-semibold transition-transform hover:scale-105 focus-visible:z-20 ${groupIndex ? "-ml-1.5" : ""}`} style={{ zIndex: groupIndex + 1 }}>{group.authorName.slice(0, 1).toUpperCase()}</button>)}
    </div>
  ) : null;

  return <>
    <header className="savanna-mobile-header savanna-glass-header fixed inset-x-0 top-0 z-40 bg-[#f7f6f1]/92 backdrop-blur-xl dark:bg-[#0A1014]/95 lg:hidden">
      <div className="flex h-[68px] items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-0">
          {collapsedStoriesCluster}
          <Link href="/" aria-label="Savanna messages" className="flex shrink-0 items-center whitespace-nowrap text-[26px] leading-none"><span className="savanna-wordmark">Savanna</span></Link>
        </div>
        <Link href={isAuthenticated ? "/profile" : "/login"} aria-label="Open profile" className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full text-[#151A17] dark:text-[#E9EDEF]">
          {ownStoryAvatarUrl ? <img src={ownStoryAvatarUrl} alt="" className="size-8 rounded-full object-cover" /> : <UserIcon size={22} />}
        </Link>
      </div>
      <section
        aria-label="Stories"
        className={`savanna-glass-stories-row overflow-hidden bg-[#f7f6f1]/92 px-4 backdrop-blur-xl transition-[height,background-color] duration-300 ease-out dark:bg-[#0A1014]/95 ${compact ? "hidden" : "block"}`}
        style={{ height: expandedHeight }}
        onPointerDown={event => { if (window.scrollY === 0) setStartY(event.clientY); }}
        onPointerMove={event => { if (startY !== null && window.scrollY === 0) setPull(Math.max(0, Math.min(36, event.clientY - startY))); }}
        onPointerUp={() => { setStartY(null); setPull(0); }}
        onPointerCancel={() => { setStartY(null); setPull(0); }}
      >
        <div className="flex h-full flex-col justify-start gap-0 pt-0">
          <div className="story-rail flex min-w-0 w-full flex-none items-center gap-3 overflow-x-auto py-0">
            <div className="flex shrink-0 flex-col items-center gap-1">
              <button onClick={() => isAuthenticated ? setComposing(true) : toast.error("Sign in to share a Story")} aria-label="Add to your Story" className="savanna-brand-token relative grid size-14 shrink-0 place-items-center overflow-visible rounded-full p-0.5 transition-transform active:scale-95">{ownStoryAvatarUrl ? <img src={ownStoryAvatarUrl} alt="" className="size-full rounded-full object-cover" /> : <span className="grid size-full place-items-center rounded-full text-xs font-semibold">{ownStoryInitial}</span>}<span aria-hidden="true" className="savanna-brand-token absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full"><AnimatedPlusIcon size={12} /></span></button>
              <span className="whitespace-nowrap text-[10px] font-medium text-[#5f6861] dark:text-[#9AA1A6]">Your Story</span>
            </div>
            {stories.isLoading ? <div className="savanna-brand-token grid size-14 shrink-0 place-items-center rounded-full"><Loader2 className="size-3.5 animate-spin" /></div> : groupedStories.slice(0, 8).map((group, groupIndex) => {
              return <div key={group.authorUserId} className="flex shrink-0 flex-col items-center gap-1"><button onClick={() => openGroup(groupIndex)} aria-label={`Open ${group.authorName}'s Stories`} className="savanna-brand-token grid size-14 shrink-0 place-items-center rounded-full text-xs font-semibold transition-all duration-300">{group.authorName.slice(0, 1).toUpperCase()}</button><span className="max-w-16 truncate text-center text-[10px] font-medium text-[#5f6861] dark:text-[#9AA1A6]">{group.authorName.split(" ")[0]}</span></div>;
            })}
          </div>
        </div>
      </section>
    </header>
    <div aria-hidden="true" className="savanna-mobile-header-spacer lg:hidden" style={{ height: compact ? 68 : 68 + expandedHeight }} />
    {composing ? <div role="dialog" aria-modal="true" aria-label="Create Story" className="fixed inset-0 z-[80] grid items-end bg-black/45 p-4"><div className="rounded-3xl bg-white p-5 shadow-2xl dark:bg-[#2a2119]"><div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl font-semibold text-[#3d2d1a] dark:text-[#fff8ed]">Share a Story</h2><Button type="button" variant="ghost" size="icon" onClick={() => setComposing(false)} aria-label="Close Story composer"><X className="size-5" /></Button></div><StoryComposer compact onDone={() => { setComposing(false); }} /></div></div> : null}
    {activeStory && activeGroup ? <StoryViewer story={activeStory} onClose={() => setActiveGroupIndex(null)} onMove={moveStory} index={activeStoryIndex} total={activeGroup.items.length} /> : null}
  </>;
}
