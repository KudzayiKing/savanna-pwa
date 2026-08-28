import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SavannaShell } from "@/components/SavannaShell";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Ban, Check, EyeOff, KeyRound, Loader2, Moon, ShieldCheck, Smartphone, Sun, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

type ProfileForm = {
  displayName: string;
  bio: string;
  countryCode: string;
  city: string;
  profileVisibility: "public" | "connections" | "private";
};

type PrivacyForm = {
  phoneVisibility: "nobody" | "connections";
  handleDiscoverability: "exact_match" | "invite_only";
  storyAudienceDefault: "connections" | "custom" | "private";
  readReceiptsEnabled: boolean;
  lastSeenVisibility: "nobody" | "connections";
  courseProgressOptIn: boolean;
};

const blankProfile: ProfileForm = { displayName: "", bio: "", countryCode: "", city: "", profileVisibility: "connections" };
const blankPrivacy: PrivacyForm = { phoneVisibility: "nobody", handleDiscoverability: "exact_match", storyAudienceDefault: "connections", readReceiptsEnabled: true, lastSeenVisibility: "connections", courseProgressOptIn: false };

export default function ProfilePage() {
  const { isAuthenticated, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const account = trpc.account.me.useQuery(undefined, { enabled: isAuthenticated });
  const [profileForm, setProfileForm] = useState<ProfileForm>(blankProfile);
  const [privacyForm, setPrivacyForm] = useState<PrivacyForm>(blankPrivacy);
  const updateProfile = trpc.account.updateProfile.useMutation({ onSuccess: () => { account.refetch(); toast.success("Profile saved"); }, onError: error => toast.error(error.message) });
  const updatePrivacy = trpc.account.updatePrivacy.useMutation({ onSuccess: () => { account.refetch(); toast.success("Privacy choices saved"); }, onError: error => toast.error(error.message) });
  const revokeSession = trpc.account.revokeSession.useMutation({ onSuccess: () => { account.refetch(); toast.success("Device session revoked"); }, onError: error => toast.error(error.message) });
  const block = trpc.account.block.useMutation({ onSuccess: () => toast.success("Account blocked"), onError: error => toast.error(error.message) });
  const report = trpc.account.report.useMutation({ onSuccess: () => toast.success("Report received"), onError: error => toast.error(error.message) });
  const [blockUserId, setBlockUserId] = useState("");
  const [reportTargetId, setReportTargetId] = useState("");
  const [reportReason, setReportReason] = useState<"spam" | "impersonation" | "scam" | "harassment" | "unsafe_content" | "other">("spam");

  useEffect(() => {
    if (!account.data) return;
    setProfileForm({
      displayName: account.data.profile.displayName,
      bio: account.data.profile.bio ?? "",
      countryCode: account.data.profile.countryCode ?? "",
      city: account.data.profile.city ?? "",
      profileVisibility: account.data.profile.profileVisibility,
    });
    setPrivacyForm({
      phoneVisibility: account.data.privacy.phoneVisibility,
      handleDiscoverability: account.data.privacy.handleDiscoverability,
      storyAudienceDefault: account.data.privacy.storyAudienceDefault,
      readReceiptsEnabled: account.data.privacy.readReceiptsEnabled,
      lastSeenVisibility: account.data.privacy.lastSeenVisibility,
      courseProgressOptIn: account.data.privacy.courseProgressOptIn,
    });
  }, [account.data]);

  if (loading) {
    return <SavannaShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#31583a]" /></div></SavannaShell>;
  }

  if (!isAuthenticated) {
    return <SavannaShell><section className="savanna-profile-page grid min-h-[62vh] place-items-center rounded-[30px] border border-[#dce1d3] bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#dfe8d9] text-[#31583a]"><UserRound className="size-6" /></span><p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[#6b8065]">Your Savanna</p><h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.06em] text-[#263126]">A profile you control.</h1><p className="mt-4 text-[15px] leading-7 text-[#687462]">Sign in to set your profile, choose how people can find you, and manage your privacy preferences.</p><Button className="mt-7 rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]" onClick={() => startLogin()}>Sign in to Savanna</Button></div></section></SavannaShell>;
  }

  const isLoading = account.isLoading || !account.data;
  return (
    <SavannaShell>
      <div className="savanna-profile-page mx-auto max-w-[910px] space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b8065]">Your account</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#263126]">Your Savanna, on your terms.</h1>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#e4ebdd] px-3 py-1.5 text-xs font-semibold text-[#31583a]"><ShieldCheck className="size-4" /> Privacy settings are yours</span>
        </header>

        <section className="flex items-center justify-between gap-4 rounded-[24px] bg-white p-5 shadow-[0_10px_24px_rgba(39,54,37,0.04)] dark:bg-[#202C33]">
          <div><p className="text-sm font-semibold">Appearance</p><p className="mt-1 text-xs text-muted-foreground">Choose how Savanna looks on this device.</p></div>
          <Button type="button" variant="outline" onClick={toggleTheme} className="shrink-0 rounded-xl border-0 bg-[#f5e4bf] text-[#5d3a0c] hover:bg-[#f2c14e] dark:bg-[#2A3942] dark:text-[#F2C14E] dark:hover:bg-[#2A3942]">{theme === "light" ? <Moon className="mr-2 size-4" /> : <Sun className="mr-2 size-4" />}Use {theme === "light" ? "dark" : "light"} mode</Button>
        </section>

        {isLoading ? <div className="grid min-h-64 place-items-center rounded-[26px] bg-white"><Loader2 className="size-5 animate-spin text-[#31583a]" /></div> : <>
          <section className="rounded-[28px] border border-[#dce1d3] bg-white p-6 shadow-[0_14px_35px_rgba(39,54,37,0.04)] sm:p-8">
            <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e8dfc9] text-[#80522a]"><UserRound className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#263126]">Profile</h2><p className="mt-1 text-sm text-[#697567]">Use the details you want others to see.</p></div></div>
            <form className="space-y-5" onSubmit={event => { event.preventDefault(); updateProfile.mutate({ ...profileForm, bio: profileForm.bio || null, countryCode: profileForm.countryCode || null, city: profileForm.city || null }); }}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="display-name">Display name</Label><Input id="display-name" value={profileForm.displayName} onChange={event => setProfileForm(current => ({ ...current, displayName: event.target.value }))} maxLength={100} /></div><div className="space-y-2"><Label htmlFor="profile-visibility">Profile visibility</Label><select id="profile-visibility" value={profileForm.profileVisibility} onChange={event => setProfileForm(current => ({ ...current, profileVisibility: event.target.value as ProfileForm["profileVisibility"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="connections">Connections</option><option value="public">Public</option><option value="private">Only me</option></select></div></div>
              <div className="space-y-2"><Label htmlFor="profile-bio">Bio</Label><Textarea id="profile-bio" value={profileForm.bio} onChange={event => setProfileForm(current => ({ ...current, bio: event.target.value }))} maxLength={500} placeholder="A short note about you, your work, or what you are learning." /></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="country-code">Country code</Label><Input id="country-code" value={profileForm.countryCode} onChange={event => setProfileForm(current => ({ ...current, countryCode: event.target.value.toUpperCase() }))} maxLength={2} placeholder="KE" /></div><div className="space-y-2"><Label htmlFor="profile-city">City</Label><Input id="profile-city" value={profileForm.city} onChange={event => setProfileForm(current => ({ ...current, city: event.target.value }))} maxLength={120} placeholder="Optional" /></div></div>
              <Button type="submit" disabled={updateProfile.isPending} className="rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]">{updateProfile.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />} Save profile</Button>
            </form>
          </section>

          <section className="rounded-[28px] border border-[#dce1d3] bg-white p-6 shadow-[0_14px_35px_rgba(39,54,37,0.04)] sm:p-8">
            <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#dfe8d9] text-[#31583a]"><EyeOff className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#263126]">Privacy</h2><p className="mt-1 text-sm text-[#697567]">Private chat, Stories, and learning each follow the choices below.</p></div></div>
            <form className="space-y-5" onSubmit={event => { event.preventDefault(); updatePrivacy.mutate(privacyForm); }}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="phone-visibility">Who can see your phone number?</Label><select id="phone-visibility" value={privacyForm.phoneVisibility} onChange={event => setPrivacyForm(current => ({ ...current, phoneVisibility: event.target.value as PrivacyForm["phoneVisibility"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="nobody">Nobody</option><option value="connections">Connections</option></select></div><div className="space-y-2"><Label htmlFor="handle-discovery">Handle discovery</Label><select id="handle-discovery" value={privacyForm.handleDiscoverability} onChange={event => setPrivacyForm(current => ({ ...current, handleDiscoverability: event.target.value as PrivacyForm["handleDiscoverability"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="exact_match">Exact handle only</option><option value="invite_only">Invitation only</option></select></div></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="story-audience">Default Story audience</Label><select id="story-audience" value={privacyForm.storyAudienceDefault} onChange={event => setPrivacyForm(current => ({ ...current, storyAudienceDefault: event.target.value as PrivacyForm["storyAudienceDefault"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="connections">Connections</option><option value="custom">Choose each time</option><option value="private">Only me</option></select></div><div className="space-y-2"><Label htmlFor="last-seen">Last seen</Label><select id="last-seen" value={privacyForm.lastSeenVisibility} onChange={event => setPrivacyForm(current => ({ ...current, lastSeenVisibility: event.target.value as PrivacyForm["lastSeenVisibility"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="connections">Connections</option><option value="nobody">Nobody</option></select></div></div>
              <div className="space-y-3 rounded-2xl bg-[#f5f7f2] p-4"><div className="flex items-center justify-between gap-4"><div><Label htmlFor="read-receipts" className="text-sm font-semibold">Read receipts</Label><p className="mt-1 text-xs leading-5 text-[#687462]">Let people know when you have read their message.</p></div><Switch id="read-receipts" checked={privacyForm.readReceiptsEnabled} onCheckedChange={checked => setPrivacyForm(current => ({ ...current, readReceiptsEnabled: checked }))} /></div><div className="flex items-center justify-between gap-4 border-t border-[#dfe5db] pt-3"><div><Label htmlFor="course-progress" className="text-sm font-semibold">Learning progress</Label><p className="mt-1 text-xs leading-5 text-[#687462]">Allow Savanna to save your course progress so you can resume later.</p></div><Switch id="course-progress" checked={privacyForm.courseProgressOptIn} onCheckedChange={checked => setPrivacyForm(current => ({ ...current, courseProgressOptIn: checked }))} /></div></div>
              <Button type="submit" disabled={updatePrivacy.isPending} className="rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]">{updatePrivacy.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />} Save privacy choices</Button>
            </form>
          </section>

          <section className="rounded-[28px] border border-[#dce1d3] bg-white p-6 shadow-[0_14px_35px_rgba(39,54,37,0.04)] sm:p-8"><div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e5edf0] text-[#31583a]"><Smartphone className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#263126]">Device sessions</h2><p className="mt-1 text-sm text-[#697567]">Review browsers that have recently used your Savanna account.</p></div></div><div className="space-y-3">{account.data.sessions.map(session => <div key={session.id} className="flex flex-col justify-between gap-3 rounded-2xl bg-[#f5f7f2] p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[#354136]">{session.deviceLabel} {session.id === account.data.currentSessionId ? <span className="ml-2 rounded-full bg-[#dfe8d9] px-2 py-0.5 text-[10px] font-semibold text-[#31583a]">This browser</span> : null}</p><p className="mt-1 text-xs text-[#6d7969]">Last active {new Date(session.lastSeenAt).toLocaleString()} {session.revokedAt ? "· Revoked" : ""}</p></div>{!session.revokedAt ? <Button variant="outline" disabled={revokeSession.isPending} onClick={() => revokeSession.mutate({ sessionId: session.id })} className="rounded-xl border-[#d1d9cc] bg-transparent text-[#714a2b] hover:bg-[#fbf0e6]">Revoke</Button> : null}</div>)}</div></section>
          <section className="grid gap-4 md:grid-cols-2"><article className="rounded-[24px] bg-[#24482f] p-6 text-white"><KeyRound className="size-5 text-[#d9e7ce]" /><h2 className="mt-6 font-display text-2xl font-semibold tracking-[-0.045em]">Your private spaces</h2><p className="mt-2 text-sm leading-6 text-[#d9e7d4]">Savanna separates private conversations, public Stories, storefronts, and payment records.</p></article><article className="rounded-[24px] border border-[#e7d9bf] bg-[#fbf4e8] p-6"><ShieldCheck className="size-5 text-[#9b682c]" /><h2 className="mt-6 font-display text-2xl font-semibold tracking-[-0.045em] text-[#4d3820]">Safety controls</h2><p className="mt-2 text-sm leading-6 text-[#7a6243]">The same report and block system is available from people, Stories, storefronts, and conversations.</p></article></section>
          <section className="grid gap-4 md:grid-cols-2"><form onSubmit={event => { event.preventDefault(); const userId = Number(blockUserId); if (!Number.isInteger(userId) || userId <= 0) return toast.error("Enter a valid account ID"); block.mutate({ userId }); }} className="rounded-[24px] border border-[#dce1d3] bg-white p-6"><Ban className="size-5 text-[#9c5337]" /><h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.045em] text-[#263126]">Block an account</h2><p className="mt-2 text-sm leading-6 text-[#697567]">This direct control is also surfaced contextually from profiles and conversations.</p><div className="mt-4 flex gap-2"><Input aria-label="Account ID to block" value={blockUserId} onChange={event => setBlockUserId(event.target.value)} placeholder="Account ID" inputMode="numeric" /><Button type="submit" disabled={block.isPending} variant="outline" className="rounded-xl border-[#e0c4b7] text-[#7a422d] hover:bg-[#fbf0e6]">Block</Button></div></form><form onSubmit={event => { event.preventDefault(); if (!reportTargetId.trim()) return toast.error("Enter the item ID you want to report"); report.mutate({ targetDomain: "profile", targetId: reportTargetId.trim(), reason: reportReason, evidenceScope: "none" }); }} className="rounded-[24px] border border-[#dce1d3] bg-white p-6"><ShieldCheck className="size-5 text-[#9b682c]" /><h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.045em] text-[#263126]">Send a report</h2><p className="mt-2 text-sm leading-6 text-[#697567]">Reports attach only the evidence you intentionally select.</p><div className="mt-4 flex gap-2"><Input aria-label="Profile item ID to report" value={reportTargetId} onChange={event => setReportTargetId(event.target.value)} placeholder="Profile item ID" /><select aria-label="Report reason" value={reportReason} onChange={event => setReportReason(event.target.value as typeof reportReason)} className="w-36 rounded-xl border border-input bg-transparent px-2 text-xs"><option value="spam">Spam</option><option value="impersonation">Impersonation</option><option value="scam">Scam</option><option value="harassment">Harassment</option><option value="unsafe_content">Unsafe</option><option value="other">Other</option></select><Button type="submit" disabled={report.isPending} className="rounded-xl bg-[#24482f] text-white hover:bg-[#1b3b25]">Report</Button></div></form></section>
        </>}
      </div>
    </SavannaShell>
  );
}
