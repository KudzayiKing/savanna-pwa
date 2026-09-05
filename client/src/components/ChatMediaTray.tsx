import { CloseIcon, HistoryIcon } from "@/components/AnimatedChatIcons";
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
  Smile,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatIconHandle } from "@/components/AnimatedChatIcons";

/**
 * Media tray that replaces the keyboard area above the composer: Emojis, GIFs
 * and Stickers. Background matches the theme canvas (white / chat obsidian),
 * with the tab menu docked at the bottom on the same background - only the
 * active tab text switches to full gold.
 *
 */

export type MediaTrayTab = "emojis" | "gifs" | "stickers";

export type StickerSelection = {
  id: string;
  name: string;
  url: string;
  path: string;
  countryPack: string;
  category: string;
  bytes?: number;
};

export interface ChatMediaTrayProps {
  open: boolean;
  tab: MediaTrayTab;
  onTabChange: (tab: MediaTrayTab) => void;
  onEmojiSelect: (emoji: string) => void;
  onGifSelect: (gifUrl: string) => void;
  onStickerSelect: (sticker: StickerSelection) => void;
  onClose: () => void;
}

const TABS: Array<{ key: MediaTrayTab; label: string }> = [
  { key: "emojis", label: "Emojis" },
  { key: "gifs", label: "GIFs" },
  { key: "stickers", label: "Stickers" },
];

/**
 * The clock icon that marks "frequently used" in both the emoji picker and the
 * sticker panel. It is driven imperatively so it plays on mount and whenever
 * the frequently-used section becomes active - hover alone would leave it
 * static on touch devices, and the emoji nav never receives a hover on mobile.
 */
function FrequentlyUsedIcon({
  active,
  size = 14,
  className,
}: {
  active?: boolean;
  size?: number;
  className?: string;
}) {
  const icon = useRef<ChatIconHandle>(null);
  useEffect(() => {
    icon.current?.startAnimation();
  }, [active]);
  return <HistoryIcon ref={icon} size={size} className={className} />;
}

/**
 * Lucide icons for the picker's category nav - replaces the library's sprite
 * icons, which render blurry at small sizes.
 */
const CATEGORY_ICONS: CategoryIcons = {
  [Categories.SUGGESTED]: <FrequentlyUsedIcon size={18} className="size-[18px]" />,
  [Categories.SMILEYS_PEOPLE]: <Smile className="size-[18px]" />,
  [Categories.ANIMALS_NATURE]: <Rabbit className="size-[18px]" />,
  [Categories.FOOD_DRINK]: <Sandwich className="size-[18px]" />,
  [Categories.TRAVEL_PLACES]: <CarFront className="size-[18px]" />,
  [Categories.ACTIVITIES]: <Volleyball className="size-[18px]" />,
  [Categories.OBJECTS]: <Shirt className="size-[18px]" />,
  [Categories.SYMBOLS]: <Music className="size-[18px]" />,
  [Categories.FLAGS]: <Flag className="size-[18px]" />,
};

interface GifMedia {
  url: string;
  id: string;
  description: string;
}

interface GiphyResult {
  id: string;
  title?: string;
  images?: Record<string, { url: string }>;
}

interface GiphyResponse {
  data: GiphyResult[];
  pagination?: { total_count?: number; count?: number; offset?: number };
}

type StickerManifestEntry = {
  id: string;
  countryPack: string;
  category: string;
  path: string;
  width: number;
  height: number;
  format: string;
  bytes?: number;
};

type StickerCountry = {
  key: string;
  label: string;
  flag: string;
};

