import { useAuth } from "@/_core/hooks/useAuth";
import { MobileNavIcon } from "@/components/AnimatedNavIcons";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { useFirebaseChatMutations } from "@/lib/firebaseChat";
import { listFirebaseStoriesForAuthor, type FirebaseStory } from "@/lib/firebaseStories";
import { getPublicFirebaseStorefrontForOwner } from "@/lib/firebaseShops";
import { followUser, getUserProfile, isFollowingUser, unfollowUser } from "@/lib/userProfile";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Heart,
  Image as ImageIcon,
  Loader2,
  MoreVertical,
  Play,
  Store,
  UserCheck,
  UserPlus,
  UserRound,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Link, useLocation, useRoute } from "wouter";

function formatStoryTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Story";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function storyLabel(story: FirebaseStory, index: number) {
  if (story.productName) return story.productName;
  if (story.textBody) return story.textBody;
  return story.isMemory ? `Memory ${index + 1}` : `Story ${index + 1}`;
}

function StoryTile({ story, index, initial }: { story: FirebaseStory; index: number; initial: string }) {
  const media = story.media?.[0];
  const isVideo = media?.type === "video";

  return (
    <article className="savanna-public-profile-tile group relative aspect-[3/4] overflow-hidden rounded-[8px] bg-[#D9A441]/20">
      {media?.url && media.type === "image" ? <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : null}
      {media?.url && isVideo ? <video src={media.url} className="absolute inset-0 h-full w-full object-cover" muted playsInline preload="metadata" /> : null}
      {!media?.url ? (
        <div className="absolute inset-0 grid place-items-center bg-[#D9A441]/20 text-[#D9A441]">
          <span className="font-display text-4xl font-semibold">{initial}</span>
        </div>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
        {isVideo ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
        {story.isMemory ? "Memory" : "Story"}
      </div>
      <div className="absolute bottom-2 left-2 right-2">
        <p className="line-clamp-2 text-xs font-semibold leading-4 text-white">{storyLabel(story, index)}</p>
        <p className="mt-1 text-[10px] font-medium text-white/75">{formatStoryTime(story.publishedAt)}</p>
      </div>
    </article>
  );
}

export default function PublicProfilePage() {
  const [, params] = useRoute("/people/:userId");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const chatMutations = useFirebaseChatMutations(user);
  const userId = params?.userId ?? "";
  const profileQueryKey = ["firebase", "public-profile", userId, user?.id ?? "guest"];
  const followQueryKey = ["firebase", "profile-follow", user?.id ?? "guest", userId];

  const profile = useQuery({
    queryKey: profileQueryKey,
    enabled: Boolean(userId),
    queryFn: async () => {
      const [profile, stories, business] = await Promise.all([
        getUserProfile(userId),
        listFirebaseStoriesForAuthor(userId, user),
        getPublicFirebaseStorefrontForOwner(userId, user),
      ]);
      if (!profile) return null;
      return { profile, stories, business };
    },
    retry: false,
  });

  const followState = useQuery({
    queryKey: followQueryKey,
    queryFn: () => isFollowingUser(user?.id, userId),
    enabled: Boolean(user && userId && user.id !== userId),
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        startLogin();
        return;
      }
      if (user.id === userId) return;
      if (followState.data) await unfollowUser(user, userId);
      else await followUser(user, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: followQueryKey });
      queryClient.invalidateQueries({ queryKey: ["firebase", "stories"] });
    },
    onError: error => toast.error(error instanceof Error ? error.message : "Follow could not be updated"),
  });

  if (profile.isLoading) {
    return (
      <SavannaShell hideMobileHeader hideDesktopHeader>
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-[#D9A441]" />
        </div>
      </SavannaShell>
    );
  }

  if (!profile.data) {
    return (
      <SavannaShell hideMobileHeader hideDesktopHeader>
        <section className="savanna-public-profile-page grid min-h-[60vh] place-items-center rounded-[30px] border border-dashed border-[#eadfca] bg-white p-8 text-center dark:border-[#26343A] dark:bg-[#111B21]">
          <div>
            <UserRound className="mx-auto size-8 text-[#D9A441]" />
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17] dark:text-[#E9EDEF]">This profile is unavailable.</h1>
            <Link href="/messages" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#D9A441]">
              <ArrowLeft className="size-4" /> Back to Savanna
            </Link>
          </div>
        </section>
      </SavannaShell>
    );
  }

  const item = profile.data.profile;
  const storyGridItems = profile.data.stories.filter(story => !story.storefrontId);
  const displayName = item.name || "Savanna user";
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const initial = displayName.slice(0, 1).toUpperCase();
  const isOwnProfile = Boolean(user && user.id === item.id);
  const isFollowing = Boolean(followState.data);

  const startMessage = () => {
    if (!user) {
      startLogin();
      return;
    }
    if (isOwnProfile) return;
    chatMutations.create.mutate(
      {
        kind: "direct",
        title: displayName,
        memberIds: [item.id],
      },
      {
        onSuccess: conversationId => {
          sessionStorage.setItem("savanna-open-conversation", conversationId);
          sessionStorage.setItem("savanna-open-conversation-meta", JSON.stringify({
            id: conversationId,
            kind: "direct",
            title: displayName,
            peerUserId: item.id,
          }));
          navigate("/messages");
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  return (
    <SavannaShell hideMobileHeader hideDesktopHeader>
      <div className="savanna-public-profile-page mx-auto max-w-[720px] pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="savanna-public-profile-topbar savanna-glass-header sticky z-30 flex h-12 items-center justify-between rounded-[24px] border border-[#eadfca]/70 px-3 backdrop-blur-xl">
          <button type="button" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/messages")} className="grid size-9 place-items-center rounded-full text-[#151A17] dark:text-[#E9EDEF]" aria-label="Go back">
            <ArrowLeft className="size-5" />
          </button>
          <p className="min-w-0 truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{firstName}</p>
          <button type="button" className="grid size-9 place-items-center rounded-full text-[#151A17] dark:text-[#E9EDEF]" aria-label="Profile actions">
            <MoreVertical className="size-5" />
          </button>
        </header>

        <section className="savanna-public-profile-identity pt-7">
          <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-4">
            <span className="grid size-[92px] place-items-center overflow-hidden rounded-full bg-[#D9A441]/20 font-display text-4xl font-semibold text-[#D9A441]">
              {item.photoURL ? <img src={item.photoURL} alt="" className="size-full object-cover" /> : initial}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[30px] font-semibold leading-tight text-[#151A17] sm:text-[34px] dark:text-[#E9EDEF]">{displayName}</h1>
              {item.username ? <p className="mt-1 truncate text-base font-semibold text-[#5F6861] dark:text-[#AEBAC1]">@{item.username}</p> : null}
              {item.city || item.countryCode ? (
                <p className="mt-1 truncate text-xs font-semibold text-[#8A938D] dark:text-[#8F9AA0]">
                  {[item.city, item.countryCode].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </div>
          </div>

          {item.bio ? <p className="mt-5 text-[15px] leading-7 text-[#5F6861] dark:text-[#AEBAC1]">{item.bio}</p> : null}

          {profile.data.business ? (
            <Link href={`/shops/${profile.data.business.slug}`} className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-[#D9A441]/20 px-4 py-2 text-sm font-semibold text-[#D9A441]">
              <Store className="size-4 shrink-0" />
              <span className="truncate">{profile.data.business.name}</span>
            </Link>
          ) : null}

          <div className={cn("mt-5 grid gap-2", isOwnProfile ? "grid-cols-1" : "grid-cols-[1fr_1fr]")}>
            <Button
              type="button"
              disabled={followMutation.isPending || isOwnProfile}
              onClick={() => followMutation.mutate()}
              className={cn(
                "h-12 rounded-xl shadow-none",
                isFollowing ? "bg-[#D9A441]/20 text-[#D9A441] hover:bg-[#D9A441]/25" : "savanna-brand-token",
              )}
            >
              {followMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : isFollowing ? <UserCheck className="mr-2 size-4" /> : <UserPlus className="mr-2 size-4" />}
              {isOwnProfile ? "Your profile" : isFollowing ? "Following" : "Follow"}
            </Button>
            {!isOwnProfile ? (
              <Button type="button" onClick={startMessage} disabled={chatMutations.create.isPending} className="h-12 rounded-xl bg-[#D9A441]/20 text-[#D9A441] shadow-none hover:bg-[#D9A441]/25">
                {chatMutations.create.isPending ? <Loader2 className="size-4 animate-spin" /> : <MobileNavIcon name="Messages" active size={21} />}
                <span className="ml-2">Message</span>
              </Button>
            ) : null}
          </div>
        </section>

        <section className="savanna-public-profile-stories mt-7">
          <div className="savanna-public-profile-tabs grid grid-cols-2 border-b border-[#DDE3DC] dark:border-[#26343A]">
            <button type="button" className="inline-flex h-12 items-center justify-center gap-2 border-b-2 border-[#D9A441] text-sm font-semibold text-[#D9A441]">
              <ImageIcon className="size-4" /> Stories
            </button>
            <button type="button" className="inline-flex h-12 items-center justify-center gap-2 text-sm font-semibold text-[#8A938D] dark:text-[#AEBAC1]">
              <Heart className="size-4" /> Memories
            </button>
          </div>

          {storyGridItems.length ? (
            <div className="savanna-public-profile-grid grid grid-cols-3 gap-1 pt-1">
              {storyGridItems.map((story, index) => <StoryTile key={story.id} story={story} index={index} initial={initial} />)}
            </div>
          ) : (
            <div className="savanna-public-profile-empty grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                  <Play className="size-7" />
                </span>
                <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17] dark:text-[#E9EDEF]">No public stories yet.</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">When {firstName} shares public stories or memories, they will live here.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </SavannaShell>
  );
}
