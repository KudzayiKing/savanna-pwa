import { useAuth } from "@/_core/hooks/useAuth";
import { motion, useReducedMotion } from "framer-motion";
import {
  Command as CommandIcon,
  CornerDownLeft,
  LogOut,
  MessageCircle,
  Package,
  PenLine,
  Shield,
  ShoppingBag,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useLocation } from "wouter";

type PaletteCommand = {
  id: string;
  label: string;
  /** Extra words the query may match against, e.g. synonyms and section names. */
  keywords: string;
  group: string;
  icon: ComponentType<{ className?: string }>;
  run: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * True on Apple platforms, where the hint reads ⌘K instead of Ctrl K.
 *
 * `navigator.platform` is deprecated but `userAgentData` is not available in
 * every browser yet, so both are read and the answer is only used to pick a
 * label — the listener accepts either modifier everywhere.
 */
function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/** True when `query` appears in `target` as a subsequence ("msgs" ~ "messages"). */
function fuzzyIncludes(query: string, target: string): boolean {
  let cursor = 0;
  for (const char of target) {
    if (char === query[cursor]) cursor += 1;
    if (cursor === query.length) return true;
  }
  return false;
}

function matchesQuery(query: string, command: PaletteCommand): boolean {
  if (!query) return true;
  const label = normalize(command.label);
  const keywords = normalize(command.keywords);
  if (label.includes(query) || keywords.includes(query)) return true;
  return fuzzyIncludes(query, label) || fuzzyIncludes(query, keywords);
}

/**
 * Search and command menu (⌘K / Ctrl+K).
 *
 * Rendered by `SavannaShell`, which wraps every page, so the keyboard
 * listener is mounted app-wide. The shell owns `open` so the existing
 * "Search Savanna" control and the shortcut drive the same state.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [shortcutHint, setShortcutHint] = useState("⌘K");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setShortcutHint(isApplePlatform() ? "⌘K" : "Ctrl K");
  }, []);

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (href: string) => () => navigate(href);
    return [
      {
        id: "go-messages",
        label: "Messages",
        keywords: "chat chats dm inbox conversations",
        group: "Go to",
        icon: MessageCircle,
        run: go("/messages"),
      },
      {
        id: "go-stories",
        label: "Stories",
        keywords: "updates feed posts",
        group: "Go to",
        icon: PenLine,
        run: go("/stories"),
      },
      {
        id: "go-communities",
        label: "Communities",
        keywords: "groups circles",
        group: "Go to",
        icon: Users,
        run: go("/communities"),
      },
      {
        id: "go-shops",
        label: "Shops",
        keywords: "services stores market catalog",
        group: "Go to",
        icon: Store,
        run: go("/shops"),
      },
      {
        id: "go-orders",
        label: "Orders",
        keywords: "purchases receipts checkout history",
        group: "Go to",
        icon: Package,
        run: go("/orders"),
      },
      {
        id: "go-profile",
        label: "Profile",
        keywords: "account you me settings",
        group: "Go to",
        icon: UserRound,
        run: go("/profile"),
      },
      {
        id: "go-admin",
        label: "Admin",
        keywords: "control room moderation ops",
        group: "Go to",
        icon: Shield,
        run: go("/admin"),
      },
      {
        id: "create-story",
        label: "New story",
        keywords: "create compose post share",
        group: "Create",
        icon: PenLine,
        run: go("/stories?compose=1"),
      },
      {
        id: "create-shop",
        label: "New shop",
        keywords: "create storefront business merchant sell",
        group: "Create",
        icon: Store,
        run: go("/shops/manage"),
      },
      {
        id: "account-orders",
        label: "Your orders",
        keywords: "purchases bought history",
        group: "Account",
        icon: ShoppingBag,
        run: go("/orders"),
      },
      {
        id: "account-sign-out",
        label: "Sign out",
        keywords: "logout leave exit account",
        group: "Account",
        icon: LogOut,
        run: () => {
          void logout().then(
            () => toast.success("Signed out"),
            (error: unknown) =>
              toast.error(
                error instanceof Error ? error.message : "Could not sign out"
              )
          );
        },
      },
    ];
  }, [navigate, logout]);

  const filtered = useMemo(
    () => commands.filter(command => matchesQuery(normalize(query), command)),
    [commands, query]
  );

  // The list shrinks as the query narrows, so the stored index can point past
  // the end. Clamp instead of resetting, so arrowing through a filtered list
  // keeps the highlighted row stable where it still exists.
  const safeIndex = filtered.length
    ? Math.min(activeIndex, filtered.length - 1)
    : 0;
  const activeCommand = filtered[safeIndex] ?? null;

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const runCommand = useCallback(
    (command: PaletteCommand | null) => {
      if (!command) return;
      onOpenChange(false);
      command.run();
    },
    [onOpenChange]
  );

  // ⌘K on macOS, Ctrl+K elsewhere. Both are accepted everywhere because the
  // two modifiers are never both meaningful, and Firefox's Ctrl+K (focus the
  // browser search bar) has to be prevented either way.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isPaletteKey =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k";
      if (isPaletteKey) {
        event.preventDefault();
        onOpenChange(true);
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  // Focus the input on open, and hand focus back to whatever opened the
  // palette (the search button, or a control on the page) when it closes.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      inputRef.current?.focus();
      return;
    }
    setQuery("");
    setActiveIndex(0);
    const previous = restoreFocusRef.current;
    restoreFocusRef.current = null;
    if (previous && document.contains(previous)) previous.focus();
  }, [open]);

  // Navigation within the list. Listened on `window` rather than the input so
  // it keeps working if focus ever lands on the list itself.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(index =>
          filtered.length ? (Math.min(index, filtered.length - 1) + 1) % filtered.length : 0
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(index =>
          filtered.length
            ? (Math.min(index, filtered.length - 1) - 1 + filtered.length) %
              filtered.length
            : 0
        );
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(Math.max(filtered.length - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        runCommand(activeCommand);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered.length, activeCommand, runCommand]);

  // Keep the highlighted row visible when it moves off-screen.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]'
    );
    node?.scrollIntoView({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [open, safeIndex, reduceMotion]);

  if (!open) return null;

  const listboxId = "savanna-command-listbox";
  const activeOptionId = activeCommand
    ? `savanna-command-${activeCommand.id}`
    : undefined;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center">
      <motion.div
        aria-hidden="true"
        onClick={close}
        className="absolute inset-0 bg-[#1b1206]/55 backdrop-blur-sm"
        initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.12, ease: "easeOut" }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Search and command menu"
        className="relative mt-[12vh] w-[min(560px,calc(100vw-1.5rem))] overflow-hidden rounded-[22px] border border-[#eadfca] bg-[#fffaf0] shadow-[0_28px_70px_rgba(37,25,9,0.35)] dark:border-[#3a2f1f] dark:bg-[#221a12]"
        initial={
          reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8, scale: 0.985 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.16, ease: "easeOut" }}
      >
        <div className="flex items-center gap-3 border-b border-[#eadfca] px-4 py-3 dark:border-[#3a2f1f]">
          <CommandIcon className="size-4 shrink-0 text-[#a08a67] dark:text-[#8f7c5f]" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            aria-label="Search Savanna"
            placeholder="Search Savanna or jump to…"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#3d2d1a] outline-none placeholder:text-[#9aa1a6] dark:text-[#f5ead6] dark:placeholder:text-[#9aa1a6]"
          />
          <kbd className="hidden shrink-0 items-center gap-1 rounded-md bg-[#eef0e8] px-1.5 py-1 font-mono text-[10px] text-[#687462] sm:inline-flex dark:bg-[#33281b] dark:text-[#a9977a]">
            {shortcutHint}
          </kbd>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#8a765d] dark:text-[#a9977a]">
            Nothing matches “{query}”.
          </p>
        ) : (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Commands"
            className="max-h-[min(52vh,380px)] overflow-y-auto p-2"
          >
            {filtered.map((command, index) => {
              const previous = filtered[index - 1];
              const startsGroup = !previous || previous.group !== command.group;
              const active = index === safeIndex;
              const Icon = command.icon;
              return (
                <li key={command.id} role="presentation">
                  {startsGroup ? (
                    <p
                      role="presentation"
                      className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a08a67] dark:text-[#8f7c5f]"
                    >
                      {command.group}
                    </p>
                  ) : null}
                  <div
                    id={`savanna-command-${command.id}`}
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => runCommand(command)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-[#D9A441]/20 text-[#5d3a0c] dark:bg-[#D9A441]/25 dark:text-[#f7e6c8]"
                        : "text-[#4a3c28] hover:bg-[#f1dfbf]/70 dark:text-[#e8dcc6] dark:hover:bg-[#2f2519]"
                    }`}
                  >
                    <Icon
                      className={`size-4 shrink-0 ${
                        active
                          ? "text-[#A87820] dark:text-[#D9A441]"
                          : "text-[#8a765d] dark:text-[#a9977a]"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {command.label}
                    </span>
                    {active ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-[#A87820] dark:text-[#D9A441]" />
                    ) : (
                      <span className="shrink-0 text-[11px] text-[#a08a67] dark:text-[#8f7c5f]">
                        {command.group}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#eadfca] px-4 py-2.5 text-[11px] text-[#8a765d] dark:border-[#3a2f1f] dark:text-[#a9977a]">
          <span className="flex items-center gap-3">
            <span>↑↓ to browse</span>
            <span className="hidden sm:inline">↵ to open</span>
            <span className="hidden sm:inline">esc to close</span>
          </span>
          <span className="flex items-center gap-1">
            <CommandIcon className="size-3" /> K
          </span>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
