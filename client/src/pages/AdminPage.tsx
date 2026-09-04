import { useAuth } from "@/_core/hooks/useAuth";
import { SavannaShell } from "@/components/SavannaShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminRoleLabels,
  canAccessAdmin,
  canPerform,
  canWriteAdmin,
  reloadAdminClaim,
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  useAcknowledgeError,
  useAdminAnalytics,
  useAdminContent,
  useAdminDashboard,
  useAdminErrorLogs,
  useAdminMutations,
  useAdminUsers,
  useUserInvestigation,
  type AdminAccountStatus,
  type AdminAnalytics,
  type AdminAppealStatus,
  type AdminAuditLog,
  type AdminCommunityRow,
  type AdminContentKind,
  type AdminContentRow,
  type AdminDashboard,
  type AdminErrorLog,
  type AdminErrorSeverity,
  type AdminModerationState,
  type AdminReportDomain,
  type AdminReportStatus,
  type AdminReviewStatus,
  type AdminSafetyReport,
  type AdminStorefrontRow,
  type AdminUserInvestigation,
  type AdminUserRow,
} from "@/lib/firebaseAdmin";
import { isPermissionError } from "@/lib/observability";
import type { AppUser } from "@/lib/userProfile";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Ban,
  BarChart3,
  Bug,
  Check,
  CheckCheck,
  Clock,
  Eye,
  FileText,
  Flag,
  Loader2,
  Lock,
  MapPin,
  MessageSquareOff,
  Pause,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type AdminTab = "overview" | "users" | "reports" | "content" | "shops" | "communities" | "audit" | "errors" | "analytics";

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "reports", label: "Reports" },
  { id: "content", label: "Content" },
  { id: "shops", label: "Shops" },
  { id: "communities", label: "Communities" },
  { id: "audit", label: "Audit" },
  { id: "errors", label: "Errors" },
  { id: "analytics", label: "Analytics" },
];

const contentKinds: AdminContentKind[] = ["story", "communityPost", "product"];

const communityVisibilities = ["public", "private", "unlisted"] as const;

const reportDomains: AdminReportDomain[] = [
  "profile", "story", "story_comment", "community_post",
  "storefront", "product", "course", "message", "payment",
];

const reportStatuses: AdminReportStatus[] = ["new", "reviewing", "resolved", "dismissed"];

/** Mirrors AdminReviewStatus in firebaseAdmin.ts. */
const reviewStatuses: AdminReviewStatus[] = ["pending", "approved", "paused", "rejected"];

/** Mirrors AdminAccountStatus in firebaseAdmin.ts. */
const accountStatuses: AdminAccountStatus[] = ["active", "suspended", "banned"];

const previewDashboard: AdminDashboard = {
  users: [],
  reports: [],
  storefronts: [],
  communities: [],
  auditLogs: [],
  health: {
    firebaseConfigured: Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    localGemmaConfigured: Boolean(import.meta.env.VITE_GEMMA_LITERTLM_MODEL_URL),
    embeddingGemmaConfigured: Boolean(import.meta.env.VITE_EMBEDDING_GEMMA_MODEL_URL),
    translateGemmaConfigured: Boolean(import.meta.env.VITE_TRANSLATE_GEMMA_MODEL_URL),
    cloudFallbackConfigured: Boolean(import.meta.env.VITE_GEMMA_CLOUD_FALLBACK_URL),
  },
};

const africaMapAsset = "/admin/blank-map-africa.png";

/**
 * Marker positions are percentages of the map container box.
 *
 * `/admin/blank-map-africa.png` is a 2000x2000 equirectangular plate carree
 * render of Africa, stretched horizontally by ~1.14x. Fitting its four
 * extreme coastal points gives the projection:
 *
 *   x = (lon + 25.20) / 0.8332      y = (37.56 - lat) / 0.7274
 *
 * Validated against 20 coastal cities: mean error 0.28% of the image.
 *
 * Each x/y below is the area centroid of that country's polygon, taken from
 * the border lines actually drawn in the PNG - so a label sits in the middle
 * of its own country rather than in a neighbour's or the sea. If the map
 * image is ever swapped for one with different bounds or projection, every
 * value here has to be regenerated.
 */
const adminCountryMarkers = [
  { code: "MA", name: "Morocco", x: 23.5, y: 7.7 },
  { code: "DZ", name: "Algeria", x: 33.9, y: 12.9 },
  { code: "EG", name: "Egypt", x: 65.8, y: 15.1 },
  { code: "SN", name: "Senegal", x: 13.1, y: 31.8 },
  { code: "CI", name: "Cote d'Ivoire", x: 23.6, y: 41.2 },
  { code: "GH", name: "Ghana", x: 28.9, y: 40.7 },
  { code: "NG", name: "Nigeria", x: 40.2, y: 38.5 },
  { code: "CG", name: "Congo", x: 48.9, y: 52.9 },
  { code: "CD", name: "DR Congo", x: 59.1, y: 55.6 },
  { code: "ET", name: "Ethiopia", x: 78.5, y: 39.9 },
  { code: "UG", name: "Uganda", x: 69.7, y: 49.6 },
  { code: "KE", name: "Kenya", x: 76.5, y: 51.0 },
  { code: "RW", name: "Rwanda", x: 66.6, y: 54.4 },
  { code: "TZ", name: "Tanzania", x: 72.9, y: 60.6 },
  { code: "ZM", name: "Zambia", x: 64.0, y: 70.3 },
  { code: "MW", name: "Malawi", x: 71.1, y: 70.6 },
  { code: "MZ", name: "Mozambique", x: 72.2, y: 76.9 },
  { code: "ZW", name: "Zimbabwe", x: 66.3, y: 77.9 },
  { code: "BW", name: "Botswana", x: 59.0, y: 82.3 },
  { code: "ZA", name: "South Africa", x: 60.3, y: 91.7 },
] as const;

function formatDate(value: Date | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}

function statusClass(status: string) {
  if (["active", "approved", "resolved", "verified"].includes(status)) return "bg-[#22C55E]/12 text-[#16823D]";
  if (["suspended", "paused", "reviewing", "pending", "new"].includes(status)) return "bg-[#D9A441]/20 text-[#D9A441]";
  return "bg-[#D85C5C]/12 text-[#D85C5C]";
}

function StatusPill({ children, status }: { children: string; status: string }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", statusClass(status))}>{children}</span>;
}

function MetricCard({ label, value, icon: Icon, hint }: { label: string; value: number | string; icon: typeof Activity; hint?: string }) {
  return (
    <article className="rounded-[24px] border border-[#eadfca] bg-white/76 p-4 shadow-[0_18px_44px_rgba(64,45,20,0.06)] backdrop-blur-xl dark:border-[#26343A] dark:bg-[#111B21]/78">
      <div className="flex items-center justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
          <Icon className="size-4" />
        </span>
        <p className="font-display text-3xl font-semibold text-[#151A17] dark:text-[#E9EDEF]">{value}</p>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#8a765d] dark:text-[#AEBAC1]">{label}</p>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-[#8a765d] dark:text-[#9AA1A6]">{hint}</p> : null}
    </article>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="grid min-h-44 place-items-center rounded-[28px] border border-dashed border-[#eadfca] bg-white/55 p-8 text-center dark:border-[#344147] dark:bg-[#111B21]/62">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
          <ShieldCheck className="size-5" />
        </span>
        <h3 className="mt-4 font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">{title}</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">{copy}</p>
      </div>
    </div>
  );
}

/**
 * Shared row-of-controls for the list tabs.
 *
 * Every queue in this console needs the same two things — a search box and a
 * small set of dropdowns — and they have to look and behave identically, or an
 * admin moving between tabs has to relearn the controls each time. Extracting
 * them is what keeps five tabs consistent; the alternative was copying the same
 * twelve lines of Tailwind five times and letting them drift.
 */
function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

function SearchField({ value, onChange, placeholder, label }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="savanna-route-search flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[#DDE3DC] bg-white/76 px-4 dark:border-[#26343A] dark:bg-[#23282C]">
      <Search className="size-4 shrink-0 text-[#5F6861] dark:text-[#AEBAC1]" />
      <span className="sr-only">{label}</span>
      <Input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-none focus-visible:ring-0"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="shrink-0 rounded-full p-1 text-[#8a765d] transition-colors hover:bg-[#8A938D]/15 dark:text-[#9AA1A6]"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </label>
  );
}

/**
 * A dropdown that always offers an "all" option plus the values passed in.
 *
 * `widthClass` exists because these sit side by side with a flex-1 search box:
 * left to size themselves they all end up different widths, and the row looks
 * broken on tablet.
 */
