import { useAuth } from "@/_core/hooks/useAuth";
import { AnimatedPlusIcon, AnimatedSendIcon, MobileNavIcon } from "@/components/AnimatedNavIcons";
import { SavannaShell } from "@/components/SavannaShell";
import { StoryComposer } from "@/components/StoriesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useFirebaseCommunityDetail,
  useFirebaseCommunityMessages,
  useFirebaseCommunityMutations,
  useFirebaseCommunityPosts,
  type FirebaseCommunityPostKind,
} from "@/lib/firebaseCommunities";
import { useMyFirebaseStorefront } from "@/lib/firebaseShops";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Loader2, Lock, Megaphone, MessageSquare, PackageSearch, Share2, ShoppingBag, Store, X } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";

type CommunityTab = "chat" | "posts" | "shops";

const tabs: Array<{ value: CommunityTab; label: string }> = [
  { value: "chat", label: "Chat" },
  { value: "posts", label: "Posts" },
  { value: "shops", label: "Shops" },
];

const postKinds: Array<{ value: FirebaseCommunityPostKind; label: string }> = [
  { value: "post", label: "Post" },
  { value: "question", label: "Question" },
  { value: "listing", label: "Listing" },
  { value: "announcement", label: "Announcement" },
];

function formatTime(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function formatPrice(minor?: number | null, currency?: string | null) {
  if (!minor || !currency) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export default function CommunityDetailPage() {
  const { user, isAuthenticated } = useAuth();
  const [, params] = useRoute("/communities/:communityId");
  const [, navigate] = useLocation();
  const communityId = params?.communityId ?? "";
  const [activeTab, setActiveTab] = useState<CommunityTab>("chat");
  const [chatBody, setChatBody] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postKind, setPostKind] = useState<FirebaseCommunityPostKind>("post");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const detail = useFirebaseCommunityDetail(communityId, user);
  const isMember = Boolean(detail.data?.member);
  const isOwner = detail.data?.member?.role === "owner";
  const posts = useFirebaseCommunityPosts(communityId, Boolean(detail.data?.community.visibility === "public" || isMember));
  const messages = useFirebaseCommunityMessages(communityId, isMember);
  const myStorefront = useMyFirebaseStorefront(user);
  const communityMutations = useFirebaseCommunityMutations(user);
  const community = detail.data?.community ?? null;
  const memberLabel = useMemo(() => {
    if (!community) return "";
    return `${community.memberCount} ${community.memberCount === 1 ? "member" : "members"}`;
  }, [community]);
  const shopProducts = myStorefront.data?.products.filter(product => product.status === "active") ?? [];
  const selectedProduct = shopProducts.find(product => product.id === selectedProductId) ?? null;

  const buildInviteLink = (code: string) => `${window.location.origin}/communities?invite=${encodeURIComponent(code)}`;

  const shareInvite = async () => {
    if (!community?.inviteCode) return;
    const shareApi = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    const canShare = typeof shareApi.share === "function";
    const url = buildInviteLink(community.inviteCode);
    try {
      if (canShare) await shareApi.share!({ title: community.name, text: "Join this Savanna community.", url });
      else await navigator.clipboard.writeText(url);
      toast.success(canShare ? "Invite ready to share" : "Invite link copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this invite link.");
    }
  };

  const joinCommunity = () => {
    if (!community) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    communityMutations.join.mutate(community.id, {
      onSuccess: () => toast.success("Joined community"),
      onError: error => toast.error(error.message),
    });
  };

  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!community) return;
    communityMutations.sendMessage.mutate(
      { communityId: community.id, body: chatBody },
      {
        onSuccess: () => setChatBody(""),
        onError: error => toast.error(error.message),
      },
    );
  };

  const submitPost = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!community) return;
    communityMutations.createPost.mutate(
      { communityId: community.id, title: postTitle, body: postBody, kind: postKind, product: selectedProduct },
      {
        onSuccess: () => {
          setPostTitle("");
          setPostBody("");
          setPostKind("post");
          setSelectedProductId("");
          toast.success("Published");
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  const linkMyShop = () => {
    const storefrontId = myStorefront.data?.storefront.id;
    if (!community || !storefrontId) return;
    communityMutations.linkStorefront.mutate(
      { communityId: community.id, storefrontId },
      {
        onSuccess: () => toast.success("Shop linked"),
        onError: error => toast.error(error.message),
      },
    );
  };

  if (detail.isLoading) {
    return (
      <SavannaShell>
        <div className="grid min-h-[55vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-[#D9A441]" />
        </div>
      </SavannaShell>
    );
  }

  if (!community) {
    return (
      <SavannaShell>
        <div className="grid min-h-[55vh] place-items-center px-4 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[#D9A441]/20 text-[#D9A441]"><Lock className="size-6" /></span>
            <h1 className="mt-5 font-display text-3xl text-[#151A17] dark:text-[#E9EDEF]">Community unavailable.</h1>
            <Link href="/communities"><Button className="savanna-brand-token mt-5 rounded-full px-5 shadow-none">Back to communities</Button></Link>
          </div>
        </div>
      </SavannaShell>
    );
  }

  return (
    <SavannaShell>
      <div className="savanna-community-detail space-y-5">
        <header className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/communities" className="grid size-11 place-items-center rounded-full bg-white text-[#151A17] shadow-[0_8px_18px_rgba(94,58,11,0.04)] dark:bg-[#111B21] dark:text-[#E9EDEF]" aria-label="Back to communities">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="flex items-center gap-2">
              {community.inviteCode && isOwner ? (
                <Button type="button" onClick={shareInvite} variant="ghost" size="icon" className="size-11 rounded-full bg-[#D9A441]/10 text-[#D9A441] hover:bg-[#D9A441]/20" aria-label="Share community invite">
                  <Share2 className="size-5" />
                </Button>
              ) : null}
              {!isMember ? (
                <Button type="button" onClick={joinCommunity} disabled={community.visibility === "private" || communityMutations.join.isPending} className="savanna-brand-token h-11 rounded-full px-5 shadow-none">
                  {communityMutations.join.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <AnimatedPlusIcon className="mr-2 size-4" />}
                  Join
                </Button>
              ) : null}
            </div>
          </div>

          <section className="rounded-[28px] border border-[#DDE3DC] bg-white p-5 shadow-[0_10px_24px_rgba(94,58,11,0.035)] dark:border-[#26343A] dark:bg-[#111B21]">
            <div className="flex items-start gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-[20px] bg-[#D9A441]/20 text-[#D9A441]">
                <MobileNavIcon name="Communities" active size={28} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#D9A441]/20 px-3 py-1 text-xs font-semibold text-[#D9A441]">{community.visibility}</span>
                  {community.city ? <span className="rounded-full bg-[#D9A441]/10 px-3 py-1 text-xs font-semibold text-[#9a6410] dark:text-[#D9A441]">{community.city}</span> : null}
                </div>
                <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-[#151A17] dark:text-[#E9EDEF]">{community.name}</h1>
                <p className="mt-2 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">{community.description || "A Savanna community for conversation, discovery, shops, and shared context."}</p>
                <p className="mt-3 text-xs font-semibold text-[#D9A441]">{memberLabel}{isMember ? " · You are in" : ""}</p>
              </div>
            </div>
          </section>
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Community sections">
          {tabs.map(tab => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              data-active={activeTab === tab.value}
              className={cn(
                "h-10 shrink-0 rounded-full px-5 text-sm font-semibold transition-colors",
                activeTab === tab.value
                  ? "bg-[#D9A441]/20 text-[#D9A441]"
                  : "bg-white text-[#5F6861] dark:bg-[#111B21] dark:text-[#AEBAC1]",
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "chat" ? (
          <section className="space-y-4">
            {!isMember ? (
              <div className="rounded-[28px] border border-[#DDE3DC] bg-white p-6 text-center dark:border-[#26343A] dark:bg-[#111B21]">
                <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[#D9A441]/20 text-[#D9A441]"><MessageSquare className="size-6" /></span>
                <h2 className="mt-4 font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">Join to chat.</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">Members can speak in the live room.</p>
              </div>
            ) : (
              <>
                <div className="min-h-72 space-y-3 rounded-[28px] border border-[#DDE3DC] bg-white p-4 dark:border-[#26343A] dark:bg-[#111B21]">
                  {messages.isLoading ? (
                    <div className="grid min-h-56 place-items-center"><Loader2 className="size-5 animate-spin text-[#D9A441]" /></div>
                  ) : messages.data?.length ? messages.data.map(message => {
                    const mine = message.authorUserId === user?.id;
                    return (
                      <article key={message.id} className={cn("flex gap-3", mine && "justify-end")}>
                        {!mine ? (
                          <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D9A441]/20 text-xs font-semibold text-[#D9A441]">
                            {message.authorPhotoURL ? <img src={message.authorPhotoURL} alt="" className="size-full rounded-full object-cover" /> : message.authorName.slice(0, 1).toUpperCase()}
                          </span>
                        ) : null}
                        <div className={cn("max-w-[78%] rounded-[22px] px-4 py-3", mine ? "bg-[#D9A441]/20 text-[#3d2d1a] dark:text-[#F8E8C4]" : "bg-[#F6F5F5] text-[#151A17] dark:bg-[#202C33] dark:text-[#E9EDEF]")}>
                          <p className="text-xs font-semibold text-[#D9A441]">{mine ? "You" : message.authorName}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                          <p className="mt-2 text-right text-[11px] opacity-65">{formatTime(message.createdAt)}</p>
                        </div>
                      </article>
                    );
                  }) : (
                    <div className="grid min-h-56 place-items-center text-center">
                      <div>
                        <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[#D9A441]/20 text-[#D9A441]"><MessageSquare className="size-6" /></span>
                        <h2 className="mt-4 font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">Start the room.</h2>
                      </div>
                    </div>
                  )}
                </div>
                <form onSubmit={submitMessage} className="flex items-center gap-2 rounded-full border border-[#DDE3DC] bg-white p-2 dark:border-[#26343A] dark:bg-[#111B21]">
                  <Input value={chatBody} onChange={event => setChatBody(event.target.value)} placeholder="Message this community" className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" />
                  <Button type="submit" disabled={communityMutations.sendMessage.isPending} size="icon" className="savanna-brand-token shrink-0 rounded-full shadow-none">
                    {communityMutations.sendMessage.isPending ? <Loader2 className="size-4 animate-spin" /> : <AnimatedSendIcon size={18} />}
                  </Button>
                </form>
              </>
            )}
          </section>
        ) : null}

        {activeTab === "posts" ? (
          <section className="space-y-4">
            {isMember ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-[24px] border border-[#DDE3DC] bg-white p-4 dark:border-[#26343A] dark:bg-[#111B21]">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">Share a community Story</p>
                    <p className="mt-1 text-xs text-[#5F6861] dark:text-[#AEBAC1]">Video, image, or text that appears in the Stories Community tab.</p>
                  </div>
                  <Button type="button" onClick={() => setStoryComposerOpen(true)} className="savanna-brand-token shrink-0 rounded-full px-4 shadow-none">
                    <AnimatedPlusIcon className="mr-2 size-4" /> Story
                  </Button>
                </div>
                <form onSubmit={submitPost} className="space-y-3 rounded-[28px] border border-[#DDE3DC] bg-white p-4 dark:border-[#26343A] dark:bg-[#111B21]">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {postKinds.map(kind => (
                      <button key={kind.value} type="button" onClick={() => setPostKind(kind.value)} className={cn("h-9 shrink-0 rounded-full px-3 text-xs font-semibold", postKind === kind.value ? "bg-[#D9A441]/20 text-[#D9A441]" : "bg-[#F6F5F5] text-[#5F6861] dark:bg-[#202C33] dark:text-[#AEBAC1]")}>{kind.label}</button>
                    ))}
                  </div>
                  {shopProducts.length ? (
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold text-[#5F6861] dark:text-[#AEBAC1]">Attach a product</span>
                      <select
                        value={selectedProductId}
                        onChange={event => {
                          setSelectedProductId(event.target.value);
                          if (event.target.value) setPostKind("listing");
                        }}
                        className="savanna-new-chat-input h-11 w-full rounded-2xl border border-[#DDE3DC] bg-[#F6F5F5] px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]/25 dark:border-[#26343A] dark:bg-[#202C33]"
                      >
                        <option value="">No product attached</option>
                        {shopProducts.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {selectedProduct ? (
                    <Link href={`/shops/${selectedProduct.storefrontSlug}/products/${selectedProduct.id}`} className="flex items-center gap-3 rounded-2xl bg-[#D9A441]/10 p-3">
                      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                        {selectedProduct.primaryImageUrl ? <img src={selectedProduct.primaryImageUrl} alt="" className="size-full object-cover" /> : <ShoppingBag className="size-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{selectedProduct.title}</span>
                        <span className="block truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">{formatPrice(selectedProduct.priceMinor, selectedProduct.currencyCode)} · {selectedProduct.storefrontName}</span>
                      </span>
                    </Link>
                  ) : null}
                  <Input value={postTitle} onChange={event => setPostTitle(event.target.value)} placeholder="Title" className="savanna-new-chat-input bg-[#F6F5F5] dark:bg-[#202C33]" />
                  <textarea value={postBody} onChange={event => setPostBody(event.target.value)} placeholder="Share something useful" className="savanna-new-chat-input min-h-24 w-full resize-none rounded-2xl border border-[#DDE3DC] bg-[#F6F5F5] px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#D9A441]/25 dark:border-[#26343A] dark:bg-[#202C33]" />
                  <Button type="submit" disabled={communityMutations.createPost.isPending} className="savanna-brand-token rounded-full px-5 shadow-none">
                    {communityMutations.createPost.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Megaphone className="mr-2 size-4" />}
                    Publish
                  </Button>
                </form>
              </>
            ) : null}
            <div className="space-y-3">
              {posts.isLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="size-5 animate-spin text-[#D9A441]" /></div> : posts.data?.length ? posts.data.map(post => (
                <article key={post.id} className="rounded-[24px] border border-[#DDE3DC] bg-white p-4 dark:border-[#26343A] dark:bg-[#111B21]">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D9A441]/20 text-xs font-semibold text-[#D9A441]">
                      {post.authorPhotoURL ? <img src={post.authorPhotoURL} alt="" className="size-full rounded-full object-cover" /> : post.authorName.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{post.authorName}</p>
                        <span className="rounded-full bg-[#D9A441]/20 px-2 py-0.5 text-[11px] font-semibold text-[#D9A441]">{post.kind}</span>
                        <span className="text-[11px] text-[#5F6861] dark:text-[#AEBAC1]">{formatDate(post.createdAt)}</span>
                      </div>
                      {post.title ? <h2 className="mt-3 text-lg font-semibold text-[#151A17] dark:text-[#E9EDEF]">{post.title}</h2> : null}
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">{post.body}</p>
                      {post.productId && post.storefrontSlug ? (
                        <Link href={`/shops/${post.storefrontSlug}/products/${post.productId}`} className="mt-3 flex items-center gap-3 rounded-2xl bg-[#D9A441]/10 p-3">
                          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                            {post.productPrimaryImageUrl ? <img src={post.productPrimaryImageUrl} alt="" className="size-full object-cover" /> : <ShoppingBag className="size-5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{post.productName}</span>
                            <span className="block truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">{formatPrice(post.productPriceMinor, post.productCurrencyCode)} · {post.storefrontName}</span>
                          </span>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              )) : (
                <div className="rounded-[28px] border border-[#DDE3DC] bg-white p-6 text-center dark:border-[#26343A] dark:bg-[#111B21]">
                  <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[#D9A441]/20 text-[#D9A441]"><Megaphone className="size-6" /></span>
                  <h2 className="mt-4 font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">No posts yet.</h2>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "shops" ? (
          <section className="space-y-4">
            {isOwner && myStorefront.data?.storefront ? (
              <div className="flex items-center justify-between gap-3 rounded-[24px] border border-[#DDE3DC] bg-white p-4 dark:border-[#26343A] dark:bg-[#111B21]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{myStorefront.data.storefront.name}</p>
                  <p className="mt-1 text-xs text-[#5F6861] dark:text-[#AEBAC1]">Connect your storefront to this community.</p>
                </div>
                <Button type="button" onClick={linkMyShop} disabled={community.linkedStorefrontIds.includes(myStorefront.data.storefront.id) || communityMutations.linkStorefront.isPending} className="savanna-brand-token shrink-0 rounded-full px-4 shadow-none">
                  {community.linkedStorefrontIds.includes(myStorefront.data.storefront.id) ? "Linked" : "Link"}
                </Button>
              </div>
            ) : null}
            {detail.data?.shops.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {detail.data.shops.map(shop => (
                  <Link key={shop.id} href={`/shops/${shop.slug}`} className="group overflow-hidden rounded-[24px] border border-[#DDE3DC] bg-white dark:border-[#26343A] dark:bg-[#111B21]">
                    {shop.coverUrl ? <img src={shop.coverUrl} alt="" className="h-28 w-full object-cover" /> : <div className="grid h-28 place-items-center bg-[#D9A441]/20 text-[#D9A441]"><Store className="size-6" /></div>}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{shop.name}</h2>
                          <p className="mt-1 text-xs text-[#5F6861] dark:text-[#AEBAC1]">{shop.category || "Savanna storefront"}</p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-[#D9A441] transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">{shop.bio || "A local storefront connected to this community."}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-[28px] border border-[#DDE3DC] bg-white p-6 text-center dark:border-[#26343A] dark:bg-[#111B21]">
                <span className="mx-auto grid size-14 place-items-center rounded-[20px] bg-[#D9A441]/20 text-[#D9A441]"><PackageSearch className="size-6" /></span>
                <h2 className="mt-4 font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">No shops linked yet.</h2>
              </div>
            )}
          </section>
        ) : null}

        {storyComposerOpen ? (
          <div role="dialog" aria-modal="true" aria-label="Create community Story" className="fixed inset-0 z-[90] grid items-end bg-black/55 p-4">
            <div className="mx-auto w-full max-w-xl rounded-[28px] bg-white p-5 text-[#151A17] shadow-2xl dark:bg-[#111B21] dark:text-[#E9EDEF]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-semibold">Community Story</h2>
                  <p className="mt-1 truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">{community.name}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setStoryComposerOpen(false)} className="rounded-full" aria-label="Close community Story composer"><X className="size-5" /></Button>
              </div>
              <StoryComposer compact communityMode communityId={community.id} communityName={community.name} onDone={() => setStoryComposerOpen(false)} />
            </div>
          </div>
        ) : null}
      </div>
    </SavannaShell>
  );
}