const COUNTRY_META: Record<string, StickerCountry> = {
  Algeria_All_Sticker_Packs_512: { key: "Algeria_All_Sticker_Packs_512", label: "Algeria", flag: "🇩🇿" },
  DRC_Congo_All_Sticker_Packs_512: { key: "DRC_Congo_All_Sticker_Packs_512", label: "DRC Congo", flag: "🇨🇩" },
  Egypt_All_Sticker_Packs_512: { key: "Egypt_All_Sticker_Packs_512", label: "Egypt", flag: "🇪🇬" },
  Kenya_All_Sticker_Packs_512: { key: "Kenya_All_Sticker_Packs_512", label: "Kenya", flag: "🇰🇪" },
  Morocco_All_Sticker_Packs_512: { key: "Morocco_All_Sticker_Packs_512", label: "Morocco", flag: "🇲🇦" },
  Nigeria_All_Sticker_Packs_512: { key: "Nigeria_All_Sticker_Packs_512", label: "Nigeria", flag: "🇳🇬" },
  Zimbabwe_All_Sticker_Packs_512: { key: "Zimbabwe_All_Sticker_Packs_512", label: "Zimbabwe", flag: "🇿🇼" },
  South_Africa_All_Sticker_Packs_512: { key: "South_Africa_All_Sticker_Packs_512", label: "South Africa", flag: "🇿🇦" },
};

const COUNTRY_ORDER = Object.keys(COUNTRY_META);
const FREQUENT_STICKER_SECTION = "__frequent_stickers__";
const FREQUENT_STICKERS_STORAGE_KEY = "savanna:frequent-stickers:v1";
const MAX_FREQUENT_STICKERS = 24;
const CATEGORY_LABELS: Record<string, string> = {
  "01_Reactions": "Reactions",
  "02_Love_Relationships": "Love & Relationships",
  "03_Street_Everyday_Chat": "Street & Everyday Chat",
  "04_Memes_Vibes_Chaos": "Memes, Vibes & Chaos",
  "05_Food": "Food",
  "06_Occasions": "Occasions",
};

const SAVANNA_MODEL_BASE_URL = (import.meta.env.VITE_SAVANNA_MODEL_BASE_URL ?? "").trim().replace(/\/+$/, "");

function stickerBaseFromModelUrl() {
  if (!SAVANNA_MODEL_BASE_URL) return "";
  try {
    return `${new URL(SAVANNA_MODEL_BASE_URL).origin}/stickers`;
  } catch {
    return "";
  }
}

const STICKER_ASSET_BASE_URL = (import.meta.env.VITE_SAVANNA_STICKERS_BASE_URL?.trim() || stickerBaseFromModelUrl()).replace(/\/+$/, "");
const STICKER_MANIFEST_OVERRIDE = (import.meta.env.VITE_SAVANNA_STICKERS_MANIFEST_URL ?? "").trim();
const STICKER_MANIFEST_URL = STICKER_MANIFEST_OVERRIDE || (STICKER_ASSET_BASE_URL ? `${STICKER_ASSET_BASE_URL}/stickers-manifest.json` : "");

function toGifMedia(item: GiphyResult): GifMedia | null {
  const url = item.images?.fixed_width?.url ?? item.images?.original?.url;
  if (!url) return null;
  return {
    id: item.id,
    description: item.title ?? "GIF",
    url,
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

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY ?? "";

async function fetchGiphyGifs(
  endpoint: "trending" | "search",
  params: { q?: string }
): Promise<GifMedia[]> {
  const query = new URLSearchParams({
    api_key: GIPHY_API_KEY,
    limit: "30",
    rating: "pg-13",
  });
  if (params.q) query.set("q", params.q);
  const base =
    endpoint === "search"
      ? "https://api.giphy.com/v1/gifs/search"
      : "https://api.giphy.com/v1/gifs/trending";
  const response = await fetch(`${base}?${query.toString()}`);
  if (!response.ok) throw new Error("GIPHY request failed");
  const payload = (await response.json()) as GiphyResponse;
  return (payload.data ?? [])
    .map(toGifMedia)
    .filter((item): item is GifMedia => item !== null);
}

type FrequentGifRecord = {
  id: string;
  url: string;
  description: string;
  count: number;
  usedAt: number;
};

const FREQUENT_GIFS_STORAGE_KEY = "savanna:frequent-gifs:v1";
const MAX_FREQUENT_GIFS = 12;

function readFrequentGifRecords(): FrequentGifRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FREQUENT_GIFS_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is FrequentGifRecord => {
        if (!item || typeof item !== "object") return false;
        const record = item as Partial<FrequentGifRecord>;
        return (
          typeof record.id === "string" &&
          typeof record.url === "string" &&
          typeof record.description === "string" &&
          typeof record.count === "number" &&
          typeof record.usedAt === "number"
        );
      })
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, MAX_FREQUENT_GIFS);
  } catch {
    return [];
  }
}