function FilterSelect({ value, onChange, options, label, widthClass = "sm:w-52" }: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
  widthClass?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn("h-12 rounded-2xl border-[#DDE3DC] dark:border-[#26343A]", widthClass)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The "all" entry every FilterSelect is prefixed with. */
const ANY = { value: "all", label: "All" } as const;

/** Builds `{value,label}` pairs from string unions, title-cased for display. */
function optionsFor(values: readonly string[], labelFor: (value: string) => string = value => value.replace(/_/g, " ")) {
  return [ANY, ...values.map(value => ({ value, label: labelFor(value) }))];
}

function countryNameFor(code: string | null) {
  if (!code) return "Unknown country";
  if (code === "UNKNOWN") return "Unknown";
  return adminCountryMarkers.find(marker => marker.code === code)?.name ?? code;
}

function AdminCountryMap({ users }: { users: AdminUserRow[] }) {
  // Exact counts come from the analytics aggregation, which counts index
  // entries across the whole collection. The `users` page is capped at 120
  // rows for rendering, so it is only ever a fallback while analytics loads —
  // deriving totals from it would report the page size, not the user base.
  const { user } = useAuth();
  const analytics = useAdminAnalytics(user);

  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (analytics.data) {
      for (const entry of analytics.data.countries) counts.set(entry.code, entry.count);
      if (analytics.data.otherCountryCount > 0) counts.set("UNKNOWN", analytics.data.otherCountryCount);
      return counts;
    }
    for (const item of users) {
      const code = item.countryCode?.trim().toUpperCase() || "UNKNOWN";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return counts;
  }, [analytics.data, users]);

  const sortedCountries = useMemo(
    () => Array.from(countryCounts.entries()).sort((left, right) => right[1] - left[1]),
    [countryCounts],
  );
  const topCountry = sortedCountries[0]?.[0] ?? "ZW";
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const activeCountry = selectedCountry ?? topCountry;
  const activeCount = countryCounts.get(activeCountry) ?? 0;
  const maxCount = Math.max(1, ...Array.from(countryCounts.values()));

  return (
    <section className="savanna-admin-map overflow-hidden rounded-[32px] border border-[#eadfca] bg-white/72 shadow-[0_24px_80px_rgba(64,45,20,0.08)] backdrop-blur-2xl dark:border-[#26343A] dark:bg-[#111B21]/76">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#D9A441]">
            <MapPin className="size-4" /> Country activity
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold text-[#151A17] dark:text-[#E9EDEF]">Users across the map.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">Tap a country marker to inspect where the network is starting to grow.</p>
          <p className="mt-1 text-[11px] leading-4 text-[#8a765d] dark:text-[#9AA1A6]">
            Location is self-declared — taken from the country on each profile, not inferred from IP or device, and not verified.
          </p>
        </div>
        <div className="rounded-[22px] bg-[#D9A441]/20 px-5 py-4 text-[#D9A441]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Selected</p>
          <p className="mt-1 font-display text-3xl text-[#D9A441]">{activeCount}</p>
          <p className="text-sm font-semibold">{activeCount === 1 ? "user" : "users"} in {countryNameFor(activeCountry)}</p>
        </div>
      </div>

      <div className="relative mx-5 mb-5 min-h-[320px] overflow-hidden rounded-[28px] bg-[#D9A441]/10 dark:bg-[#071014]/80 sm:min-h-[520px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,164,65,0.16),transparent_64%)]" />
        {/* The PNG is exactly 1:1 and is painted with `object-contain`, so the
            box it sits in has to be square. Sizing that box with `inset-x-*` /
            `inset-y-*` gave it the panel's aspect instead, which letterboxed
            the image into the middle of the box and pushed every marker
            percentage sideways off the country it belongs to.
            `container-type: size` lets us take one square edge from the
            smaller of the panel's two axes, so image space and marker space
            stay identical. */}
        <div className="absolute inset-0" style={{ containerType: "size" }}>
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2"
            style={{ width: "min(100cqw - 1.5rem, 100cqh - 2rem, 720px)" }}
          >
            <div
              className="absolute inset-0 bg-[#D9A441]/20"
              aria-hidden="true"
              style={{
                WebkitMaskImage: `url(${africaMapAsset})`,
                maskImage: `url(${africaMapAsset})`,
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
            <img
              src={africaMapAsset}
              alt=""
              className="pointer-events-none absolute inset-0 size-full object-contain opacity-25 mix-blend-screen dark:opacity-35"
              aria-hidden="true"
            />
            <span className="sr-only">Africa country activity map</span>

            {adminCountryMarkers.map(marker => {
              const count = countryCounts.get(marker.code) ?? 0;
              const size = Math.round(18 + (count / maxCount) * 22);
              const active = activeCountry === marker.code;
              return (
                <button
                  key={marker.code}
                  type="button"
                  onClick={() => setSelectedCountry(marker.code)}
                  aria-label={`Show users in ${marker.name}`}
                  className={cn(
                    "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-xs font-bold transition-all duration-200",
                    active ? "z-10 border-[#D9A441] bg-[#D9A441] text-[#151A17] shadow-[0_0_0_8px_rgba(217,164,65,0.18)]" : "border-[#D9A441]/30 bg-[#D9A441]/20 text-[#D9A441] hover:bg-[#D9A441]/30",
                    count === 0 ? "opacity-55" : "opacity-100",
                  )}
                  style={{ left: `${marker.x}%`, top: `${marker.y}%`, width: `${size}px`, height: `${size}px` }}
                >
                  {count || marker.code}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="savanna-admin-country-strip flex gap-2 overflow-x-auto px-5 pb-5">
        {(sortedCountries.length ? sortedCountries : [["UNKNOWN", 0] as [string, number]]).slice(0, 8).map(([code, count]) => (
          <button
            key={code}
            type="button"
            onClick={() => setSelectedCountry(code)}
            data-active={activeCountry === code}
            className={cn(
              "shrink-0 rounded-full px-3 py-2 text-xs font-semibold",
              activeCountry === code ? "bg-[#D9A441]/20 text-[#D9A441]" : "bg-white/60 text-[#5F6861] dark:bg-[#172127] dark:text-[#AEBAC1]",
            )}
          >
            {countryNameFor(code)} · {count}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * The confirmation gate every admin write goes through.
 *
 * A reason is not decoration: it is stored on the audit entry and the
 * Firestore rule rejects the write without one. Collecting it here — before
 * the mutation is ever constructed — means an admin cannot get as far as a
 * network call with an action the database is going to refuse.
 */
type PendingAction = {
  key: string;
  title: string;
  description: string;
  target: string;
  confirmLabel: string;
  danger: boolean;
  /** Ask for an outcome note as well, e.g. when closing a report. */
  requireResolution: boolean;
  run: (reason: string, resolution?: string) => Promise<void>;
};

function ReasonDialog({ action, onClose }: { action: PendingAction | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset per action. Keying off the action id means opening a second
  // confirmation never inherits the previous one's typed text — which would
  // otherwise attach an unrelated justification to a different target.
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (action && action.key !== lastKey) {
    setLastKey(action.key);
    setReason("");
    setResolution("");
    setSubmitting(false);
  }

  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < REASON_MIN_LENGTH;
  const canSubmit = Boolean(action) && trimmed.length >= REASON_MIN_LENGTH && !submitting;

  const submit = async () => {
    if (!action || !canSubmit) return;
    setSubmitting(true);
    try {
      await action.run(trimmed, resolution.trim() || undefined);
      onClose();
    } catch (error) {
      // Stays open on failure: the admin has already typed a justification and
      // closing the dialog would throw that away along with the error.
      toast.error(error instanceof Error ? error.message : "Admin action failed");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="max-w-lg rounded-[28px] border-[#eadfca] bg-white p-6 dark:border-[#26343A] dark:bg-[#111B21]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">
            {action?.danger ? <AlertTriangle className="size-5 text-[#D85C5C]" /> : <ShieldCheck className="size-5 text-[#D9A441]" />}
            {action?.title ?? "Confirm action"}
          </DialogTitle>
          <DialogDescription className="text-left text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">
            {action?.description}
          </DialogDescription>
        </DialogHeader>

        {action ? (
          <div className="space-y-4 py-1">
            <div className="rounded-2xl bg-[#D9A441]/10 px-3 py-2 text-xs text-[#7b4a0d] dark:text-[#D9A441]">
              Target: <span className="font-semibold">{action.target}</span>
            </div>
            <div>
              <label htmlFor="admin-reason" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8a765d] dark:text-[#AEBAC1]">
                Reason (required)
              </label>
              <Textarea
                id="admin-reason"
                value={reason}
                onChange={event => setReason(event.target.value)}
                maxLength={REASON_MAX_LENGTH}
                rows={3}
                placeholder="Why is this action being taken? Stored on the permanent audit trail."
                className="rounded-2xl border-[#DDE3DC] dark:border-[#26343A]"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">
                <span>{tooShort ? `At least ${REASON_MIN_LENGTH} characters.` : "Visible to other admins in the audit log."}</span>
                <span>{trimmed.length}/{REASON_MAX_LENGTH}</span>
              </div>
            </div>
            {action.requireResolution ? (
              <div>
                <label htmlFor="admin-resolution" className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8a765d] dark:text-[#AEBAC1]">
                  Outcome note (optional)
                </label>
                <Textarea
                  id="admin-resolution"
                  value={resolution}
                  onChange={event => setResolution(event.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="What was decided? Shown on the report."
                  className="rounded-2xl border-[#DDE3DC] dark:border-[#26343A]"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="rounded-full">Cancel</Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className={cn(
              "rounded-full",
              action?.danger
                ? "bg-[#D85C5C] text-white hover:bg-[#C94C4C]"
                : "bg-[#D9A441] text-[#151A17] hover:bg-[#C79333]",
            )}
          >
            {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            {action?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({
  item,
  disabled,
  onStatus,
  onRestriction,
  onVerify,
  onInspect,
}: {
  item: AdminUserRow;
  disabled: boolean;
  onStatus: (status: AdminAccountStatus) => void;
  onRestriction: (field: "messagingRestricted" | "postingRestricted", value: boolean) => void;
  onVerify: (verified: boolean) => void;
  onInspect: () => void;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-[24px] border border-[#eadfca] bg-white/74 p-4 dark:border-[#26343A] dark:bg-[#111B21]/76 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#D9A441]/20 text-sm font-semibold text-[#D9A441]">
          {item.photoURL ? <img src={item.photoURL} alt="" className="size-full object-cover" /> : item.name?.[0]?.toUpperCase() || item.username?.[0]?.toUpperCase() || "S"}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">
            {item.name || "Savanna user"}
            {item.verified ? <ShieldCheck className="ml-1 inline size-3.5 text-[#16823D]" aria-label="Verified" /> : null}
          </h3>
          <p className="truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">{item.username ? `@${item.username}` : item.email || item.id}</p>
          <p className="mt-1 text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">{item.city || "No city"} · {formatDate(item.updatedAt)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={item.accountStatus}>{item.accountStatus}</StatusPill>
        {item.adminRole ? <StatusPill status="approved">{adminRoleLabels[item.adminRole]}</StatusPill> : null}
        {item.messagingRestricted ? <StatusPill status="banned">no messages</StatusPill> : null}
        {item.postingRestricted ? <StatusPill status="banned">no posts</StatusPill> : null}
        <Button disabled={disabled || item.accountStatus === "suspended"} onClick={() => onStatus("suspended")} size="sm" variant="ghost" className="rounded-full bg-[#D85C5C]/10 text-[#D85C5C] hover:bg-[#D85C5C]/15"><Ban className="mr-1.5 size-3.5" />Suspend</Button>
        <Button disabled={disabled || item.accountStatus === "banned"} onClick={() => onStatus("banned")} size="sm" variant="ghost" className="rounded-full bg-[#D85C5C]/10 text-[#D85C5C] hover:bg-[#D85C5C]/15"><Ban className="mr-1.5 size-3.5" />Ban</Button>
        <Button disabled={disabled || item.accountStatus === "active"} onClick={() => onStatus("active")} size="sm" variant="ghost" className="rounded-full bg-[#D9A441]/20 text-[#D9A441] hover:bg-[#D9A441]/25"><RotateCcw className="mr-1.5 size-3.5" />Restore</Button>
        <Button disabled={disabled} onClick={() => onRestriction("messagingRestricted", !item.messagingRestricted)} size="sm" variant="ghost" className="rounded-full bg-[#8A938D]/10 text-[#5F6861] dark:text-[#AEBAC1]"><MessageSquareOff className="mr-1.5 size-3.5" />{item.messagingRestricted ? "Allow msgs" : "Stop msgs"}</Button>
        <Button disabled={disabled} onClick={() => onRestriction("postingRestricted", !item.postingRestricted)} size="sm" variant="ghost" className="rounded-full bg-[#8A938D]/10 text-[#5F6861] dark:text-[#AEBAC1]"><Pause className="mr-1.5 size-3.5" />{item.postingRestricted ? "Allow posts" : "Stop posts"}</Button>
        <Button disabled={disabled} onClick={() => onVerify(!item.verified)} size="sm" variant="ghost" className="rounded-full bg-[#22C55E]/12 text-[#16823D]"><Check className="mr-1.5 size-3.5" />{item.verified ? "Unverify" : "Verify"}</Button>
        {/* Inspection is never gated on canPerform("user.moderate") — a
            read-only analyst has to be able to investigate an account, and the
            drawer hides its own action buttons for roles that cannot act. */}
        <Button onClick={onInspect} size="sm" variant="ghost" className="rounded-full bg-[#D9A441]/20 text-[#D9A441]"><Eye className="mr-1.5 size-3.5" />Inspect</Button>
      </div>
    </article>
  );
}

function ReportRow({ item, disabled, onStatus }: { item: AdminSafetyReport; disabled: boolean; onStatus: (status: AdminReportStatus) => void }) {
  return (
    <article className="rounded-[24px] border border-[#eadfca] bg-white/74 p-4 dark:border-[#26343A] dark:bg-[#111B21]/76">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{item.reason.replace(/_/g, " ")} · {item.targetDomain}</h3>
          <p className="mt-1 text-xs text-[#5F6861] dark:text-[#AEBAC1]">Target {item.targetId || "unknown"} · Reporter {item.reporterUserId || "unknown"}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={item.status}>{item.status}</StatusPill>
          <span className="text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">{formatDate(item.createdAt)}</span>
        </div>
      </div>
      {item.detail ? <p className="mt-3 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">{item.detail}</p> : null}
      {item.resolution ? (
        <p className="mt-2 rounded-2xl bg-[#22C55E]/10 px-3 py-2 text-xs text-[#16823D]">Outcome: {item.resolution}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={disabled || item.status === "reviewing"} onClick={() => onStatus("reviewing")} size="sm" variant="ghost" className="rounded-full bg-[#D9A441]/20 text-[#D9A441]"><Clock className="mr-1.5 size-3.5" />Review</Button>
        <Button disabled={disabled} onClick={() => onStatus("resolved")} size="sm" variant="ghost" className="rounded-full bg-[#22C55E]/12 text-[#16823D]"><Check className="mr-1.5 size-3.5" />Resolve</Button>
        <Button disabled={disabled} onClick={() => onStatus("dismissed")} size="sm" variant="ghost" className="rounded-full bg-[#8A938D]/10 text-[#5F6861] dark:text-[#AEBAC1]">Dismiss</Button>
        <Button disabled={disabled} onClick={() => onStatus("new")} size="sm" variant="ghost" className="rounded-full bg-[#8A938D]/10 text-[#5F6861] dark:text-[#AEBAC1]"><RotateCcw className="mr-1.5 size-3.5" />Reopen</Button>
      </div>
    </article>
  );
}

function ReviewRow({ item, kind, disabled, onStatus, flagged, onVisibility, onRiskFlag }: {
  item: AdminStorefrontRow | AdminCommunityRow;
  kind: "shop" | "community";
  disabled: boolean;
  onStatus: (status: AdminReviewStatus) => void;
  /** Shops only — whether the shop currently carries an internal risk flag. */
  flagged?: boolean;
  /** Communities only — absent for roles without community.review. */
  onVisibility?: (visibility: "public" | "private" | "unlisted") => void;
  /** Shops only — absent for roles without shop.review. */
  onRiskFlag?: (flagged: boolean) => void;
}) {
  const href = kind === "shop" ? `/shops/${(item as AdminStorefrontRow).slug}` : `/communities/${item.id}`;
  const location = kind === "shop" ? (item as AdminStorefrontRow).ownerCity : (item as AdminCommunityRow).city;
  return (
    <article className="flex flex-col gap-4 rounded-[24px] border border-[#eadfca] bg-white/74 p-4 dark:border-[#26343A] dark:bg-[#111B21]/76 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
          {kind === "shop" ? <Store className="size-5" /> : <Users className="size-5" />}
        </span>
        <div className="min-w-0">
          <Link href={href} className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{item.name}</Link>
          <p className="mt-1 line-clamp-1 text-xs text-[#5F6861] dark:text-[#AEBAC1]">{kind === "shop" ? (item as AdminStorefrontRow).category || "Uncategorized shop" : (item as AdminCommunityRow).description || "Community space"}</p>
          <p className="mt-1 text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">{location || "No city"} · {item.visibility} · {formatDate(item.updatedAt)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={item.reviewStatus}>{item.reviewStatus}</StatusPill>
        {flagged ? <StatusPill status="banned">flagged</StatusPill> : null}
        <Button disabled={disabled} onClick={() => onStatus("approved")} size="sm" variant="ghost" className="rounded-full bg-[#22C55E]/12 text-[#16823D]"><Check className="mr-1.5 size-3.5" />Approve</Button>
        <Button disabled={disabled} onClick={() => onStatus("paused")} size="sm" variant="ghost" className="rounded-full bg-[#D9A441]/20 text-[#D9A441]"><Pause className="mr-1.5 size-3.5" />Pause</Button>
        <Button disabled={disabled} onClick={() => onStatus("rejected")} size="sm" variant="ghost" className="rounded-full bg-[#D85C5C]/10 text-[#D85C5C]">Reject</Button>
        {kind === "shop" && onRiskFlag ? (
          <Button disabled={disabled} onClick={() => onRiskFlag(!flagged)} size="sm" variant="ghost" className="rounded-full bg-[#D9A441]/20 text-[#D9A441]">
            <Flag className="mr-1.5 size-3.5" />{flagged ? "Clear flag" : "Flag"}
          </Button>
        ) : null}
        {/* Visibility is separate from review: a community can be approved and
            unlisted, and the two answers different questions — "is this
            allowed?" versus "can people stumble into it?". */}
        {kind === "community" && onVisibility ? (
          <Select value={item.visibility} onValueChange={value => onVisibility(value as "public" | "private" | "unlisted")}>
            <SelectTrigger aria-label="Community visibility" className="h-9 w-36 rounded-full border-[#DDE3DC] text-xs dark:border-[#26343A]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {communityVisibilities.map(visibility => (
                <SelectItem key={visibility} value={visibility}>{visibility}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
    </article>
  );
}

/**
 * One client-reported failure.
 *
 * The stack is collapsed behind a toggle rather than shown inline: a minified
 * React stack is 20+ lines of unreadable frames, and the admin scanning a list
 * of fifty failures needs the message and the scope, not the noise. The
 * context chips come first because they are usually the actionable part —
 * "which collection", "which story", "permission denied: yes".
 */
function ErrorLogRow({ entry, onAcknowledge, acknowledging }: {
  entry: AdminErrorLog;
  onAcknowledge: () => void;
  acknowledging: boolean;
}) {
  const [showStack, setShowStack] = useState(false);
  const acknowledged = Boolean(entry.acknowledgedBy);

  return (
    <article
      className={cn(
        "rounded-[24px] border bg-white/74 p-4 dark:bg-[#111B21]/76",
        // Acknowledged entries fade back so the unread ones carry the eye.
        acknowledged
          ? "border-[#eadfca] opacity-60 dark:border-[#26343A]"
          : entry.severity === "error"
            ? "border-[#D85C5C]/40 dark:border-[#D85C5C]/30"
            : "border-[#eadfca] dark:border-[#26343A]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{entry.scope}</h3>
            <StatusPill status={entry.severity === "error" ? "banned" : entry.severity === "warning" ? "pending" : "approved"}>
              {entry.severity}
            </StatusPill>
            {acknowledged ? <StatusPill status="approved">seen</StatusPill> : null}
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-[#5F6861] dark:text-[#AEBAC1]">{entry.message}</p>
        </div>
        <p className="shrink-0 text-xs font-semibold text-[#8a765d] dark:text-[#9AA1A6]">{formatDate(entry.createdAt)}</p>
      </div>

      {Object.keys(entry.context).length ? (
        <dl className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(entry.context).map(([key, value]) => (
            <div key={key} className="rounded-full bg-[#8A938D]/10 px-2 py-1 text-[11px] text-[#5F6861] dark:text-[#AEBAC1]">
              <dt className="inline font-semibold">{key}</dt>
              <dd className="inline">: {String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {entry.stack ? (
          <Button size="sm" variant="ghost" onClick={() => setShowStack(value => !value)} className="rounded-full bg-[#8A938D]/10 text-[#5F6861] dark:text-[#AEBAC1]">
            <Bug className="mr-1.5 size-3.5" />
            {showStack ? "Hide stack" : "Stack"}
          </Button>
        ) : null}
        {!acknowledged ? (
          <Button size="sm" variant="ghost" disabled={acknowledging} onClick={onAcknowledge} className="rounded-full bg-[#22C55E]/12 text-[#16823D]">
            <CheckCheck className="mr-1.5 size-3.5" />
            Mark seen
          </Button>
        ) : null}
        <span className="text-[10px] text-[#8a765d] dark:text-[#9AA1A6]">
          {[entry.route, entry.userId ? `user ${entry.userId.slice(0, 8)}` : "signed out", entry.appVersion].filter(Boolean).join(" · ")}
        </span>
      </div>

      {showStack && entry.stack ? (
        <pre className="mt-3 max-h-56 overflow-auto rounded-2xl bg-[#151A17] p-3 text-[10px] leading-4 text-[#E9EDEF]">
          {entry.stack}
        </pre>
      ) : null}
    </article>
  );
}

/** Pairs of field -> before/after for the fields a mutation actually changed. */
function changedFields(log: AdminAuditLog) {
  const keys = new Set([...Object.keys(log.before), ...Object.keys(log.after)]);
  return Array.from(keys)
    .filter(key => JSON.stringify(log.before[key] ?? null) !== JSON.stringify(log.after[key] ?? null))
    .map(key => ({ key, before: log.before[key] ?? null, after: log.after[key] ?? null }));
}

function renderValue(value: unknown) {
  if (value === null || value === undefined) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AuditRow({ log }: { log: AdminAuditLog }) {
  const changes = changedFields(log);
  return (
    <article className="rounded-[24px] border border-[#eadfca] bg-white/74 p-4 dark:border-[#26343A] dark:bg-[#111B21]/76">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{log.action}</h3>
          <p className="mt-1 text-xs text-[#5F6861] dark:text-[#AEBAC1]">{log.targetType} · {log.targetId}</p>
        </div>
        <p className="text-xs font-semibold text-[#8a765d] dark:text-[#9AA1A6]">{formatDate(log.createdAt)}</p>
      </div>

      <p className="mt-3 text-xs text-[#5F6861] dark:text-[#AEBAC1]">
        By {log.adminName || log.adminUserId || "Savanna admin"}
        {log.adminRole ? ` · ${adminRoleLabels[log.adminRole]}` : ""}
      </p>

      <div className="mt-2 rounded-2xl bg-[#D9A441]/10 px-3 py-2 text-xs text-[#7b4a0d] dark:text-[#D9A441]">
        Reason: {log.reason ?? "not recorded"}
      </div>

      {changes.length ? (
        <dl className="mt-3 space-y-1">
          {changes.map(change => (
            <div key={change.key} className="flex flex-wrap items-center gap-2 text-[11px]">
              <dt className="font-semibold text-[#151A17] dark:text-[#E9EDEF]">{change.key}</dt>
              <dd className="text-[#D85C5C]">{renderValue(change.before)}</dd>
              <span aria-hidden="true" className="text-[#8a765d]">→</span>
              <dd className="text-[#16823D]">{renderValue(change.after)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {log.detail ? <p className="mt-3 text-xs leading-5 text-[#5F6861] dark:text-[#AEBAC1]">{log.detail}</p> : null}

      <p className="mt-3 text-[10px] leading-4 text-[#8a765d] dark:text-[#9AA1A6]">
        {[log.actorPlatform, log.actorTimezone, log.actorScreen, log.actorLanguage].filter(Boolean).join(" · ") || "No device context"}
        {log.ipAddress ? ` · ${log.ipAddress}` : ""}
      </p>
    </article>
  );
}

/**
 * One piece of moderatable content.
 *
 * Media is shown as a thumbnail rather than described, because the decision
 * being made is almost always about the image — a product photo or a story
 * frame — and "no text content" tells a moderator nothing about whether the
 * thing violates policy.
 */
function ContentRow({ item, disabled, onModerate }: {
  item: AdminContentRow;
  disabled: boolean;
  onModerate: (state: AdminModerationState) => void;
}) {
  const removed = item.moderationState === "removed";
  return (
    <article className={cn(
      "rounded-[24px] border bg-white/74 p-4 dark:bg-[#111B21]/76",
      removed ? "border-[#D85C5C]/40 dark:border-[#D85C5C]/30" : "border-[#eadfca] dark:border-[#26343A]",
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#8A938D]/10 text-[#5F6861] dark:text-[#AEBAC1]">
            {item.mediaUrl
              ? <img src={item.mediaUrl} alt="" className="size-full object-cover" />
              : <FileText className="size-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">
                {item.kind.replace(/([A-Z])/g, " $1").toLowerCase()}
              </h3>
              <StatusPill status={removed ? "banned" : "approved"}>{item.moderationState}</StatusPill>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#5F6861] dark:text-[#AEBAC1]">
              {item.title || item.body || "No text content"}
            </p>
            <p className="mt-1 text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">
              {item.authorName || item.authorUserId || "Unknown author"}
              {item.parentName ? ` · in ${item.parentName}` : ""} · {formatDate(item.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {removed && item.removedReason ? (
        <p className="mt-3 rounded-2xl bg-[#D85C5C]/10 px-3 py-2 text-xs leading-5 text-[#D85C5C]">
          Removed: {item.removedReason}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {removed ? (
          <Button disabled={disabled} onClick={() => onModerate("visible")} size="sm" variant="ghost" className="rounded-full bg-[#22C55E]/12 text-[#16823D]">
            <Undo2 className="mr-1.5 size-3.5" />Restore
          </Button>
        ) : (
          <Button disabled={disabled} onClick={() => onModerate("removed")} size="sm" variant="ghost" className="rounded-full bg-[#D85C5C]/10 text-[#D85C5C]">
            <Trash2 className="mr-1.5 size-3.5" />Remove
          </Button>
        )}
      </div>
    </article>
  );
}

function DetailSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#eadfca] bg-white/70 p-4 dark:border-[#26343A] dark:bg-[#111B21]/70">
      <h4 className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a765d] dark:text-[#AEBAC1]">
        {title}
        {count === undefined ? null : (
          <span className="rounded-full bg-[#D9A441]/20 px-2 py-0.5 text-[10px] text-[#D9A441]">{count}</span>
        )}
      </h4>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <dt className="text-[#8a765d] dark:text-[#9AA1A6]">{label}</dt>
      <dd className="text-right font-medium text-[#151A17] dark:text-[#E9EDEF]">{value}</dd>
    </div>
  );
}

const appealStatusLabels: Record<AdminAppealStatus, string> = {
  none: "No appeal",
  pending: "Appeal pending",
  upheld: "Appeal upheld",
  overturned: "Appeal overturned",
};

/**
 * The full record for one account, opened from the users tab.
 *
 * Laid out as a set of independent sections rather than tabs because an admin
 * investigating a report is checking a hypothesis — "is this a repeat
 * offender?" — which means comparing several facets at once. Hiding them
 * behind tabs would force the answer to be assembled from memory.
 */
function InvestigationDrawer({ investigation, loading, busy, canModerate, onClose, onStatus, onAppeal }: {
  investigation: AdminUserInvestigation | undefined;
  loading: boolean;
  busy: boolean;
  canModerate: boolean;
  onClose: () => void;
  onStatus: (status: AdminAccountStatus) => void;
  onAppeal: (status: "upheld" | "overturned", note: string) => void;
}) {
  const [appealNote, setAppealNote] = useState("");
  const user = investigation?.user;
  const suspended = Boolean(user && user.accountStatus !== "active");

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto rounded-[28px] border-[#eadfca] bg-white p-6 dark:border-[#26343A] dark:bg-[#111B21]">
        {loading || !investigation || !user ? (
          <div className="grid min-h-64 place-items-center">
            <Loader2 className="size-6 animate-spin text-[#D9A441]" />
          </div>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 text-left font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#D9A441]/20 text-sm font-semibold text-[#D9A441]">
                  {user.photoURL
                    ? <img src={user.photoURL} alt="" className="size-full object-cover" />
                    : user.name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || "S"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{user.name || "Savanna user"}</span>
                  <span className="block truncate text-xs font-normal text-[#5F6861] dark:text-[#AEBAC1]">
                    {user.username ? `@${user.username}` : user.id}
                  </span>
                </span>
              </DialogTitle>
              <DialogDescription className="text-left text-xs text-[#8a765d] dark:text-[#9AA1A6]">
                Firebase UID {user.id}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={user.accountStatus}>{user.accountStatus}</StatusPill>
              {user.adminRole ? <StatusPill status="approved">{adminRoleLabels[user.adminRole]}</StatusPill> : null}
              {user.verified ? <StatusPill status="approved">verified</StatusPill> : null}
              {user.messagingRestricted ? <StatusPill status="banned">no messages</StatusPill> : null}
              {user.postingRestricted ? <StatusPill status="banned">no posts</StatusPill> : null}
            </div>

            <DetailSection title="Profile">
              <dl className="space-y-2">
                <FactRow label="Email" value={user.email ?? "not set"} />
                <FactRow label="Phone" value={user.phoneNumber ?? "not set"} />
                <FactRow label="Location" value={[user.city, user.countryCode].filter(Boolean).join(", ") || "not set"} />
                <FactRow label="Joined" value={formatDate(user.createdAt)} />
                <FactRow label="Last active" value={formatDate(user.updatedAt)} />
                <FactRow label="Stories posted" value={String(investigation.storyCount)} />
                <FactRow label="Content removed" value={String(investigation.removedContentCount)} />
              </dl>
            </DetailSection>

            {/* The appeal block only exists for accounts that are actually
                restricted — offering to uphold an appeal against an active
                account is meaningless and invites mis-clicks. */}
            {suspended ? (
              <DetailSection title="Appeal">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={investigation.banAppealStatus === "overturned" ? "approved" : "pending"}>
                    {appealStatusLabels[investigation.banAppealStatus]}
                  </StatusPill>
                  {investigation.banAppealAt ? (
                    <span className="text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">filed {formatDate(investigation.banAppealAt)}</span>
                  ) : null}
                </div>
                {investigation.banAppealNote ? (
                  <p className="rounded-2xl bg-[#D9A441]/10 px-3 py-2 text-xs leading-5 text-[#7b4a0d] dark:text-[#D9A441]">
                    {investigation.banAppealNote}
                  </p>
                ) : null}
                {investigation.banAppealReviewedBy ? (
                  <p className="text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">
                    Reviewed by {investigation.banAppealReviewedBy}
                    {investigation.banAppealReviewedAt ? ` on ${formatDate(investigation.banAppealReviewedAt)}` : ""}
                  </p>
                ) : null}

                <label htmlFor="appeal-note" className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a765d] dark:text-[#AEBAC1]">
                  Decision note
                </label>
                <Textarea
                  id="appeal-note"
                  value={appealNote}
                  onChange={event => setAppealNote(event.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="Why is the appeal upheld or overturned? Stored on the account and in the audit trail."
                  className="rounded-2xl border-[#DDE3DC] dark:border-[#26343A]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || !canModerate}
                    onClick={() => onAppeal("upheld", appealNote)}
                    className="rounded-full bg-[#D85C5C]/10 text-[#D85C5C]"
                  >
                    <Scale className="mr-1.5 size-3.5" />Uphold
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || !canModerate}
                    onClick={() => onAppeal("overturned", appealNote)}
                    className="rounded-full bg-[#22C55E]/12 text-[#16823D]"
                  >
                    <Undo2 className="mr-1.5 size-3.5" />Overturn and restore
                  </Button>
                </div>
              </DetailSection>
            ) : null}

            {canModerate ? (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || user.accountStatus === "suspended"} onClick={() => onStatus("suspended")} size="sm" variant="ghost" className="rounded-full bg-[#D85C5C]/10 text-[#D85C5C]">
                  <Ban className="mr-1.5 size-3.5" />Suspend
                </Button>
                <Button disabled={busy || user.accountStatus === "banned"} onClick={() => onStatus("banned")} size="sm" variant="ghost" className="rounded-full bg-[#D85C5C]/10 text-[#D85C5C]">
                  <Ban className="mr-1.5 size-3.5" />Ban
                </Button>
                <Button disabled={busy || user.accountStatus === "active"} onClick={() => onStatus("active")} size="sm" variant="ghost" className="rounded-full bg-[#D9A441]/20 text-[#D9A441]">
                  <RotateCcw className="mr-1.5 size-3.5" />Restore
                </Button>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailSection title="Shops owned" count={investigation.shops.length}>
                {investigation.shops.length
                  ? investigation.shops.map(shop => (
                    <p key={shop.id} className="truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">
                      {shop.name} · <span className="text-[#8a765d] dark:text-[#9AA1A6]">{shop.reviewStatus}</span>
                    </p>
                  ))
                  : <p className="text-xs text-[#8a765d] dark:text-[#9AA1A6]">No shops.</p>}
              </DetailSection>

              <DetailSection title="Communities owned" count={investigation.communities.length}>
                {investigation.communities.length
                  ? investigation.communities.map(community => (
                    <p key={community.id} className="truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">
                      {community.name} · <span className="text-[#8a765d] dark:text-[#9AA1A6]">{community.visibility}</span>
                    </p>
                  ))
                  : <p className="text-xs text-[#8a765d] dark:text-[#9AA1A6]">No communities.</p>}
              </DetailSection>

              <DetailSection title="Reports against" count={investigation.reportsAgainst.length}>
                {investigation.reportsAgainst.length
                  ? investigation.reportsAgainst.map(report => (
                    <p key={report.id} className="text-xs text-[#5F6861] dark:text-[#AEBAC1]">
                      <span className="font-medium text-[#151A17] dark:text-[#E9EDEF]">{report.reason.replace(/_/g, " ")}</span>
                      {" · "}{report.status} · {formatDate(report.createdAt)}
                    </p>
                  ))
                  : <p className="text-xs text-[#8a765d] dark:text-[#9AA1A6]">Never reported.</p>}
              </DetailSection>

              <DetailSection title="Reports filed" count={investigation.reportsBy.length}>
                {investigation.reportsBy.length
                  ? investigation.reportsBy.map(report => (
                    <p key={report.id} className="truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">
                      {report.targetDomain} · {report.status}
                    </p>
                  ))
                  : <p className="text-xs text-[#8a765d] dark:text-[#9AA1A6]">Has not reported anyone.</p>}
              </DetailSection>
            </div>

            <DetailSection title="Admin actions on this account" count={investigation.auditTrail.length}>
              {investigation.auditTrail.length
                ? investigation.auditTrail.slice(0, 12).map(log => (
                  <div key={log.id} className="rounded-2xl bg-[#8A938D]/8 px-3 py-2">
                    <p className="text-xs font-semibold text-[#151A17] dark:text-[#E9EDEF]">
                      {log.action} · {formatDate(log.createdAt)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#5F6861] dark:text-[#AEBAC1]">
                      {log.adminName || log.adminUserId || "Admin"}: {log.reason ?? "no reason recorded"}
                    </p>
                  </div>
                ))
                : <p className="text-xs text-[#8a765d] dark:text-[#9AA1A6]">No admin has acted on this account.</p>}
            </DetailSection>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AnalyticsPanel({ analytics, loading }: { analytics: AdminAnalytics | undefined; loading: boolean }) {
  if (loading && !analytics) {
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="size-6 animate-spin text-[#D9A441]" />
      </div>
    );
  }
  if (!analytics) {
    return <EmptyState title="Analytics unavailable." copy="Counting requires the Firestore indexes for accountStatus, createdAt, updatedAt, verified, reviewStatus, status and targetDomain." />;
  }

  const domainEntries = Object.entries(analytics.reports.byDomain).sort((a, b) => Number(b[1]) - Number(a[1]));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">People</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total users" value={analytics.users.total} icon={Users} />
          <MetricCard label="Suspended" value={analytics.users.suspended} icon={Ban} />
          <MetricCard label="Banned" value={analytics.users.banned} icon={Ban} />
          <MetricCard label="Verified" value={analytics.users.verified} icon={ShieldCheck} />
          <MetricCard label="New today" value={analytics.users.newToday} icon={Activity} />
          <MetricCard label="New this week" value={analytics.users.newThisWeek} icon={Activity} />
          <MetricCard
            label="Active today"
            value={analytics.users.activeToday}
            icon={Eye}
            hint="Profiles touched in 24h. Not true DAU — there is no lastSeenAt field."
          />
          <MetricCard label="Active this week" value={analytics.users.activeThisWeek} icon={Eye} hint="Profiles touched in 7 days." />
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">Reports</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="All reports" value={analytics.reports.total} icon={Flag} />
          <MetricCard label="New" value={analytics.reports.byStatus.new} icon={Clock} />
          <MetricCard label="Reviewing" value={analytics.reports.byStatus.reviewing} icon={Eye} />
          <MetricCard label="Resolved" value={analytics.reports.byStatus.resolved} icon={Check} />
        </div>
        {domainEntries.length ? (
          <div className="mt-3 rounded-[24px] border border-[#eadfca] bg-white/74 p-4 dark:border-[#26343A] dark:bg-[#111B21]/76">
            <h3 className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">By area</h3>
            <div className="mt-3 space-y-2">
              {domainEntries.map(([domain, count]) => (
                <div key={domain} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#5F6861] dark:text-[#AEBAC1]">{domain.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-[#151A17] dark:text-[#E9EDEF]">{count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">Activity</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Messages today" value={analytics.activity.messagesSentToday} icon={MessageSquareOff} />
          <MetricCard label="Messages this week" value={analytics.activity.messagesSentThisWeek} icon={MessageSquareOff} />
          <MetricCard label="Stories today" value={analytics.activity.storiesPostedToday} icon={Activity} hint="Stories created, not views." />
          <MetricCard label="Stories this week" value={analytics.activity.storiesPostedThisWeek} icon={Activity} />
          <MetricCard
            label="Returning today"
            value={analytics.activity.returningToday}
            icon={RefreshCw}
            hint="Accounts older than 7 days active in the last 24h. Proxy, not a cohort retention rate."
          />
          <MetricCard label="Communities this week" value={analytics.communities.createdThisWeek} icon={Users} />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[#8a765d] dark:text-[#9AA1A6]">
          Message counts cover private conversations and are only visible to roles that can moderate users.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl text-[#151A17] dark:text-[#E9EDEF]">Commerce and communities</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Shops" value={analytics.shops.total} icon={Store} />
          <MetricCard label="Shops pending" value={analytics.shops.pending} icon={Clock} />
          <MetricCard label="Communities" value={analytics.communities.total} icon={Users} />
          <MetricCard label="Communities pending" value={analytics.communities.pending} icon={Clock} />
        </div>
      </section>

      <p className="text-[11px] text-[#8a765d] dark:text-[#9AA1A6]">
        Exact totals from Firestore count aggregation, generated {formatDate(analytics.generatedAt)}. Country figures are self-declared and unverified.
      </p>
    </div>
  );
}

/**
 * Shown to anyone without an admin claim.
 *
 * Previously the console rendered in full with a "layout testing" banner,
 * which meant every non-admin still received the page and its queries. Now
 * the gate is the boundary: no dashboard data is requested at all.
 */
function LockedScreen({ signedIn, onRefresh, refreshing }: { signedIn: boolean; onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="max-w-lg rounded-[32px] border border-[#eadfca] bg-white/76 p-8 text-center shadow-[0_24px_80px_rgba(64,45,20,0.08)] backdrop-blur-2xl dark:border-[#26343A] dark:bg-[#111B21]/78">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#D9A441]/20 text-[#D9A441]">
          <Lock className="size-6" />
        </span>
        <h2 className="mt-5 font-display text-3xl text-[#151A17] dark:text-[#E9EDEF]">Admin access required.</h2>
        <p className="mt-3 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">
          {signedIn
            ? "This account has no admin role in its Firebase token. An existing admin has to grant one before this console will open."
            : "Sign in with an account that carries an admin role."}
        </p>
        {signedIn ? (
          <Button onClick={onRefresh} disabled={refreshing} className="mt-5 rounded-full bg-[#D9A441] text-[#151A17] hover:bg-[#C79333]">
            {refreshing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Refresh access
          </Button>
        ) : null}
        {signedIn ? (
          <p className="mt-3 text-[11px] leading-4 text-[#8a765d] dark:text-[#9AA1A6]">
            Roles ride inside your sign-in token, which is cached for up to an hour. If one was just granted, refreshing fetches a new token without waiting.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AdminConsole({ user }: { user: AppUser }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [userSearch, setUserSearch] = useState("");
  const [reportDomain, setReportDomain] = useState<string>("all");
  const [reportStatus, setReportStatus] = useState<string>("all");
  const [reportSearch, setReportSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [errorSeverity, setErrorSeverity] = useState<AdminErrorSeverity | "all">("all");
  const [errorScope, setErrorScope] = useState<string>("all");
  const [errorSearch, setErrorSearch] = useState("");
  const [unackedOnly, setUnackedOnly] = useState(false);
  const [userStatus, setUserStatus] = useState<string>("all");
  const [userCountry, setUserCountry] = useState<string>("all");
  const [shopSearch, setShopSearch] = useState("");
  const [shopStatus, setShopStatus] = useState<string>("all");
  const [communitySearch, setCommunitySearch] = useState("");
  const [communityStatus, setCommunityStatus] = useState<string>("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditAction, setAuditAction] = useState<string>("all");
  const [contentKind, setContentKind] = useState<string>("all");
  const [contentState, setContentState] = useState<string>("all");
  const [contentSearch, setContentSearch] = useState("");
  const [investigating, setInvestigating] = useState<string | null>(null);

  const dashboard = useAdminDashboard(user);
  const userRows = useAdminUsers(user, userSearch);
  const analytics = useAdminAnalytics(user);
  const mutations = useAdminMutations(user);
  const errorLogs = useAdminErrorLogs(user);
  const acknowledgeError = useAcknowledgeError(user);
  const content = useAdminContent(user);
  const investigation = useUserInvestigation(user, investigating);

  const data = dashboard.data ?? previewDashboard;
  const busy = mutations.updateUserStatus.isPending
    || mutations.updateReportStatus.isPending
    || mutations.updateStorefrontReview.isPending
    || mutations.updateCommunityReview.isPending
    || mutations.setUserRestriction.isPending
    || mutations.setUserVerified.isPending
    || mutations.setContentModeration.isPending
    || mutations.setCommunityVisibility.isPending
    || mutations.setStorefrontRiskFlag.isPending
    || mutations.resolveAppeal.isPending;

  const visibleUsers = userSearch ? userRows.data ?? [] : data?.users ?? [];

  const openReports = useMemo(
    () => (data?.reports ?? []).filter(report => report.status === "new" || report.status === "reviewing"),
    [data?.reports],
  );

  const filteredReports = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase();
    return (data?.reports ?? []).filter(report => {
      if (reportDomain !== "all" && report.targetDomain !== reportDomain) return false;
      if (reportStatus !== "all" && report.status !== reportStatus) return false;
      if (!needle) return true;
      // Target id and reporter id are the useful needles: an admin usually
      // arrives here already knowing *who* or *what* they want to see the
      // reports for, not which category the report used.
      return [report.reason, report.targetDomain, report.targetId, report.reporterUserId, report.detail, report.resolution]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [data?.reports, reportDomain, reportStatus, reportSearch]);

  const pendingShops = useMemo(
    () => (data?.storefronts ?? []).filter(shop => shop.reviewStatus !== "approved" || shop.verificationState !== "verified"),
    [data?.storefronts],
  );
  const pendingCommunities = useMemo(
    () => (data?.communities ?? []).filter(community => community.reviewStatus !== "approved"),
    [data?.communities],
  );

  const allErrorLogs = errorLogs.data ?? [];

  // Derived from the data rather than a hardcoded list, so a new scope added in
  // observability.ts shows up here without anyone remembering to update the
  // console. Sorted by frequency so the noisiest failures are first in the list.
  const errorScopes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of allErrorLogs) {
      counts.set(entry.scope, (counts.get(entry.scope) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([scope]) => scope);
  }, [allErrorLogs]);

  const unacknowledgedErrors = useMemo(
    () => allErrorLogs.filter(entry => !entry.acknowledgedBy),
    [allErrorLogs],
  );

  const filteredErrors = useMemo(() => {
    const needle = errorSearch.trim().toLowerCase();
    return allErrorLogs.filter(entry => {
      if (errorSeverity !== "all" && entry.severity !== errorSeverity) return false;
      if (errorScope !== "all" && entry.scope !== errorScope) return false;
      if (unackedOnly && entry.acknowledgedBy) return false;
      if (!needle) return true;
      // Message, scope and serialised context are all searched: the useful
      // needle is often a value inside context ("storyId", "collection").
      return [entry.message, entry.scope, entry.route, JSON.stringify(entry.context)]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [allErrorLogs, errorSeverity, errorScope, errorSearch, unackedOnly]);

  /** Countries present in the loaded page of users, most-populated first. */
  const userCountries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data?.users ?? []) {
      if (!item.countryCode) continue;
      counts.set(item.countryCode, (counts.get(item.countryCode) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ value: code, label: `${countryNameFor(code)} (${count})` }));
  }, [data?.users]);

  const filteredUsers = useMemo(() => visibleUsers.filter(item => {
    if (userStatus !== "all" && item.accountStatus !== userStatus) return false;
    if (userCountry !== "all" && item.countryCode !== userCountry) return false;
    return true;
  }), [visibleUsers, userStatus, userCountry]);

  const filteredShops = useMemo(() => {
    const needle = shopSearch.trim().toLowerCase();
    return (data?.storefronts ?? []).filter(item => {
      if (shopStatus !== "all" && item.reviewStatus !== shopStatus) return false;
      if (!needle) return true;
      // Owner id is searchable so an admin can jump straight from a suspended
      // account to every shop that account owns.
      return [item.name, item.slug, item.category, item.ownerUserId, item.ownerCity, item.ownerCountryCode]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [data?.storefronts, shopSearch, shopStatus]);

  const filteredCommunities = useMemo(() => {
    const needle = communitySearch.trim().toLowerCase();
    return (data?.communities ?? []).filter(item => {
      if (communityStatus !== "all" && item.reviewStatus !== communityStatus) return false;
      if (!needle) return true;
      return [item.name, item.slug, item.description, item.ownerUserId, item.city, item.countryCode]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [data?.communities, communitySearch, communityStatus]);

  const filteredContent = useMemo(() => {
    const needle = contentSearch.trim().toLowerCase();
    return (content.data ?? []).filter(item => {
      if (contentKind !== "all" && item.kind !== contentKind) return false;
      if (contentState !== "all" && item.moderationState !== contentState) return false;
      if (!needle) return true;
      return [item.title, item.body, item.authorName, item.authorUserId, item.parentName, item.removedReason]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [content.data, contentKind, contentState, contentSearch]);

  /**
   * Actions that actually appear in the log, newest-agnostic and de-duplicated.
   *
   * Derived rather than enumerated: the client builds action names
   * (`user.suspended`, `shop.approved`, `report.resolved`) in many places, and
   * a hand-written list would fall behind the first new mutation added.
   */
  const auditActions = useMemo(() => {
    const seen = new Set<string>();
    for (const log of data?.auditLogs ?? []) {
      if (log.action) seen.add(log.action);
    }
    return Array.from(seen).sort().map(value => ({ value, label: value.replace(/[._]/g, " ") }));
  }, [data?.auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const needle = auditSearch.trim().toLowerCase();
    return (data?.auditLogs ?? []).filter(log => {
      if (auditAction !== "all" && log.action !== auditAction) return false;
      if (!needle) return true;
      // Searching the reason matters most: "why was this person suspended" is
      // the question an admin actually has when they open this tab.
      return [log.action, log.adminName, log.adminUserId, log.targetId, log.targetType, log.reason, log.detail]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(needle));
    });
  }, [data?.auditLogs, auditAction, auditSearch]);

  /**
   * Opens the confirmation dialog for an action, unless this account's role
   * cannot perform it — in which case say so immediately rather than letting
   * the admin fill the form and be refused by the server.
   */
  const request = useCallback((action: Omit<PendingAction, "key">) => {
    setPending({ ...action, key: `${action.target}:${action.confirmLabel}:${Date.now()}` });
  }, []);

  const guard = useCallback((permission: Parameters<typeof canPerform>[1]) => {
    if (canPerform(user, permission)) return true;
    toast.error(`${adminRoleLabels[user.adminRole ?? "analyst"]} accounts cannot do that.`);
    return false;
  }, [user]);

  const runStatus = useCallback((item: AdminUserRow, status: AdminAccountStatus) => {
    if (!guard("user.moderate")) return;
    request({
      title: status === "active" ? "Restore account" : status === "banned" ? "Ban account" : "Suspend account",
      description: status === "active"
        ? "This returns the account to normal access."
        : status === "banned"
          ? "Permanent removal. The user will be signed out and unable to return."
          : "The user stays signed in but loses access until restored.",
      target: `${item.name || item.username || item.id} (${item.id})`,
      confirmLabel: status === "active" ? "Restore" : status === "banned" ? "Ban" : "Suspend",
      danger: status !== "active",
      requireResolution: false,
      run: async reason => {
        await mutations.updateUserStatus.mutateAsync({ userId: item.id, status, reason });
        toast.success(`Account set to ${status}.`, {
          // Undo is offered only where it is genuinely reversible: flipping a
          // status back. The inverse still writes an audit entry, prefixed so
          // the pair is traceable — an undo is not a way to act off the record.
          action: {
            label: "Undo",
            onClick: () => mutations.updateUserStatus.mutateAsync({
              userId: item.id,
              status: item.accountStatus,
              reason: `Undo of "${status}" action`,
            }).then(() => toast.success("Reverted.")).catch(error => toast.error(error instanceof Error ? error.message : "Revert failed")),
          },
        });
      },
    });
  }, [guard, mutations.updateUserStatus, request]);

  const runRestriction = useCallback((item: AdminUserRow, field: "messagingRestricted" | "postingRestricted", value: boolean) => {
    if (!guard("user.moderate")) return;
    const label = field === "messagingRestricted" ? "messaging" : "posting";
    request({
      title: `${value ? "Restrict" : "Allow"} ${label}`,
      description: `This ${value ? "blocks" : "restores"} ${label === "messaging" ? "starting new conversations" : "publishing stories and community posts"} for this account.`,
      target: `${item.name || item.username || item.id} (${item.id})`,
      confirmLabel: value ? `Restrict ${label}` : `Allow ${label}`,
      danger: value,
      requireResolution: false,
      run: async reason => {
        await mutations.setUserRestriction.mutateAsync({ userId: item.id, field, value, reason });
        toast.success(`${label} ${value ? "restricted" : "allowed"}.`);
      },
    });
  }, [guard, mutations.setUserRestriction, request]);

  const runVerify = useCallback((item: AdminUserRow, verified: boolean) => {
    if (!guard("user.moderate")) return;
    request({
      title: verified ? "Verify account" : "Remove verification",
      description: "A verified badge is a trust signal shown to other people on the platform.",
      target: `${item.name || item.username || item.id} (${item.id})`,
      confirmLabel: verified ? "Verify" : "Unverify",
      danger: !verified,
      requireResolution: false,
      run: async reason => {
        await mutations.setUserVerified.mutateAsync({ userId: item.id, verified, reason });
        toast.success(verified ? "Account verified." : "Verification removed.");
      },
    });
  }, [guard, mutations.setUserVerified, request]);

  const runReport = useCallback((item: AdminSafetyReport, status: AdminReportStatus) => {
    if (!guard("report.triage")) return;
    const closing = status === "resolved" || status === "dismissed";
    request({
      title: closing ? `Mark report ${status}` : status === "new" ? "Reopen report" : "Start review",
      description: `${item.reason.replace(/_/g, " ")} report against ${item.targetDomain}.`,
      target: `${item.targetDomain} ${item.targetId || "unknown"}`,
      confirmLabel: closing ? status === "resolved" ? "Resolve" : "Dismiss" : status === "new" ? "Reopen" : "Review",
      danger: status === "dismissed",
      requireResolution: closing,
      run: async (reason, resolution) => {
        await mutations.updateReportStatus.mutateAsync({ reportId: item.id, status, reason, resolution });
        toast.success(`Report marked ${status}.`);
      },
    });
  }, [guard, mutations.updateReportStatus, request]);

  const runStorefront = useCallback((item: AdminStorefrontRow, status: AdminReviewStatus) => {
    if (!guard("shop.review")) return;
    request({
      title: `${status === "approved" ? "Approve" : status === "paused" ? "Pause" : "Reject"} shop`,
      description: "Approving also marks the business as verified; rejecting does the opposite.",
      target: `${item.name} (${item.id})`,
      confirmLabel: status === "approved" ? "Approve" : status === "paused" ? "Pause" : "Reject",
      danger: status === "rejected",
      requireResolution: status === "rejected",
      run: async (reason, resolution) => {
        await mutations.updateStorefrontReview.mutateAsync({ storefrontId: item.id, status, reason, detail: resolution });
        toast.success(`Shop ${status}.`);
      },
    });
  }, [guard, mutations.updateStorefrontReview, request]);

  const runCommunity = useCallback((item: AdminCommunityRow, status: AdminReviewStatus) => {
    if (!guard("community.review")) return;
    request({
      title: `${status === "approved" ? "Approve" : status === "paused" ? "Pause" : "Reject"} community`,
      description: "Pausing hides the community from discovery while keeping its content intact.",
      target: `${item.name} (${item.id})`,
      confirmLabel: status === "approved" ? "Approve" : status === "paused" ? "Pause" : "Reject",
      danger: status === "rejected",
      requireResolution: status === "rejected",
      run: async (reason, resolution) => {
        await mutations.updateCommunityReview.mutateAsync({ communityId: item.id, status, reason, detail: resolution });
        toast.success(`Community ${status}.`);
      },
    });
  }, [guard, mutations.updateCommunityReview, request]);

  const runContent = useCallback((item: AdminContentRow, state: AdminModerationState) => {
    if (!guard("content.remove")) return;
    const removing = state === "removed";
    request({
      title: removing ? "Remove content" : "Restore content",
      description: removing
        ? "The content is flagged as removed and stops being served. It is not deleted, so an appeal still has something to review."
        : "The content becomes visible again and the previous removal reason is cleared.",
      target: `${item.kind.replace(/([A-Z])/g, " $1").toLowerCase()} ${item.id}`,
      confirmLabel: removing ? "Remove" : "Restore",
      danger: removing,
      requireResolution: false,
      run: async reason => {
        await mutations.setContentModeration.mutateAsync({ item, state, reason });
        toast.success(removing ? "Content removed." : "Content restored.");
      },
    });
  }, [guard, mutations.setContentModeration, request]);

  const runVisibility = useCallback((item: AdminCommunityRow, visibility: "public" | "private" | "unlisted") => {
    if (!guard("community.review")) return;
    if (visibility === item.visibility) return;
    request({
      title: `Set visibility to ${visibility}`,
      description: "Changes who can discover this community. Approving or pausing it is a separate decision.",
      target: `${item.name} (${item.id})`,
      confirmLabel: "Change visibility",
      danger: false,
      requireResolution: false,
      run: async reason => {
        await mutations.setCommunityVisibility.mutateAsync({
          communityId: item.id,
          visibility,
          currentReviewStatus: item.reviewStatus,
          reason,
        });
        toast.success(`Community is now ${visibility}.`);
      },
    });
  }, [guard, mutations.setCommunityVisibility, request]);

  const runRiskFlag = useCallback((item: AdminStorefrontRow, flagged: boolean) => {
    if (!guard("shop.review")) return;
    request({
      title: flagged ? "Flag shop as suspicious" : "Clear suspicious flag",
      description: "An internal marker for other admins. It does not change what buyers see or whether the shop is approved.",
      target: `${item.name} (${item.id})`,
      confirmLabel: flagged ? "Flag shop" : "Clear flag",
      danger: flagged,
      requireResolution: flagged,
      run: async (reason, resolution) => {
        await mutations.setStorefrontRiskFlag.mutateAsync({
          storefrontId: item.id,
          flagged,
          currentReviewStatus: item.reviewStatus,
          currentVerificationState: item.verificationState,
          reason,
          detail: resolution,
        });
        toast.success(flagged ? "Shop flagged for review." : "Flag cleared.");
      },
    });
  }, [guard, mutations.setStorefrontRiskFlag, request]);

  const runAppeal = useCallback((target: AdminUserRow, status: "upheld" | "overturned", note: string) => {
    if (!guard("user.moderate")) return;
    request({
      title: status === "overturned" ? "Overturn appeal" : "Uphold appeal",
      description: status === "overturned"
        ? "Records the appeal as successful and returns the account to normal access."
        : "Records the appeal as rejected. The account stays restricted.",
      target: `${target.name || target.username || target.id} (${target.id})`,
      confirmLabel: status === "overturned" ? "Overturn" : "Uphold",
      danger: status === "upheld",
      requireResolution: false,
      run: async reason => {
        await mutations.resolveAppeal.mutateAsync({ userId: target.id, status, note, reason });
        toast.success(status === "overturned" ? "Appeal overturned." : "Appeal upheld.");
      },
    });
  }, [guard, mutations.resolveAppeal, request]);

  return (
    <div className="savanna-route-admin space-y-6 pb-24">
      <header className="flex flex-col gap-5 rounded-[32px] border border-[#eadfca] bg-white/72 p-5 shadow-[0_24px_80px_rgba(64,45,20,0.08)] backdrop-blur-2xl dark:border-[#26343A] dark:bg-[#111B21]/76 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#D9A441]/20 px-3 py-1.5 text-xs font-semibold text-[#D9A441]">
            <ShieldCheck className="size-4" /> Admin
          </span>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight text-[#151A17] dark:text-[#E9EDEF] sm:text-5xl">Savanna control room.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">Moderate reports, review public spaces, watch platform health, and keep an audit trail of every admin move.</p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="rounded-2xl bg-[#D9A441]/20 px-4 py-3 text-sm font-semibold text-[#D9A441]">
            {user?.adminRole ? adminRoleLabels[user.adminRole] : "Preview mode"}
          </div>
          {!canWriteAdmin(user) ? (
            <p className="rounded-full bg-[#8A938D]/10 px-3 py-1.5 text-[11px] font-semibold text-[#5F6861] dark:text-[#AEBAC1]">
              Read-only role — actions are disabled
            </p>
          ) : null}
        </div>
      </header>

      <AdminCountryMap users={data.users} />

      <nav className="savanna-admin-tabs flex gap-2 overflow-x-auto pb-1" aria-label="Admin sections">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            data-active={activeTab === tab.id}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              activeTab === tab.id ? "bg-[#D9A441]/20 text-[#D9A441]" : "bg-white/72 text-[#5F6861] hover:bg-[#D9A441]/10 dark:bg-[#111B21]/72 dark:text-[#AEBAC1]",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {dashboard.isLoading ? (
        <div className="grid min-h-64 place-items-center">
          <Loader2 className="size-6 animate-spin text-[#D9A441]" />
        </div>
      ) : dashboard.error ? (
        <EmptyState title="Admin data could not load." copy="Check that this account has an admin custom claim, then confirm the Firestore rules were deployed." />
      ) : null}

      {activeTab === "overview" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricCard label="Users tracked" value={data.users.length} icon={Users} hint="Most recently updated page" />
            <MetricCard label="Open reports" value={openReports.length} icon={Flag} />
            <MetricCard label="Shops to review" value={pendingShops.length} icon={Store} />
            <MetricCard label="Communities" value={data.communities.length} icon={Activity} />
            {/* Errors sit alongside the moderation counts on purpose: a spike
                here is the first sign that a deploy broke something, and it
                should be visible without hunting for the Errors tab. */}
            <MetricCard
              label="Unseen errors"
              value={unacknowledgedErrors.length}
              icon={Bug}
              hint={errorLogs.isLoading ? "loading" : "last 150 reported"}
            />
          </section>
          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <article className="rounded-[28px] border border-[#eadfca] bg-white/74 p-5 dark:border-[#26343A] dark:bg-[#111B21]/76">
              <h2 className="font-display text-3xl text-[#151A17] dark:text-[#E9EDEF]">Today’s attention</h2>
              <div className="mt-4 space-y-3">
                {openReports.slice(0, 3).map(report => (
                  <ReportRow key={report.id} item={report} disabled={busy} onStatus={status => runReport(report, status)} />
                ))}
                {!openReports.length ? <EmptyState title="No open reports." copy="The safety queue is quiet right now." /> : null}
              </div>
            </article>
            <article className="rounded-[28px] border border-[#eadfca] bg-white/74 p-5 dark:border-[#26343A] dark:bg-[#111B21]/76">
              <h2 className="font-display text-3xl text-[#151A17] dark:text-[#E9EDEF]">System health</h2>
              <div className="mt-4 space-y-2">
                {Object.entries(data.health).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-2xl bg-[#D9A441]/10 px-3 py-2 text-sm">
                    <span className="capitalize text-[#5F6861] dark:text-[#AEBAC1]">{key.replace(/([A-Z])/g, " $1")}</span>
                    <StatusPill status={value ? "approved" : "pending"}>{value ? "ready" : "needs setup"}</StatusPill>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {activeTab === "users" ? (
        <section className="space-y-4">
          <FilterBar>
            <SearchField
              value={userSearch}
              onChange={setUserSearch}
              label="Search users"
              placeholder="Search users, @username, email, phone, or city"
            />
            <FilterSelect
              value={userStatus}
              onChange={setUserStatus}
              label="Account status"
              options={optionsFor(accountStatuses)}
              widthClass="sm:w-44"
            />
            <FilterSelect
              value={userCountry}
              onChange={setUserCountry}
              label="Country"
              options={[ANY, ...userCountries]}
              widthClass="sm:w-52"
            />
          </FilterBar>
          <div className="space-y-3">
            {filteredUsers.map(item => (
              <UserRow
                key={item.id}
                item={item}
                disabled={busy || !canPerform(user, "user.moderate")}
                onStatus={status => runStatus(item, status)}
                onRestriction={(field, value) => runRestriction(item, field, value)}
                onVerify={verified => runVerify(item, verified)}
                onInspect={() => setInvestigating(item.id)}
              />
            ))}
            {!filteredUsers.length ? (
              <EmptyState
                title="No users found."
                copy={userSearch || userStatus !== "all" || userCountry !== "all"
                  ? "No account matches these filters. Try clearing one."
                  : "Try a different username, email, phone, city, or Firebase UID."}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "reports" ? (
        <section className="space-y-4">
          <FilterBar>
            <SearchField
              value={reportSearch}
              onChange={setReportSearch}
              label="Search reports"
              placeholder="Search by reason, target id, or reporter id"
            />
            <FilterSelect
              value={reportDomain}
              onChange={setReportDomain}
              label="Area"
              options={optionsFor(reportDomains)}
              widthClass="sm:w-52"
            />
            <FilterSelect
              value={reportStatus}
              onChange={setReportStatus}
              label="Status"
              options={optionsFor(reportStatuses)}
              widthClass="sm:w-44"
            />
          </FilterBar>
          <div className="space-y-3">
            {filteredReports.map(report => (
              <ReportRow key={report.id} item={report} disabled={busy} onStatus={status => runReport(report, status)} />
            ))}
            {!filteredReports.length ? (
              <EmptyState
                title="No reports match."
                copy={reportDomain === "all" && reportStatus === "all" && !reportSearch
                  ? "When users flag profiles, stories, shops, messages, or payments, they will land here."
                  : "Try clearing the area or status filter."}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "content" ? (
        <section className="space-y-4">
          <FilterBar>
            <SearchField
              value={contentSearch}
              onChange={setContentSearch}
              label="Search content"
              placeholder="Search text, author, or community"
            />
            <FilterSelect
              value={contentKind}
              onChange={setContentKind}
              label="Type"
              options={optionsFor(contentKinds, value => value.replace(/([A-Z])/g, " $1").toLowerCase())}
              widthClass="sm:w-48"
            />
            <FilterSelect
              value={contentState}
              onChange={setContentState}
              label="Moderation"
              options={[ANY, { value: "visible", label: "visible" }, { value: "removed", label: "removed" }]}
              widthClass="sm:w-44"
            />
          </FilterBar>
          {content.isLoading ? (
            <div className="grid min-h-48 place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div>
          ) : content.error ? (
            <EmptyState
              title="Content could not load."
              copy={isPermissionError(content.error)
                ? "The rules deny reading one of the content collections for this account."
                : "A collection-group index for community posts may still be building."}
            />
          ) : (
            <div className="space-y-3">
              {filteredContent.map(item => (
                <ContentRow
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  disabled={busy || !canPerform(user, "content.remove")}
                  onModerate={state => runContent(item, state)}
                />
              ))}
              {!filteredContent.length ? (
                <EmptyState
                  title="No content matches."
                  copy={content.data?.length
                    ? "Try clearing the type or moderation filter."
                    : "Stories, community posts and product listings appear here once people publish them."}
                />
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "shops" ? (
        <section className="space-y-4">
          <FilterBar>
            <SearchField
              value={shopSearch}
              onChange={setShopSearch}
              label="Search shops"
              placeholder="Search shop name, slug, category, owner id, or city"
            />
            <FilterSelect
              value={shopStatus}
              onChange={setShopStatus}
              label="Review status"
              options={optionsFor(reviewStatuses)}
              widthClass="sm:w-44"
            />
          </FilterBar>
          <div className="space-y-3">
            {filteredShops.map(shop => (
              <ReviewRow
                key={shop.id}
                item={shop}
                kind="shop"
                disabled={busy}
                flagged={shop.riskFlag === "suspicious"}
                onStatus={status => runStorefront(shop, status)}
                onRiskFlag={canPerform(user, "shop.review") ? flagged => runRiskFlag(shop, flagged) : undefined}
              />
            ))}
            {!filteredShops.length ? (
              <EmptyState
                title="No shops match."
                copy={data.storefronts.length
                  ? "Try clearing the search or status filter."
                  : "Business pages and product catalogs will appear here for review."}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "communities" ? (
        <section className="space-y-4">
          <FilterBar>
            <SearchField
              value={communitySearch}
              onChange={setCommunitySearch}
              label="Search communities"
              placeholder="Search community name, slug, description, or owner id"
            />
            <FilterSelect
              value={communityStatus}
              onChange={setCommunityStatus}
              label="Review status"
              options={optionsFor(reviewStatuses)}
              widthClass="sm:w-44"
            />
          </FilterBar>
          <div className="space-y-3">
            {filteredCommunities.map(community => (
              <ReviewRow
                key={community.id}
                item={community}
                kind="community"
                disabled={busy}
                onStatus={status => runCommunity(community, status)}
                onVisibility={canPerform(user, "community.review") ? visibility => runVisibility(community, visibility) : undefined}
              />
            ))}
            {!filteredCommunities.length ? (
              <EmptyState
                title="No communities match."
                copy={data.communities.length
                  ? "Try clearing the search or status filter."
                  : "Public and private communities will appear here as people create them."}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "audit" ? (
        <section className="space-y-4">
          <FilterBar>
            <SearchField
              value={auditSearch}
              onChange={setAuditSearch}
              label="Search audit log"
              placeholder="Search action, admin, target, or reason"
            />
            <FilterSelect
              value={auditAction}
              onChange={setAuditAction}
              label="Action"
              options={[ANY, ...auditActions]}
              widthClass="sm:w-56"
            />
          </FilterBar>
          <div className="space-y-3">
            {filteredAuditLogs.map(log => <AuditRow key={log.id} log={log} />)}
            {!filteredAuditLogs.length ? (
              <EmptyState
                title="No audit events match."
                copy={data.auditLogs.length
                  ? "Try clearing the search or action filter."
                  : "Admin actions will be written here so sensitive changes have a trail."}
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "errors" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#D85C5C]/12 px-3 py-1.5 text-xs font-semibold text-[#D85C5C]">
              {unacknowledgedErrors.length} unseen
            </span>
            <span className="text-xs text-[#5F6861] dark:text-[#AEBAC1]">
              {allErrorLogs.length} in the last window · refreshes every 30s
            </span>
          </div>

          <label className="savanna-route-search flex h-12 items-center gap-3 rounded-2xl border border-[#DDE3DC] bg-white/76 px-4 dark:border-[#26343A] dark:bg-[#23282C]">
            <Search className="size-4 text-[#5F6861] dark:text-[#AEBAC1]" />
            <Input
              value={errorSearch}
              onChange={event => setErrorSearch(event.target.value)}
              placeholder="Search message, scope, route or context values"
              className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-none focus-visible:ring-0"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <Select value={errorSeverity} onValueChange={value => setErrorSeverity(value as AdminErrorSeverity | "all")}>
              <SelectTrigger className="h-12 rounded-2xl border-[#DDE3DC] dark:border-[#26343A] sm:w-44"><SelectValue placeholder="All severities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={errorScope} onValueChange={setErrorScope}>
              <SelectTrigger className="h-12 rounded-2xl border-[#DDE3DC] dark:border-[#26343A] sm:w-56"><SelectValue placeholder="All scopes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                {errorScopes.map(scope => (
                  <SelectItem key={scope} value={scope}>{scope}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUnackedOnly(value => !value)}
              data-active={unackedOnly}
              className={cn(
                "h-12 rounded-2xl px-4 text-sm font-semibold",
                unackedOnly ? "bg-[#D9A441]/20 text-[#D9A441]" : "bg-white/76 text-[#5F6861] dark:bg-[#23282C] dark:text-[#AEBAC1]",
              )}
            >
              Unseen only
            </Button>
          </div>

          {errorLogs.isLoading ? (
            <div className="grid min-h-48 place-items-center"><Loader2 className="size-6 animate-spin text-[#D9A441]" /></div>
          ) : errorLogs.error ? (
            <EmptyState
              title="Error log unavailable."
              copy={isPermissionError(errorLogs.error)
                ? "The rules deny reading errorLogs for this account. Deploy the latest firestore.rules."
                : "The query failed. This usually means the errorLogs collection needs a createdAt index."}
            />
          ) : (
            <div className="space-y-3">
              {filteredErrors.map(entry => (
                <ErrorLogRow
                  key={entry.id}
                  entry={entry}
                  acknowledging={acknowledgeError.isPending}
                  onAcknowledge={() => acknowledgeError.mutate(entry.id, {
                    onError: error => toast.error(error instanceof Error ? error.message : "Could not mark as seen"),
                  })}
                />
              ))}
              {!filteredErrors.length ? (
                <EmptyState
                  title="No errors match."
                  copy={allErrorLogs.length
                    ? "Try clearing a filter."
                    : "Nothing has been reported yet. Client failures, failed admin actions and model load problems land here."}
                />
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "analytics" ? (
        <section>
          <AnalyticsPanel analytics={analytics.data} loading={analytics.isLoading} />
        </section>
      ) : null}

      <ReasonDialog action={pending} onClose={() => setPending(null)} />

      {investigating ? (
        // Keyed on the account id so opening a second user remounts the drawer
        // with fresh state — otherwise the appeal note typed for one person
        // would still be sitting in the box for the next.
        <InvestigationDrawer
          key={investigating}
          investigation={investigation.data ?? undefined}
          loading={investigation.isLoading}
          busy={busy}
          canModerate={canPerform(user, "user.moderate")}
          onClose={() => setInvestigating(null)}
          onStatus={status => {
            const target = investigation.data?.user;
            if (target) runStatus(target, status);
          }}
          onAppeal={(status, note) => {
            const target = investigation.data?.user;
            if (target) runAppeal(target, status, note);
          }}
        />
      ) : null}
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Custom claims live in the ID token, which the SDK caches for roughly
      // an hour. Forcing a new one is the only way an admin whose role was
      // granted a minute ago can get in without waiting out the cache.
      const refreshed = await reloadAdminClaim();
      if (refreshed && canAccessAdmin(refreshed)) {
        toast.success("Admin access confirmed.");
        window.location.reload();
        return;
      }
      toast.error("Still no admin role on this account.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh access");
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <SavannaShell>
      {loading ? (
        <div className="grid min-h-[60vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-[#D9A441]" />
        </div>
      ) : !canAccessAdmin(user) ? (
        <LockedScreen signedIn={Boolean(user)} onRefresh={refresh} refreshing={refreshing} />
      ) : (
        <AdminConsole user={user!} />
      )}
    </SavannaShell>
  );
}
