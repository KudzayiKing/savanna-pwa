import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ConnectionPill,
  InstallSavannaButton,
  PwaStatusBanner,
} from "@/components/PwaExperience";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileStoriesHeader } from "@/components/StoriesPanel";
import { startPresenceSession } from "@/lib/firebasePresence";
import {
  AnimatedPlusIcon,
  MessageCircleMoreIcon,
  MobileNavIcon,
  type MobileNavIconName,
} from "@/components/AnimatedNavIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Command,
  LogOut,
  Package,
  PenLine,
  Search,
  Store,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

const navigation = [
  { href: "/messages", label: "Messages" },
  { href: "/shops", label: "Services" },
  { href: "/stories", label: "Stories" },
  { href: "/communities", label: "Communities" },
];

const mobileNavigation = navigation;
const iconRailRoutes = ["/messages", "/shops", "/stories", "/communities", "/orders", "/profile", "/people", "/admin"];

function routeMatches(location: string, href: string) {
  return location === href || location.startsWith(`${href}/`);
}

/**
 * Creator destinations. Every entry navigates somewhere real — this menu
 * deliberately stays short rather than listing flows that do not exist yet
 * (there is no reachable "new community" or "new chat" entry point outside the
 * Messages drawer, which is internal state the shell cannot open).
 */
const creatorItems = [
  {
    label: "New story",
    href: "/stories?compose=1",
    hint: "Photo, text or product",
    icon: PenLine,
  },
  {
    label: "New shop",
    href: "/shops/manage",
    hint: "Merchant studio",
    icon: Store,
  },
] as const;

const accountItems = [
  { label: "Profile", href: "/profile", icon: UserRound },
  { label: "Orders", href: "/orders", icon: Package },
] as const;

const menuContentClassName =
  "w-64 rounded-2xl border border-[#eadfca] bg-[#fffaf0] p-1.5 shadow-[0_18px_40px_rgba(49,34,12,0.18)] dark:border-[#3a2f1f] dark:bg-[#221a12]";

const menuItemClassName =
  "cursor-pointer gap-3 rounded-xl px-3 py-2.5 text-sm text-[#4a3c28] outline-none data-[highlighted]:bg-[#f1dfbf] data-[highlighted]:text-[#5d3a0c] dark:text-[#e8dcc6] dark:data-[highlighted]:bg-[#D9A441]/25 dark:data-[highlighted]:text-[#f7e6c8]";

const menuLabelClassName =
  "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a08a67] dark:text-[#8f7c5f]";