function recordFrequentGif(gif: GifMedia) {
  const now = Date.now();
  const records = readFrequentGifRecords();
  const next = [
    {
      id: gif.id,
      url: gif.url,
      description: gif.description,
      count: (records.find(record => record.id === gif.id)?.count ?? 0) + 1,
      usedAt: now,
    },
    ...records.filter(record => record.id !== gif.id),
  ].slice(0, MAX_FREQUENT_GIFS);
  localStorage.setItem(FREQUENT_GIFS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function titleFromKey(value: string) {
  return value.replace(/^\d+_/, "").replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? titleFromKey(category);
}

function countryMeta(countryPack: string): StickerCountry {
  return COUNTRY_META[countryPack] ?? { key: countryPack, label: titleFromKey(countryPack.replace(/_All_Sticker_Packs_512$|_Sticker_Pack$/g, "")), flag: "🏳️" };
}

function stickerName(entry: StickerManifestEntry) {
  const fileName = entry.path.split("/").pop()?.replace(/\.webp$/i, "") ?? entry.id;
  return titleFromKey(fileName);
}

function stickerUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.replace(/^\/+/, "");
  return STICKER_ASSET_BASE_URL ? `${STICKER_ASSET_BASE_URL}/${cleanPath}` : cleanPath;
}

/**
 * The Zimbabwe pack used to nest every file under a `PNG_512` folder that has
 * since been removed from the bucket. Drop that (and any similar) leading
 * segment so the resolved URLs point at the new flat layout. The regex only
 * matches a standalone `png 512` / `png_512` / `PNG_512` segment, never the
 * `…_Sticker_Packs_512` country-pack folders.
 */
function normalizeStickerPath(path: string): string {
  return path
    .split("/")
    .filter(segment => !/^png[\s_-]*512$/i.test(segment))
    .join("/");
}

type FrequentStickerRecord = {
  id: string;
  count: number;
  usedAt: number;
};

function readFrequentStickerRecords(): FrequentStickerRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FREQUENT_STICKERS_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is FrequentStickerRecord => {
        if (!item || typeof item !== "object") return false;
        const record = item as Partial<FrequentStickerRecord>;
        return typeof record.id === "string" && typeof record.count === "number" && typeof record.usedAt === "number";
      })
      .sort((a, b) => b.usedAt - a.usedAt)
      .slice(0, MAX_FREQUENT_STICKERS);
  } catch {
    return [];
  }
}

function recordFrequentSticker(stickerId: string) {
  const now = Date.now();
  const records = readFrequentStickerRecords();
  const next = [
    { id: stickerId, count: (records.find(record => record.id === stickerId)?.count ?? 0) + 1, usedAt: now },
    ...records.filter(record => record.id !== stickerId),
  ].slice(0, MAX_FREQUENT_STICKERS);
  localStorage.setItem(FREQUENT_STICKERS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

function toStickerSelection(sticker: StickerManifestEntry): StickerSelection {
  return {
    ...sticker,
    name: stickerName(sticker),
    url: stickerUrl(sticker.path),
  };
}

async function fetchStickerManifest(): Promise<StickerManifestEntry[]> {
  if (!STICKER_MANIFEST_URL) throw new Error("Sticker manifest URL is not configured");
  const response = await fetch(STICKER_MANIFEST_URL);
  if (!response.ok) throw new Error("Sticker manifest request failed");
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) throw new Error("Sticker manifest is invalid");
  return payload.filter((item): item is StickerManifestEntry => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Partial<StickerManifestEntry>;
    return Boolean(typeof entry.id === "string" && typeof entry.countryPack === "string" && typeof entry.category === "string" && typeof entry.path === "string");
  }).map(entry => ({
    ...entry,
    id: normalizeStickerPath(entry.id),
    path: normalizeStickerPath(entry.path),
  }));
}

