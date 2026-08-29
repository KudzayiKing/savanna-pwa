import { SafetyActions } from "@/components/SafetyActions";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { listFirebaseStoriesForAuthor } from "@/lib/firebaseStories";
import { getPublicFirebaseStorefrontForOwner } from "@/lib/firebaseShops";
import { getUserProfile } from "@/lib/userProfile";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Play,
  Store,
  UserRound,
  Video,
} from "lucide-react";
import { Link, useRoute } from "wouter";

function formatStoryTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Story";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function PublicProfilePage() {
  const [, params] = useRoute("/people/:userId");
  const { user } = useAuth();
  const userId = params?.userId ?? "";
  const profile = useQuery({
    queryKey: ["firebase", "public-profile", userId, user?.id ?? "guest"],
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

  if (profile.isLoading) {
    return (
      <SavannaShell>
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-[#D9A441]" />
        </div>
      </SavannaShell>
    );
  }

  if (!profile.data) {
    return (
      <SavannaShell>
        <section className="grid min-h-[60vh] place-items-center rounded-[30px] border border-dashed border-[#eadfca] bg-white text-center">
          <div>
            <UserRound className="mx-auto size-8 text-[#D9A441]" />
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17]">This profile is unavailable.</h1>
            <Link href="/home" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#9a6410]">
              <ArrowLeft className="size-4" /> Back to Savanna
            </Link>
          </div>
        </section>
      </SavannaShell>
    );
  }

  const item = profile.data.profile;
  const stories = profile.data.stories.filter(story => !story.isMemory && !story.storefrontId);
  const memories = profile.data.stories.filter(story => story.isMemory && !story.storefrontId);
  const displayName = item.name || "Savanna user";
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <SavannaShell>
      <div className="mx-auto max-w-[940px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/home" className="inline-flex items-center gap-1 text-sm font-semibold text-[#9a6410]">
            <ArrowLeft className="size-4" /> Back to Savanna
          </Link>
          <div className="inline-flex rounded-full border border-[#eadfca] bg-white p-1">
            <span className="inline-flex h-10 items-center gap-2 rounded-full bg-[#D9A441]/20 px-4 text-sm font-semibold text-[#D9A441]">
              <UserRound className="size-4" /> User
            </span>
            {profile.data.business ? (
              <Link
                href={`/shops/${profile.data.business.slug}`}
                className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[#5f6861] hover:bg-[#D9A441]/10 hover:text-[#9a6410]"
              >
                <BriefcaseBusiness className="size-4" /> Business
              </Link>
            ) : null}
          </div>
        </div>

        <section className="overflow-hidden rounded-[30px] border border-[#eadfca] bg-white shadow-[0_14px_34px_rgba(94,58,11,0.04)]">
          <div className="h-32 bg-[#D9A441]/20" />
          <div className="px-5 pb-6 sm:px-7">
            <div className="-mt-12 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="flex items-end gap-4">
                <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[30px] border-4 border-white bg-[#f8edcf] font-display text-4xl font-semibold text-[#D9A441]">
                      {item.photoURL ? <img src={item.photoURL} alt="" className="h-full w-full object-cover" /> : initial}
                </span>
                <div className="pb-1">
                  <h1 className="font-display text-4xl font-semibold tracking-[-0.055em] text-[#151A17]">{displayName}</h1>
                  {item.city || item.countryCode ? (
                    <p className="mt-2 flex items-center gap-2 text-sm text-[#5f6861]">
                      <MapPin className="size-4 text-[#D9A441]" />
                      {[item.city, item.countryCode].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>
              <SafetyActions targetDomain="profile" targetId={item.id} targetLabel={displayName} blockUserId={item.id} />
            </div>
            {item.bio ? <p className="mt-6 max-w-2xl text-sm leading-7 text-[#5f6861]">{item.bio}</p> : null}
          </div>
        </section>

        {profile.data.business ? (
          <Link
            href={`/shops/${profile.data.business.slug}`}
            className="group flex flex-col gap-4 rounded-[28px] border border-[#eadfca] bg-white p-5 shadow-[0_12px_28px_rgba(94,58,11,0.035)] sm:flex-row sm:items-center"
          >
            {profile.data.business.coverUrl ? (
              <img src={profile.data.business.coverUrl} alt="" className="h-24 w-full rounded-[22px] object-cover sm:w-40" />
            ) : (
              <span className="grid h-24 w-full place-items-center rounded-[22px] bg-[#D9A441]/20 text-[#D9A441] sm:w-40">
                <Store className="size-7" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Business Page</span>
              <span className="mt-1 block font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">{profile.data.business.name}</span>
              <span className="mt-1 block text-sm text-[#5f6861]">{profile.data.business.category || "Savanna storefront"}</span>
            </span>
            <ArrowRight className="size-5 text-[#D9A441] transition-transform group-hover:translate-x-1" />
          </Link>
        ) : null}

        <section className="rounded-[30px] border border-[#eadfca] bg-white p-5 shadow-[0_12px_28px_rgba(94,58,11,0.035)] sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">User Stories</p>
              <h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17]">{displayName.split(/\s+/)[0]}'s story room</h2>
            </div>
            <span className="hidden rounded-full bg-[#D9A441]/20 px-3 py-1 text-xs font-semibold text-[#D9A441] sm:inline-flex">
              {stories.length} active
            </span>
          </div>

          {stories.length ? (
            <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
              {stories.map((story, index) => (
                <article
                  key={story.id}
                  className="relative flex h-[410px] w-[230px] shrink-0 flex-col justify-between overflow-hidden rounded-[30px] bg-[#151A17] p-4 text-white"
                >
                  {story.media?.[0]?.url && story.media[0].type === "image" ? <img src={story.media[0].url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                  {story.media?.[0]?.url && story.media[0].type === "video" ? <video src={story.media[0].url} className="absolute inset-0 h-full w-full object-cover" controls playsInline /> : null}
                  <div className="absolute inset-0 bg-[#D9A441]/20" />
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-white/15 text-sm font-semibold text-[#F8E8C4]">
                      {story.media?.[0]?.type === "video" ? <Video className="size-4" /> : story.media?.[0]?.type === "image" ? <ImageIcon className="size-4" /> : initial}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-[#F8E8C4]">
                      <Play className="size-3 fill-current" /> {formatStoryTime(story.publishedAt)}
                    </span>
                  </div>
                  <div className="relative">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F8E8C4]">Story {index + 1}</p>
                    <p className="mt-3 text-2xl font-semibold leading-8">{story.textBody || "A moment shared on Savanna."}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 grid min-h-56 place-items-center rounded-[26px] border border-dashed border-[#eadfca] bg-[#fcfbf8] p-6 text-center">
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                  <Play className="size-6" />
                </span>
                <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">No public stories yet.</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#5f6861]">When this user shares public stories, they will live here in a vertical story view.</p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-[#eadfca] bg-white p-5 shadow-[0_12px_28px_rgba(94,58,11,0.035)] sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a6410]">Memories</p>
              <h2 className="mt-1 font-display text-3xl font-semibold tracking-[-0.05em] text-[#151A17]">Saved moments</h2>
            </div>
            <span className="hidden rounded-full bg-[#D9A441]/20 px-3 py-1 text-xs font-semibold text-[#D9A441] sm:inline-flex">
              {memories.length} saved
            </span>
          </div>

          {memories.length ? (
            <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
              {memories.map((memory, index) => {
                const media = memory.media?.[0];
                const price = memory.productPriceMinor && memory.productCurrencyCode
                  ? new Intl.NumberFormat(undefined, { style: "currency", currency: memory.productCurrencyCode, maximumFractionDigits: 2 }).format(memory.productPriceMinor / 100)
                  : null;
                return (
                  <article
                    key={memory.id}
                    className="relative flex h-[410px] w-[230px] shrink-0 flex-col justify-between overflow-hidden rounded-[30px] bg-[#151A17] p-4 text-white"
                  >
                    {media?.url && media.type === "image" ? <img src={media.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                    {media?.url && media.type === "video" ? <video src={media.url} className="absolute inset-0 h-full w-full object-cover" controls playsInline /> : null}
                    {!media?.url ? <div className="absolute inset-0 bg-[#D9A441]/20" /> : null}
                    <div className="absolute inset-0 bg-black/25" />
                    <div className="relative flex items-center justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-full bg-white/15 text-sm font-semibold text-[#F8E8C4]">
                        {media?.type === "video" ? <Video className="size-4" /> : media?.type === "image" ? <ImageIcon className="size-4" /> : initial}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-semibold text-[#F8E8C4]">
                        <Play className="size-3 fill-current" /> {formatStoryTime(memory.publishedAt)}
                      </span>
                    </div>
                    <div className="relative">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F8E8C4]">Memory {index + 1}</p>
                      {memory.productName ? <p className="mt-2 text-lg font-semibold leading-6">{memory.productName}</p> : null}
                      {price ? <p className="mt-1 text-sm font-semibold text-[#F8E8C4]">{price}</p> : null}
                      <p className="mt-3 text-2xl font-semibold leading-8">{memory.textBody || memory.productDescription || "A saved moment on Savanna."}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 grid min-h-44 place-items-center rounded-[26px] border border-dashed border-[#eadfca] bg-white p-6 text-center">
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
                  <Play className="size-6" />
                </span>
                <p className="mt-4 font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">No saved Memories yet.</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#5f6861]">Saved stories will stay here after the 24-hour story window closes.</p>
              </div>
            </div>
          )}
        </section>

        <div className="flex justify-center">
          <Link href="/messages">
            <Button className="savanna-brand-token rounded-xl shadow-none">
              Message on Savanna
            </Button>
          </Link>
        </div>
      </div>
    </SavannaShell>
  );
}
