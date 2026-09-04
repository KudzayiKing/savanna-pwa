import { CloseIcon } from "@/components/AnimatedChatIcons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { useQuery } from "@tanstack/react-query";
import EmojiPicker, {
  Categories,
  EmojiStyle,
  Theme,
  type CategoryIcons,
} from "emoji-picker-react";
import {
  Rabbit,
  Sandwich,
  CarFront,
  Volleyball,
  Shirt,
  Music,
  Flag,
  History,
  Smile,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatIconHandle } from "@/components/AnimatedChatIcons";

/**
 * Media tray that replaces the keyboard area above the composer: Emojis, GIFs
 * and Stickers. Background matches the theme canvas (white / chat obsidian),
 * with the tab menu docked at the bottom on the same background - only the
 * active tab text switches to full gold.
 *
 * The Stickers tab ships as a placeholder for now - bespoke Savanna sticker
 * packs will replace it once they are ready.
 */

export type MediaTrayTab = "emojis" | "gifs" | "stickers";

export interface ChatMediaTrayProps {
  open: boolean;
  tab: MediaTrayTab;
  onTabChange: (tab: MediaTrayTab) => void;
  onEmojiSelect: (emoji: string) => void;
  onGifSelect: (gifUrl: string) => void;
  onClose: () => void;
}

const TABS: Array<{ key: MediaTrayTab; label: string }> = [
  { key: "emojis", label: "Emojis" },
  { key: "gifs", label: "GIFs" },
  { key: "stickers", label: "Stickers" },
];

/**
 * Lucide icons for the picker's category nav - replaces the library's sprite
 * icons, which render blurry at small sizes.
 */
const CATEGORY_ICONS: CategoryIcons = {
  [Categories.SUGGESTED]: <History className="size-[18px]" />,
  [Categories.SMILEYS_PEOPLE]: <Smile className="size-[18px]" />,
  [Categories.ANIMALS_NATURE]: <Rabbit className="size-[18px]" />,
  [Categories.FOOD_DRINK]: <Sandwich className="size-[18px]" />,
  [Categories.TRAVEL_PLACES]: <CarFront className="size-[18px]" />,
  [Categories.ACTIVITIES]: <Volleyball className="size-[18px]" />,
  [Categories.OBJECTS]: <Shirt className="size-[18px]" />,
  [Categories.SYMBOLS]: <Music className="size-[18px]" />,
  [Categories.FLAGS]: <Flag className="size-[18px]" />,
};

interface TenorMedia {
  url: string;
  id: string;
  description: string;
}

interface TenorResult {
  id: string;
  content_description?: string;
  media_formats: {
    tinygif?: { url: string; dims: number[] };
    gif?: { url: string; dims: number[] };
  };
}

interface TenorResponse {
  results: TenorResult[];
  next?: string;
}

