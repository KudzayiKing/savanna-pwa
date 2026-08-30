import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { startLogin } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { createFirebaseBlock, createFirebaseSafetyReport } from "@/lib/firebaseSafety";
import { normalizeUsername, updateUserProfile } from "@/lib/userProfile";
import { AtSign, Ban, Check, EyeOff, KeyRound, Loader2, MessageCircle, Moon, ShieldCheck, Smartphone, Store, Sun, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type ProfileForm = {
  displayName: string;
  username: string;
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

const blankProfile: ProfileForm = { displayName: "", username: "", bio: "", countryCode: "", city: "", profileVisibility: "connections" };
const blankPrivacy: PrivacyForm = { phoneVisibility: "nobody", handleDiscoverability: "exact_match", storyAudienceDefault: "connections", readReceiptsEnabled: true, lastSeenVisibility: "connections", courseProgressOptIn: false };

export default function ProfilePage() {
  const { user, isAuthenticated, loading, refresh } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileForm, setProfileForm] = useState<ProfileForm>(blankProfile);
  const [privacyForm, setPrivacyForm] = useState<PrivacyForm>(blankPrivacy);
  const [blockUserId, setBlockUserId] = useState("");
  const [reportTargetId, setReportTargetId] = useState("");
  const [reportReason, setReportReason] = useState<"spam" | "impersonation" | "scam" | "harassment" | "unsafe_content" | "other">("spam");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [blockingAccount, setBlockingAccount] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      displayName: user.name ?? "",
      username: user.username ? `@${user.username}` : "",
      bio: user.bio ?? "",
      countryCode: user.countryCode ?? "",
      city: user.city ?? "",
      profileVisibility: user.profileVisibility,
    });
    setPrivacyForm({
      phoneVisibility: user.phoneVisibility,
      handleDiscoverability: user.handleDiscoverability,
      storyAudienceDefault: user.storyAudienceDefault,
      readReceiptsEnabled: user.readReceiptsEnabled,
      lastSeenVisibility: user.lastSeenVisibility,
      courseProgressOptIn: user.courseProgressOptIn,
    });
  }, [user]);

  if (loading) {
    return <SavannaShell hideMobileHeader><div className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div></SavannaShell>;
  }

  if (!isAuthenticated) {
    return (
      <SavannaShell hideMobileHeader>
        <section className="savanna-profile-page grid min-h-[62vh] place-items-center rounded-[30px] border border-[#DDE3DC] bg-white p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]"><UserRound className="size-6" /></span>
            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-[#5F6861]">Your Savanna</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">A profile you control.</h1>
            <p className="mt-4 text-[15px] leading-7 text-[#5F6861]">Sign in to set your profile, choose how people can find you, and manage your privacy preferences.</p>
            <Button className="savanna-brand-token mt-7 rounded-xl px-5 shadow-none" onClick={() => startLogin()}><UserRound className="mr-2 size-4" />Sign in to Savanna</Button>
          </div>
        </section>
      </SavannaShell>
    );
  }

  const isLoading = !user;
  const publicProfileHref = user ? `/people/${user.id}` : "/profile";
  const profileInitial = (user?.name || "S").slice(0, 1).toUpperCase();
  const session = {
    id: user?.id ?? "current",
    deviceLabel: "This browser",
    lastSeenAt: user?.updatedAt ?? new Date(),
  };

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await updateUserProfile(user.id, {
        name: profileForm.displayName.trim() || null,
        username: normalizeUsername(profileForm.username) || null,
        bio: profileForm.bio || null,
        countryCode: profileForm.countryCode || null,
        city: profileForm.city || null,
        profileVisibility: profileForm.profileVisibility,
      });
      await refresh();
      toast.success("Profile saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile could not be saved");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePrivacy = async () => {
    if (!user) return;
    setSavingPrivacy(true);
    try {
      await updateUserProfile(user.id, privacyForm);
      await refresh();
      toast.success("Privacy choices saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Privacy choices could not be saved");
    } finally {
      setSavingPrivacy(false);
    }
  };

  const submitReport = async () => {
    if (!user) return;
    if (!reportTargetId.trim()) return toast.error("Enter the item ID you want to report");
    setSendingReport(true);
    try {
      await createFirebaseSafetyReport({
        reporter: user,
        targetDomain: "profile",
        targetId: reportTargetId.trim(),
        reason: reportReason,
        evidenceScope: "none",
      });
      setReportTargetId("");
      toast.success("Report received");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report could not be sent");
    } finally {
      setSendingReport(false);
    }
  };

  const submitBlock = async () => {
    if (!user) return;
    if (!blockUserId.trim()) return toast.error("Enter a valid Savanna user ID");
    setBlockingAccount(true);
    try {
      await createFirebaseBlock(user, blockUserId);
      setBlockUserId("");
      toast.success("Account blocked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account could not be blocked");
    } finally {
      setBlockingAccount(false);
    }
  };

  return (
    <SavannaShell hideMobileHeader>
      <div className="savanna-profile-page mx-auto max-w-[960px] space-y-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8">
        <header className="savanna-profile-topbar savanna-glass-header sticky z-30 flex h-14 items-center justify-between rounded-[28px] border border-[#eadfca]/70 bg-white/65 px-4 backdrop-blur-xl lg:hidden">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#D9A441]/20 text-sm font-semibold text-[#D9A441]">
              {user?.photoURL ? <img src={user.photoURL} alt="" className="size-full object-cover" /> : profileInitial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-[#D9A441]">Profile</p>
              <p className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{user?.name || user?.username || "Your Savanna"}</p>
            </div>
          </div>
        </header>

        <section className="savanna-profile-header savanna-profile-hero flex flex-col justify-between gap-4 rounded-[28px] border border-[#eadfca]/70 bg-white/65 p-4 backdrop-blur-xl sm:flex-row sm:items-end sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#D9A441]">Your account</p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-[-0.06em] text-[#151A17]">Your page, your presence.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5F6861]">Profiles, Stories, Groups, and business pages stay connected from here.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#D9A441]"><ShieldCheck className="size-4" /> Privacy settings are yours</span>
        </section>

        <nav className="savanna-profile-switch grid grid-cols-2 gap-3 rounded-[24px] bg-white p-2 shadow-[0_10px_28px_rgba(21,26,23,0.045)] dark:bg-[#202C33]" aria-label="Profile sections">
          {[
            { href: publicProfileHref, label: "User page", icon: UserRound },
            { href: "/shops/manage", label: "Business page", icon: Store },
          ].map(item => {
            const Icon = item.icon;
            return (
              <Link key={item.label} href={item.href} className="inline-flex h-12 items-center justify-center gap-2 rounded-[18px] bg-[#D9A441]/20 px-4 text-sm font-semibold text-[#D9A441] transition-colors hover:bg-[#D9A441]/30">
                <Icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <section className="savanna-profile-card flex items-center justify-between gap-4 rounded-[24px] border border-[#eadfca] bg-white p-5 shadow-[0_10px_24px_rgba(94,58,11,0.035)] dark:bg-[#202C33]">
          <div><p className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">Appearance</p><p className="mt-1 text-xs text-[#5F6861] dark:text-[#9AA1A6]">Choose how Savanna looks on this device.</p></div>
          <Button type="button" variant="outline" onClick={toggleTheme} className="shrink-0 rounded-xl border-0 bg-[#D9A441]/20 text-[#9a6410] hover:bg-[#D9A441]/30 dark:bg-[#2A3942] dark:text-[#F2C14E] dark:hover:bg-[#2A3942]">{theme === "light" ? <Moon className="mr-2 size-4" /> : <Sun className="mr-2 size-4" />}Use {theme === "light" ? "dark" : "light"} mode</Button>
        </section>

        {isLoading ? <div className="savanna-profile-card grid min-h-64 place-items-center rounded-[26px] bg-white"><Loader2 className="size-5 animate-spin text-[#D9A441]" /></div> : <>
          <section className="savanna-profile-card rounded-[28px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.04)] sm:p-8">
            <div className="mb-6 flex items-start gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#D9A441]/20 text-xl font-semibold text-[#D9A441]">{profileInitial}</span>
              <div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Profile</h2><p className="mt-1 text-sm text-[#5F6861]">Use the details you want others to see.</p></div>
            </div>
            <form className="space-y-5" onSubmit={event => { event.preventDefault(); void saveProfile(); }}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="display-name">Display name</Label><Input id="display-name" value={profileForm.displayName} onChange={event => setProfileForm(current => ({ ...current, displayName: event.target.value }))} maxLength={100} /></div><div className="space-y-2"><Label htmlFor="profile-visibility">Profile visibility</Label><select id="profile-visibility" value={profileForm.profileVisibility} onChange={event => setProfileForm(current => ({ ...current, profileVisibility: event.target.value as ProfileForm["profileVisibility"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="connections">Connections</option><option value="public">Public</option><option value="private">Only me</option></select></div></div>
              <div className="space-y-2">
                <Label htmlFor="profile-username">Username</Label>
                <div className="savanna-username-field flex h-10 items-center gap-2 rounded-md border border-input bg-transparent px-3">
                  <AtSign className="size-4 text-[#D9A441]" />
                  <Input
                    id="profile-username"
                    value={profileForm.username}
                    onChange={event => setProfileForm(current => ({ ...current, username: event.target.value }))}
                    maxLength={25}
                    placeholder="@yourname"
                    className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
                  />
                </div>
                <p className="text-xs text-[#5F6861]">People can find you in messages with this @username. Your phone number stays private.</p>
              </div>
              <div className="space-y-2"><Label htmlFor="profile-bio">Bio</Label><Textarea id="profile-bio" value={profileForm.bio} onChange={event => setProfileForm(current => ({ ...current, bio: event.target.value }))} maxLength={500} placeholder="A short note about you, your work, or what you are learning." /></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="country-code">Country code</Label><Input id="country-code" value={profileForm.countryCode} onChange={event => setProfileForm(current => ({ ...current, countryCode: event.target.value.toUpperCase() }))} maxLength={2} placeholder="KE" /></div><div className="space-y-2"><Label htmlFor="profile-city">City</Label><Input id="profile-city" value={profileForm.city} onChange={event => setProfileForm(current => ({ ...current, city: event.target.value }))} maxLength={120} placeholder="Optional" /></div></div>
              <Button type="submit" disabled={savingProfile} className="savanna-brand-token rounded-xl shadow-none">{savingProfile ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />} Save profile</Button>
            </form>
          </section>

          <section className="savanna-profile-card rounded-[28px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.04)] sm:p-8">
            <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><EyeOff className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Privacy</h2><p className="mt-1 text-sm text-[#5F6861]">Messages, Stories, and profile discovery follow the choices below.</p></div></div>
            <form className="space-y-5" onSubmit={event => { event.preventDefault(); void savePrivacy(); }}>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="phone-visibility">Who can see your phone number?</Label><select id="phone-visibility" value={privacyForm.phoneVisibility} onChange={event => setPrivacyForm(current => ({ ...current, phoneVisibility: event.target.value as PrivacyForm["phoneVisibility"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="nobody">Nobody</option><option value="connections">Connections</option></select></div><div className="space-y-2"><Label htmlFor="handle-discovery">Handle discovery</Label><select id="handle-discovery" value={privacyForm.handleDiscoverability} onChange={event => setPrivacyForm(current => ({ ...current, handleDiscoverability: event.target.value as PrivacyForm["handleDiscoverability"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="exact_match">Exact handle only</option><option value="invite_only">Invitation only</option></select></div></div>
              <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="story-audience">Default Story audience</Label><select id="story-audience" value={privacyForm.storyAudienceDefault} onChange={event => setPrivacyForm(current => ({ ...current, storyAudienceDefault: event.target.value as PrivacyForm["storyAudienceDefault"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="connections">Connections</option><option value="custom">Choose each time</option><option value="private">Only me</option></select></div><div className="space-y-2"><Label htmlFor="last-seen">Last seen</Label><select id="last-seen" value={privacyForm.lastSeenVisibility} onChange={event => setPrivacyForm(current => ({ ...current, lastSeenVisibility: event.target.value as PrivacyForm["lastSeenVisibility"] }))} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="connections">Connections</option><option value="nobody">Nobody</option></select></div></div>
              <div className="space-y-3 rounded-2xl bg-[#D9A441]/10 p-4"><div className="flex items-center justify-between gap-4"><div><Label htmlFor="read-receipts" className="text-sm font-semibold">Read receipts</Label><p className="mt-1 text-xs leading-5 text-[#5F6861]">Let people know when you have read their message.</p></div><Switch id="read-receipts" checked={privacyForm.readReceiptsEnabled} onCheckedChange={checked => setPrivacyForm(current => ({ ...current, readReceiptsEnabled: checked }))} /></div><div className="flex items-center justify-between gap-4 border-t border-[#eadfca] pt-3"><div><Label htmlFor="course-progress" className="text-sm font-semibold">Learning progress</Label><p className="mt-1 text-xs leading-5 text-[#5F6861]">Allow Savanna to save your course progress so you can resume later.</p></div><Switch id="course-progress" checked={privacyForm.courseProgressOptIn} onCheckedChange={checked => setPrivacyForm(current => ({ ...current, courseProgressOptIn: checked }))} /></div></div>
              <Button type="submit" disabled={savingPrivacy} className="savanna-brand-token rounded-xl shadow-none">{savingPrivacy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />} Save privacy choices</Button>
            </form>
          </section>

          <section className="savanna-profile-card rounded-[28px] border border-[#eadfca] bg-white p-6 shadow-[0_14px_35px_rgba(94,58,11,0.04)] sm:p-8">
            <div className="mb-6 flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><Smartphone className="size-5" /></span><div><h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Device sessions</h2><p className="mt-1 text-sm text-[#5F6861]">Review browsers that have recently used your Savanna account.</p></div></div>
            <div className="space-y-3"><div className="savanna-profile-card-muted flex flex-col justify-between gap-3 rounded-2xl bg-[#D9A441]/10 p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[#151A17]">{session.deviceLabel} <span className="ml-2 rounded-full bg-[#D9A441]/20 px-2 py-0.5 text-[10px] font-semibold text-[#D9A441]">This browser</span></p><p className="mt-1 text-xs text-[#5F6861]">Last active {new Date(session.lastSeenAt).toLocaleString()}</p></div><Button variant="outline" disabled className="rounded-xl border-[#eadfca] bg-transparent text-[#9a6410] hover:bg-[#D9A441]/10">Managed by Firebase Auth</Button></div></div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <article className="savanna-profile-card rounded-[24px] bg-[#151A17] p-6 text-white"><KeyRound className="size-5 text-[#D9A441]" /><h2 className="mt-6 font-display text-2xl font-semibold tracking-[-0.045em]">Your private spaces</h2><p className="mt-2 text-sm leading-6 text-[#d8d3c8]">Savanna separates private conversations, Groups, public Stories, storefronts, and payment records.</p></article>
            <article className="savanna-profile-card rounded-[24px] border border-[#eadfca] bg-[#D9A441]/10 p-6"><ShieldCheck className="size-5 text-[#D9A441]" /><h2 className="mt-6 font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Safety controls</h2><p className="mt-2 text-sm leading-6 text-[#5F6861]">The same report and block system is available from people, Stories, storefronts, and conversations.</p></article>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <form onSubmit={event => { event.preventDefault(); void submitBlock(); }} className="savanna-profile-card rounded-[24px] border border-[#eadfca] bg-white p-6"><Ban className="size-5 text-[#9c5337]" /><h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Block an account</h2><p className="mt-2 text-sm leading-6 text-[#5F6861]">This direct control is also surfaced contextually from profiles and conversations.</p><div className="mt-4 flex gap-2"><Input aria-label="User ID to block" value={blockUserId} onChange={event => setBlockUserId(event.target.value)} placeholder="Savanna user ID" /><Button type="submit" disabled={blockingAccount} variant="outline" className="rounded-xl border-[#e0c4b7] text-[#7a422d] hover:bg-[#fbf0e6]">{blockingAccount ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Block</Button></div></form>
            <form onSubmit={event => { event.preventDefault(); void submitReport(); }} className="savanna-profile-card rounded-[24px] border border-[#eadfca] bg-white p-6"><ShieldCheck className="size-5 text-[#D9A441]" /><h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17]">Send a report</h2><p className="mt-2 text-sm leading-6 text-[#5F6861]">Reports attach only the evidence you intentionally select.</p><div className="mt-4 flex gap-2"><Input aria-label="Profile item ID to report" value={reportTargetId} onChange={event => setReportTargetId(event.target.value)} placeholder="Profile item ID" /><select aria-label="Report reason" value={reportReason} onChange={event => setReportReason(event.target.value as typeof reportReason)} className="w-36 rounded-xl border border-input bg-transparent px-2 text-xs"><option value="spam">Spam</option><option value="impersonation">Impersonation</option><option value="scam">Scam</option><option value="harassment">Harassment</option><option value="unsafe_content">Unsafe</option><option value="other">Other</option></select><Button type="submit" disabled={sendingReport} className="savanna-brand-token rounded-xl shadow-none">{sendingReport ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Report</Button></div></form>
          </section>
        </>}
      </div>
    </SavannaShell>
  );
}