function CreatorMenu({
  trigger,
  side = "top",
  align = "start",
}: {
  trigger: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "end";
}) {
  const [, navigate] = useLocation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={8}
        className={menuContentClassName}
      >
        <DropdownMenuLabel className={menuLabelClassName}>
          Create
        </DropdownMenuLabel>
        {creatorItems.map(item => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.href}
              className={menuItemClassName}
              onSelect={() => navigate(item.href)}
            >
              <Icon className="size-4 shrink-0 text-[#8a765d] dark:text-[#a9977a]" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.label}
              </span>
              <span className="shrink-0 text-[11px] text-[#a08a67] dark:text-[#8f7c5f]">
                {item.hint}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu({ trigger }: { trigger: ReactNode }) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className={menuContentClassName}
      >
        <DropdownMenuLabel className={menuLabelClassName}>
          Your account
        </DropdownMenuLabel>
        {accountItems.map(item => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.href}
              className={menuItemClassName}
              onSelect={() => navigate(item.href)}
            >
              <Icon className="size-4 shrink-0 text-[#8a765d] dark:text-[#a9977a]" />
              <span className="font-medium">{item.label}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="my-1 bg-[#eadfca] dark:bg-[#3a2f1f]" />
        <DropdownMenuItem
          className={menuItemClassName}
          onSelect={() => {
            void logout().then(
              () => toast.success("Signed out"),
              (error: unknown) =>
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Could not sign out"
                )
            );
          }}
        >
          <LogOut className="size-4 shrink-0 text-[#8a765d] dark:text-[#a9977a]" />
          <span className="font-medium">Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function triggerMobileHaptic() {
  const isMobile =
    window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
  if (isMobile && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

type SavannaShellProps = {
  children: ReactNode;
  context?: ReactNode;
  /**
   * Skips the persistent chrome (mobile header with Stories and the bottom
   * nav) for immersive full-screen routes such as an open conversation. The
   * chrome itself is unchanged - it is simply not mounted.
   */
  hideChrome?: boolean;
  hideMobileHeader?: boolean;
  hideDesktopHeader?: boolean;
};

export function SavannaShell({
  children,
  context,
  hideChrome = false,
  hideMobileHeader = false,
  hideDesktopHeader = false,
}: SavannaShellProps) {
  const [location] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const isMessagesWorkspace = location === "/messages";
  const usesIconRail = iconRailRoutes.some(route => routeMatches(location, route));
  const profileNavActive = routeMatches(location, "/profile") || routeMatches(location, "/people");
  const suppressMobileStoriesHeader = routeMatches(location, "/communities");
  const profileAvatarUrl = user?.photoURL ?? null;

  // Broadcast the viewer's presence (online while the tab is visible, offline
  // on hide/unload). Fire-and-forget; presence is best-effort and the stop
  // function marks offline on unmount.
  useEffect(() => {
    if (!user) return;
    const stop = startPresenceSession(user);
    return () => stop();
  }, [user?.id]);

  return (
    <div className="savanna-app min-h-screen bg-[#fcfaf4] text-[#2c2114]">
      <a className="skip-link" href="#savanna-main">
        Skip to content
      </a>

      <PwaStatusBanner />

      {hideChrome || hideMobileHeader || suppressMobileStoriesHeader ? null : <MobileStoriesHeader />}

      <div
        className={cn(
          "mx-auto flex min-h-screen",
          isMessagesWorkspace
            ? "lg:h-screen lg:min-h-0 lg:max-h-screen lg:overflow-hidden"
            : "",
          usesIconRail ? "max-w-none" : "max-w-[1720px]"
        )}
      >
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col lg:flex",
            usesIconRail
              ? "savanna-message-rail w-[84px] items-center border-r px-3 py-5"
              : "w-[248px] border-r border-[#eadfca] bg-[#f6f0e2] px-4 py-7"
          )}
        >
          {usesIconRail ? (
            <>
              <Link
                href="/messages"
                aria-label="Savanna"
                className="group mb-5 flex size-11 shrink-0 items-center justify-center text-[#151A17] dark:text-white"
              >
                <MessageCircleMoreIcon
                  className="savanna-rail-message-icon"
                  size={34}
                />
              </Link>
              <nav
                aria-label="Primary navigation"
                className="flex flex-1 flex-col items-center gap-3"
              >
                {navigation.map(item => {
                  const active = routeMatches(location, item.href);
                  return (
                    <Link
                      href={item.href}
                      key={item.href}
                      title={item.label}
                      aria-label={item.label}
                      className={cn(
                        "grid size-11 place-items-center rounded-2xl transition-all duration-200",
                        active
                          ? "bg-[#D9A441]/20 text-[#A87820] dark:text-[#D9A441]"
                          : "text-[#8a765d]"
                      )}
                    >
                      {item.label === "Profile" && profileAvatarUrl ? (
                        <img
                          src={profileAvatarUrl}
                          alt=""
                          className="size-7 rounded-full object-cover"
                        />
                      ) : (
                        <MobileNavIcon
                          name={item.label as MobileNavIconName}
                          active={active}
                          size={22}
                        />
                      )}
                      <span className="sr-only">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-auto">
                <Link
                  href="/profile"
                  title="Your profile"
                  aria-label="Open your profile"
                  className={cn(
                    "grid size-11 place-items-center rounded-2xl transition-colors hover:bg-[#D9A441]/10",
                    profileNavActive ? "bg-[#D9A441]/20 text-[#D9A441]" : ""
                  )}
                >
                  {profileAvatarUrl ? (
                    <img
                      src={profileAvatarUrl}
                      alt=""
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-full bg-[#f3ddb2] text-sm font-semibold text-[#7b4a0d] dark:bg-[#D9A441]/20 dark:text-[#D9A441]">
                      {user?.name?.trim()?.[0]?.toUpperCase() || "S"}
                    </span>
                  )}
                </Link>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/"
                aria-label="Savanna home"
                className="mb-11 px-3 text-[32px]"
              >
                <span className="savanna-wordmark">Savanna</span>
              </Link>

              <nav aria-label="Primary navigation" className="space-y-1">
                {navigation.map(item => {
                  const active = routeMatches(location, item.href);
                  return (
                    <Link
                      href={item.href}
                      key={item.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium transition-all duration-200",
                        active
                          ? "bg-[#5d3a0c] text-white shadow-[0_10px_25px_rgba(93,58,12,0.18)]"
                          : "text-[#695c4a] hover:bg-[#f1dfbf] hover:text-[#5d3a0c]"
                      )}
                    >
                      {item.label === "Profile" && profileAvatarUrl ? (
                        <img
                          src={profileAvatarUrl}
                          alt=""
                          className="size-6 rounded-full object-cover"
                        />
                      ) : (
                        <MobileNavIcon
                          name={item.label as MobileNavIconName}
                          active={active}
                          size={21}
                        />
                      )}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-4">
                <CreatorMenu
                  trigger={
                    <Button
                      className="savanna-brand-token h-12 w-full rounded-2xl shadow-none"
                      aria-label="Open creator menu"
                    >
                      <AnimatedPlusIcon size={16} className="mr-2" /> Create
                    </Button>
                  }
                />
                <InstallSavannaButton />
                <AccountMenu
                  trigger={
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-[#f1dfbf]"
                      aria-label="Open account menu"
                    >
                      <span className="grid size-10 place-items-center rounded-2xl bg-[#f3ddb2] font-semibold text-[#7b4a0d]">
                        S
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#3d2d1a]">
                          Your Savanna
                        </span>
                        <span className="block truncate text-xs text-[#8a765d]">
                          Personal account
                        </span>
                      </span>
                      <ChevronDown className="size-4 text-[#71806d]" />
                    </button>
                  }
                />
                <ConnectionPill />
              </div>
            </>
          )}
        </aside>

        <section
          className={cn(
            "min-w-0 flex-1",
            isMessagesWorkspace
              ? "lg:h-screen lg:min-h-0 lg:overflow-hidden"
              : "",
            hideChrome ? "" : "pb-10 lg:pb-0"
          )}
        >
          {!hideDesktopHeader && !usesIconRail ? (
            <div className="savanna-glass-header hidden h-[76px] items-center justify-between border-b border-[#eadfca]/70 bg-[#fcfaf4]/72 px-7 backdrop-blur-xl lg:flex xl:px-10">
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="group flex h-10 w-[min(440px,42vw)] items-center gap-3 rounded-xl border border-[#d7ddd0] bg-white/65 px-3 text-left text-sm text-[#7a8276] shadow-[0_4px_12px_rgba(39,54,37,0.035)] transition-colors hover:border-[#b7c5b4]"
                aria-label="Open search and command menu"
              >
                <Search className="size-4" />
                <span className="flex-1">Search Savanna</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-[#eef0e8] px-1.5 py-1 font-mono text-[10px] text-[#687462]">
                  <Command className="size-3" /> K
                </span>
              </button>
              <div className="flex items-center gap-2">
                <CreatorMenu
                  side="bottom"
                  align="end"
                  trigger={
                    <Button className="savanna-brand-token rounded-xl px-4 shadow-none">
                      <AnimatedPlusIcon size={16} className="mr-1.5" /> Create
                    </Button>
                  }
                />
              </div>
            </div>
          ) : null}

          <main
            id="savanna-main"
            className={cn(
              isMessagesWorkspace
                ? "min-h-screen p-0 lg:h-screen lg:min-h-0 lg:overflow-hidden"
                : usesIconRail
                  ? "min-h-[calc(100vh-76px)] px-4 py-5 sm:px-6 lg:min-h-screen lg:px-7 lg:py-8 xl:px-10"
                  : "min-h-[calc(100vh-76px)] px-4 py-5 sm:px-6 lg:px-7 lg:py-8 xl:px-10"
            )}
          >
            <div
              className={cn(
                isMessagesWorkspace
                  ? "w-full lg:h-full lg:min-h-0 lg:overflow-hidden"
                  : "mx-auto",
                !isMessagesWorkspace &&
                  (context ? "max-w-[1280px]" : "max-w-[1050px]")
              )}
            >
              {children}
            </div>
          </main>
        </section>

        {context ? (
          <aside className="sticky top-0 hidden h-screen w-[328px] shrink-0 border-l border-[#eadfca] bg-[#faf4e8] px-6 py-8 2xl:block">
            {context}
          </aside>
        ) : null}
      </div>

      {/* IMPORTANT: the horizontal inset on this rail is NOT controlled by
          the `px-2` below. A mobile-media-query rule in index.css sets
          `padding-left/right: 0.5rem !important` on `.savanna-mobile-bottom-nav`,
          which beats any utility here. 0.5rem (8px) matches the `py-2`
          vertical gap, so the active pill sits the same distance from the
          rail's left/right edge as it does from its top and bottom.
          If you need to change the end inset, edit that CSS rule — not this
          className. `justify-between` is what anchors the end tabs. */}
      {hideChrome ? null : (
        <nav
          aria-label="Mobile navigation"
          className="savanna-mobile-bottom-nav savanna-glass-bottom-nav fixed bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-1/2 z-50 flex h-[60px] w-[min(calc(100vw-1.5rem),430px)] items-center justify-between rounded-[34px] px-2 py-2 backdrop-blur-xl lg:hidden"
        >
          {mobileNavigation.map(item => {
            const active = routeMatches(location, item.href);
            return (
              <Link
                href={item.href}
                key={item.href}
                onClick={triggerMobileHaptic}
                className="flex h-full flex-none items-center justify-center rounded-[28px] text-xs font-semibold"
              >
                <span
                  className={cn(
                    "relative grid h-11 isolate place-items-center overflow-hidden transition-[width,color] duration-200",
                    active
                      ? "inline-flex w-max min-w-max items-center gap-2 rounded-[28px] px-3 text-[#D9A441] dark:text-[#D9A441]"
                      : "w-11 rounded-[28px] text-[#8a765d]"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="savanna-mobile-bottom-nav-active-pill"
                      className="absolute inset-0 -z-10 rounded-[28px] bg-[#D9A441]/20"
                      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.75 }}
                    />
                  ) : null}
                  {item.label === "Profile" && profileAvatarUrl ? (
                    <img
                      src={profileAvatarUrl}
                      alt=""
                      className="size-7 rounded-full object-cover"
                    />
                  ) : (
                    <MobileNavIcon
                      name={item.label as MobileNavIconName}
                      active={active}
                      size={23}
                    />
                  )}
                  {active ? (
                    <span className="whitespace-nowrap leading-none text-[#D9A441] dark:text-[#D9A441]">
                      {item.label}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Mounted for every page the shell wraps, which is what makes ⌘K /
          Ctrl+K work app-wide. */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </div>
  );
}