function GifPanel({
  search,
  onGifSelect,
}: {
  search: string;
  onGifSelect: (gifUrl: string) => void;
}) {
  const debounced = useDebouncedValue(search.trim(), 400);
  const endpoint = debounced ? "search" : "trending";
  const [frequentGifs, setFrequentGifs] = useState<FrequentGifRecord[]>(() => readFrequentGifRecords());

  const gifs = useQuery({
    queryKey: ["giphy", endpoint, debounced || "trending"],
    queryFn: () => fetchGiphyGifs(endpoint, debounced ? { q: debounced } : {}),
    enabled: Boolean(GIPHY_API_KEY),
    staleTime: 5 * 60 * 1000,
  });

  // Keep every hook above the early returns so the call order is stable across
  // renders (rules of hooks). Frequent GIFs are read from localStorage, so they
  // are available synchronously even before the live request resolves.
  const frequentIds = useMemo(() => new Set(frequentGifs.map(g => g.id)), [frequentGifs]);
  const mainGifs = useMemo(
    () => (gifs.data ?? []).filter(g => !frequentIds.has(g.id)),
    [gifs.data, frequentIds]
  );
  const sendGif = (gif: GifMedia) => {
    setFrequentGifs(recordFrequentGif(gif));
    onGifSelect(gif.url);
  };

  if (!GIPHY_API_KEY)
    return (
      <TrayMessage text="GIFs need a GIPHY API key. Add VITE_GIPHY_API_KEY to your .env to enable this panel." />
    );
  if (gifs.isPending && !frequentGifs.length) return <TrayLoader label="Loading GIFs" />;
  if (gifs.isError && !frequentGifs.length)
    return (
      <TrayMessage text="GIFs are unavailable right now - check the connection and try again." />
    );
  if (!gifs.data?.length && !frequentGifs.length)
    return (
      <TrayMessage
        text={debounced ? `No GIFs found for "${debounced}"` : "No GIFs found"}
      />
    );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-3">
      {frequentGifs.length ? (
        <section className="scroll-mt-2">
          <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-[#5F6861] dark:text-[#AEBAC1]">
            <FrequentlyUsedIcon className="size-3.5 text-[#D9A441]" />
            <span>Frequently Used</span>
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {frequentGifs.map(gif => (
              <button
                key={gif.id}
                type="button"
                onClick={() => sendGif(gif)}
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
          <div className="my-3 border-t border-[#DDE3DC] dark:border-[#2C3336]" />
        </section>
      ) : null}
      <div className="grid grid-cols-3 gap-1.5">
        {mainGifs.map(gif => (
          <button
            key={gif.id}
            type="button"
            onClick={() => sendGif(gif)}
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

function StickerPanel({
  search,
  onStickerSelect,
}: {
  search: string;
  onStickerSelect: (sticker: StickerSelection) => void;
}) {
  const [selectedCountry, setSelectedCountry] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [frequentStickerIds, setFrequentStickerIds] = useState(() => readFrequentStickerRecords().map(record => record.id));
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim().toLowerCase(), 160);

  const stickers = useQuery({
    queryKey: ["savanna-stickers", STICKER_MANIFEST_URL],
    queryFn: fetchStickerManifest,
    enabled: Boolean(STICKER_MANIFEST_URL),
    staleTime: 60 * 60 * 1000,
  });

  const countries = useMemo(() => {
    const countryKeys = Array.from(new Set((stickers.data ?? []).map(sticker => sticker.countryPack)));
    return countryKeys
      .map(countryMeta)
      .sort((a, b) => {
        const aIndex = COUNTRY_ORDER.indexOf(a.key);
        const bIndex = COUNTRY_ORDER.indexOf(b.key);
        if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
        return a.label.localeCompare(b.label);
      });
  }, [stickers.data]);

  useEffect(() => {
    if (!countries.length) return;
    if (!selectedCountry || !countries.some(country => country.key === selectedCountry)) setSelectedCountry(countries[0].key);
  }, [countries, selectedCountry]);

  const visibleStickers = useMemo(() => {
    return (stickers.data ?? []).filter(sticker => {
      if (sticker.countryPack !== selectedCountry) return false;
      if (!debouncedSearch) return true;
      const haystack = [sticker.id, sticker.path, categoryLabel(sticker.category), countryMeta(sticker.countryPack).label].join(" ").toLowerCase();
      return haystack.includes(debouncedSearch);
    });
  }, [stickers.data, selectedCountry, debouncedSearch]);

  const categories = useMemo(() => Array.from(new Set(visibleStickers.map(sticker => sticker.category))).sort((a, b) => a.localeCompare(b)), [visibleStickers]);
  /**
   * Frequently used spans every country pack, not just the one on screen - a
   * sticker sent from the Kenya pack has to stay reachable while browsing
   * Nigeria, otherwise the section vanishes and looks broken. Search still
   * narrows the pool so results stay relevant.
   */
  const frequentStickers = useMemo(() => {
    const pool = debouncedSearch ? visibleStickers : (stickers.data ?? []);
    const poolById = new Map(pool.map(sticker => [sticker.id, sticker]));
    return frequentStickerIds
      .map(id => poolById.get(id))
      .filter((sticker): sticker is StickerManifestEntry => Boolean(sticker));
  }, [debouncedSearch, frequentStickerIds, stickers.data, visibleStickers]);
  const categoryAnchors = useMemo(() => (
    frequentStickers.length ? [FREQUENT_STICKER_SECTION, ...categories] : categories
  ), [categories, frequentStickers.length]);

  useEffect(() => {
    if (!categoryAnchors.length) {
      setActiveCategory("");
      return;
    }
    if (!activeCategory || !categoryAnchors.includes(activeCategory)) setActiveCategory(categoryAnchors[0]);
  }, [activeCategory, categoryAnchors]);

  const grouped = useMemo(() => {
    const categoryGroups = categories.map(category => ({
      category,
      label: categoryLabel(category),
      frequent: false,
      stickers: visibleStickers.filter(sticker => sticker.category === category),
    }));
    if (!frequentStickers.length) return categoryGroups;
    return [
      {
        category: FREQUENT_STICKER_SECTION,
        label: "Frequently Used",
        frequent: true,
        stickers: frequentStickers,
      },
      ...categoryGroups,
    ];
  }, [categories, frequentStickers, visibleStickers]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !categoryAnchors.length) return;
    const handleScroll = () => {
      const top = scroller.getBoundingClientRect().top + 16;
      let current = categoryAnchors[0];
      for (const category of categoryAnchors) {
        const section = sectionRefs.current[category];
        if (section && section.getBoundingClientRect().top <= top) current = category;
      }
      setActiveCategory(previous => previous === current ? previous : current);
    };
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [categoryAnchors]);

  const scrollToCategory = (category: string) => {
    setActiveCategory(category);
    sectionRefs.current[category]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sendStickerFromTray = (sticker: StickerManifestEntry) => {
    setFrequentStickerIds(recordFrequentSticker(sticker.id).map(record => record.id));
    onStickerSelect(toStickerSelection(sticker));
  };

  if (!STICKER_MANIFEST_URL) return <TrayMessage text="Sticker source is not configured." />;
  if (stickers.isPending) return <TrayLoader label="Loading stickers" />;
  if (stickers.isError) return <TrayMessage text="Stickers are unavailable right now - check the CDN settings and try again." />;
  if (!stickers.data?.length) return <TrayMessage text="No stickers found." />;

  return (
    <>
      <div className="savanna-sticker-pill-tabs flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 pt-2" aria-label="Sticker countries">
        {countries.map(country => {
          const active = selectedCountry === country.key;
          return (
            <button
              key={country.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelectedCountry(country.key);
                scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors"
            >
              <span className="text-base leading-none">{country.flag}</span>
              <span>{country.label}</span>
            </button>
          );
        })}
      </div>
      {categoryAnchors.length ? (
        <div className="savanna-sticker-pill-tabs flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2" aria-label="Sticker categories">
          {categoryAnchors.map(category => {
            const active = activeCategory === category;
            const frequent = category === FREQUENT_STICKER_SECTION;
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                onClick={() => scrollToCategory(category)}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors"
              >
                {frequent ? <FrequentlyUsedIcon active={active} size={14} className="size-3.5" /> : null}
                <span>{frequent ? "Frequently Used" : categoryLabel(category)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div ref={scrollerRef} className="min-h-0 flex-1 scroll-py-2 overflow-y-auto px-3 pb-3">
        {grouped.length ? (
          <div className="space-y-4">
            {grouped.map(group => (
              <section key={group.category} ref={node => { sectionRefs.current[group.category] = node; }} className="scroll-mt-2">
                <h3 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold text-[#5F6861] dark:text-[#AEBAC1]">
                  {group.frequent ? <FrequentlyUsedIcon active={activeCategory === group.category} size={14} className="size-3.5 text-[#D9A441]" /> : null}
                  <span>{group.label}</span>
                </h3>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {group.stickers.map(sticker => {
                    const selection = toStickerSelection(sticker);
                    return (
                      <button
                        key={sticker.id}
                        type="button"
                        onClick={() => sendStickerFromTray(sticker)}
                        className="grid aspect-square place-items-center rounded-lg bg-[#F6F5F5] p-1.5 transition-transform hover:bg-[#D9A441]/20 active:scale-95 dark:bg-[#172127] dark:hover:bg-[#D9A441]/20"
                        aria-label={`Send sticker: ${selection.name}`}
                      >
                        <img src={selection.url} alt="" loading="lazy" className="size-full object-contain" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <TrayMessage text={search.trim() ? "No stickers match that search." : "No stickers found for this country."} />
        )}
      </div>
    </>
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
  onStickerSelect,
  onClose,
}: ChatMediaTrayProps) {
  const { theme } = useTheme();
  const [gifSearch, setGifSearch] = useState("");
  const [stickerSearch, setStickerSearch] = useState("");
  const closeIcon = useRef<ChatIconHandle>(null);

  // Fresh search on the next open.
  useEffect(() => {
    if (!open) {
      setGifSearch("");
      setStickerSearch("");
    }
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

          {/* GIF and sticker tabs: one header row - search + close. */}
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
                <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#D9A441]/20 px-4 text-sm text-[#A87820] dark:text-[#D9A441]">
                  <Search className="size-4 shrink-0" />
                  <input
                    value={stickerSearch}
                    onChange={event => setStickerSearch(event.target.value)}
                    placeholder="Search stickers"
                    aria-label="Search stickers"
                    className="min-w-0 flex-1 bg-transparent text-[#3d2d1a] outline-none placeholder:text-[#A87820]/70 dark:text-[#F0F2F5] dark:placeholder:text-[#D9A441]/70"
                  />
                  {stickerSearch ? (
                    <button
                      type="button"
                      onClick={() => setStickerSearch("")}
                      className="shrink-0"
                      aria-label="Clear sticker search"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </label>
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
            <StickerPanel search={stickerSearch} onStickerSelect={onStickerSelect} />
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