function toTenorMedia(item: TenorResult): TenorMedia | null {
  const format = item.media_formats.tinygif ?? item.media_formats.gif;
  if (!format?.url) return null;
  return {
    id: item.id,
    description: item.content_description ?? "GIF",
    url: format.url,
  };
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY ?? "";

async function fetchTenorGifs(
  endpoint: "featured" | "search",
  params: { q?: string; next?: string }
): Promise<TenorMedia[]> {
  const query = new URLSearchParams({
    key: TENOR_API_KEY,
    client_key: "savanna_pwa",
    media_filter: "tinygif",
    limit: "30",
  });
  if (params.q) query.set("q", params.q);
  if (params.next) query.set("next", params.next);
  const response = await fetch(
    `https://g.tenor.com/v2/${endpoint}?${query.toString()}`
  );
  if (!response.ok) throw new Error("Tenor request failed");
  const payload = (await response.json()) as TenorResponse;
  return payload.results
    .map(toTenorMedia)
    .filter((item): item is TenorMedia => item !== null);
}

function GifPanel({
  search,
  onGifSelect,
}: {
  search: string;
  onGifSelect: (gifUrl: string) => void;
}) {
  const debounced = useDebouncedValue(search.trim(), 400);
  const endpoint = debounced ? "search" : "featured";

  const gifs = useQuery({
    queryKey: ["tenor", endpoint, debounced || "trending"],
    queryFn: () => fetchTenorGifs(endpoint, debounced ? { q: debounced } : {}),
    enabled: Boolean(TENOR_API_KEY),
    staleTime: 5 * 60 * 1000,
  });

  if (!TENOR_API_KEY)
    return (
      <TrayMessage text="GIFs need a Tenor API key. Add VITE_TENOR_API_KEY to your .env to enable this panel." />
    );
  if (gifs.isPending) return <TrayLoader label="Loading GIFs" />;
  if (gifs.isError)
    return (
      <TrayMessage text="GIFs are unavailable right now - check the connection and try again." />
    );
  if (!gifs.data?.length)
    return (
      <TrayMessage
        text={debounced ? `No GIFs found for "${debounced}"` : "No GIFs found"}
      />
    );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <div className="grid grid-cols-3 gap-1.5">
        {gifs.data.map(gif => (
          <button
            key={gif.id}
            type="button"
            onClick={() => onGifSelect(gif.url)}
            className="overflow-hidden rounded-xl bg-[#f4f0e8] transition-transform active:scale-95 dark:bg-[#23282C]"
            aria-label={`Send GIF: ${gif.description}`}
          >
            <img
              src={gif.url}
              alt={gif.description}
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function TrayLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-[#A87820] dark:text-[#D9A441]">
      <Loader2 className="size-5 animate-spin" />
      <p className="text-xs font-medium">{label}...</p>
    </div>
  );
}

function TrayMessage({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
      <p className="text-xs font-medium leading-5 text-[#5f6861] dark:text-[#9AA1A6]">
        {text}
      </p>
    </div>
  );
}

export function ChatMediaTray({
  open,
  tab,
  onTabChange,
  onEmojiSelect,
  onGifSelect,
  onClose,
}: ChatMediaTrayProps) {
  const { theme } = useTheme();
  const [gifSearch, setGifSearch] = useState("");
  const closeIcon = useRef<ChatIconHandle>(null);

  // Fresh search on the next open.
  useEffect(() => {
    if (!open) setGifSearch("");
  }, [open]);

  return (
    <div
      role="dialog"
      aria-label="Emoji, GIF and sticker tray"
      aria-hidden={!open}
      className={cn(
        "savanna-media-tray flex flex-col overflow-hidden rounded-2xl border bg-white transition-[max-height,opacity] duration-200 ease-out",
        "border-[#DDE3DC] dark:border-[#2C3336] dark:bg-[var(--chat-bg)]",
        open ? "h-[min(340px,46vh)] opacity-100" : "h-0 border-0 opacity-0"
      )}
    >
      {open ? (
        <>
          {/* Emoji tab: the picker owns the search bar. CSS reserves header
              space so this close button sits beside the pill, not inside it. */}
          {tab === "emojis" ? (
            <div className="savanna-emoji-picker relative min-h-0 flex-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="savanna-media-tray-close absolute right-3 top-[14px] z-10 size-8 rounded-full text-[#A87820] hover:bg-[#D9A441]/20 hover:text-[#A87820] dark:text-[#D9A441] dark:hover:bg-[#D9A441]/20 dark:hover:text-[#D9A441]"
                aria-label="Close tray"
              >
                <CloseIcon ref={closeIcon} size={16} />
              </Button>
              <EmojiPicker
                onEmojiClick={emojiData => onEmojiSelect(emojiData.emoji)}
                emojiStyle={EmojiStyle.NATIVE}
                theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
                previewConfig={{ showPreview: false }}
                skinTonesDisabled
                lazyLoadEmojis
                searchPlaceholder="Search emoji"
                categoryIcons={CATEGORY_ICONS}
                height="100%"
                width="100%"
              />
            </div>
          ) : null}

          {/* GIF and sticker tabs: one header row - search (or note) + close. */}
          {tab === "gifs" || tab === "stickers" ? (
            <div className="flex items-center gap-2 px-3 pt-3">
              {tab === "gifs" ? (
                <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#D9A441]/20 px-4 text-sm text-[#A87820] dark:text-[#D9A441]">
                  <Search className="size-4 shrink-0" />
                  <input
                    value={gifSearch}
                    onChange={event => setGifSearch(event.target.value)}
                    placeholder="Search GIFs"
                    aria-label="Search GIFs"
                    className="min-w-0 flex-1 bg-transparent text-[#3d2d1a] outline-none placeholder:text-[#A87820]/70 dark:text-[#F0F2F5] dark:placeholder:text-[#D9A441]/70"
                  />
                  {gifSearch ? (
                    <button
                      type="button"
                      onClick={() => setGifSearch("")}
                      className="shrink-0"
                      aria-label="Clear GIF search"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </label>
              ) : (
                <div className="flex h-10 min-w-0 flex-1 items-center rounded-full bg-[#D9A441]/20 px-4 text-xs font-medium text-[#A87820] dark:text-[#D9A441]">
                  Bespoke Savanna stickers are being crafted.
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-8 shrink-0 rounded-full text-[#A87820] hover:bg-[#D9A441]/20 hover:text-[#A87820] dark:text-[#D9A441] dark:hover:bg-[#D9A441]/20 dark:hover:text-[#D9A441]"
                aria-label="Close tray"
              >
                <CloseIcon size={16} />
              </Button>
            </div>
          ) : null}
          {tab === "gifs" ? (
            <GifPanel search={gifSearch} onGifSelect={onGifSelect} />
          ) : null}
          {tab === "stickers" ? (
            <TrayMessage text="Bespoke Savanna stickers are on the way - this panel will showcase them once they land." />
          ) : null}

          {/* Bottom tab menu: pill-shaped text tablets. Active = 20% gold
              surface with 100% gold text; inactive = theme background, no
              border. aria-pressed (not role=tab) so the page-wide [role="tab"]
              rules in index.css cannot repaint these. */}
          <div
            className="savanna-media-tray-tabs flex items-center justify-center gap-1.5 border-t border-[#DDE3DC] px-2 py-2 dark:border-[#2C3336]"
            aria-label="Sticker tray tabs"
          >
            {TABS.map(item => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onTabChange(item.key)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                    active
                      ? "savanna-media-tray-tab-active"
                      : "savanna-media-tray-tab-inactive"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
