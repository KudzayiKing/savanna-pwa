import {
  MAX_CUSTOM_WALLPAPER_BYTES,
  SAVANNA_WALLPAPERS,
  WALLPAPER_COLOR_SWATCHES,
  useWallpaper,
  type WallpaperSlot,
} from "@/contexts/WallpaperContext";
import { encodeWallpaperForSlot, inlineStyleAccepts } from "@/lib/wallpaper-image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Palette, Plus, RotateCcw, Upload, X } from "lucide-react";
import { type ChangeEvent } from "react";
import { toast } from "sonner";

function isLightHex(color: string) {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

const MAX_UPLOAD_MB = Math.round(MAX_CUSTOM_WALLPAPER_BYTES / 1024 / 1024);

/**
 * The two orientations an uploaded wallpaper can fill. A chat opened on a phone
 * shows the portrait slot; the same account on a desktop shows the landscape
 * one. Either slot may be left empty, in which case it borrows the other.
 */
const CUSTOM_SLOTS: {
  slot: WallpaperSlot;
  label: string;
  audience: string;
  thumbClassName: string;
  inUse: string;
}[] = [
  {
    slot: "portrait",
    label: "Portrait",
    audience: "Phones",
    thumbClassName: "h-14 w-8",
    inUse: "Used on phones",
  },
  {
    slot: "landscape",
    label: "Landscape",
    audience: "Desktop",
    thumbClassName: "h-9 w-16",
    inUse: "Used on desktop",
  },
];

type WallpaperSectionProps = {
  title?: string;
  description?: string;
  compact?: boolean;
};

export function WallpaperSection({
  title = "Wallpaper",
  description = "Pick the backdrop behind your chats on this device. It follows your light and dark mode.",
  compact = false,
}: WallpaperSectionProps) {
  const { setting, setColor, setSavannaWallpaper, setCustomImage, clearCustomImage, resetWallpaper } = useWallpaper();

  const portrait = setting.customPortrait;
  const landscape = setting.customLandscape;
  const hasAnyCustom = Boolean(portrait || landscape);

  const handleWallpaperFile = async (slot: WallpaperSlot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared immediately so re-picking the same file still fires a change.
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose a PNG or JPG image");
      return;
    }
    if (file.size > MAX_CUSTOM_WALLPAPER_BYTES) {
      toast.error(`Images up to ${MAX_UPLOAD_MB} MB are supported`);
      return;
    }
    try {
      // Downscaled and re-encoded rather than stored raw: the browser drops an
      // inline style value past 2^21 characters, and a raw photo's data URL
      // crosses that around 1.45 MB — silently, leaving no wallpaper at all.
      const dataUrl = await encodeWallpaperForSlot(file, slot);
      if (!inlineStyleAccepts(`url("${dataUrl}")`)) {
        toast.error("That image is too large for this browser to display. Try a smaller one.");
        return;
      }
      setCustomImage(slot, dataUrl);
      toast.success(`${slot === "portrait" ? "Portrait" : "Landscape"} wallpaper updated`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That image could not be read");
    }
  };

  return (
    <section className={cn(
      "savanna-wallpaper-section rounded-[28px] border border-[#eadfca] bg-white shadow-[0_14px_35px_rgba(94,58,11,0.04)] dark:bg-[#202C33]",
      compact ? "p-4" : "p-5 sm:p-6",
    )}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#D9A441]/20 text-[#D9A441]"><Palette className="size-5" /></span>
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.045em] text-[#151A17] dark:text-[#E9EDEF]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#5F6861] dark:text-[#AEBAC1]">{description}</p>
        </div>
      </div>

      <div className="mt-5 space-y-6">
        <div>
          <p className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">Chat background colors</p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            {WALLPAPER_COLOR_SWATCHES.map(swatch => {
              const active = swatch.color === null
                ? setting.kind === "default"
                : setting.kind === "color" && setting.color?.toLowerCase() === swatch.color.toLowerCase();
              return (
                <button
                  key={swatch.label}
                  type="button"
                  title={swatch.label}
                  aria-label={`Use ${swatch.label} background`}
                  aria-pressed={active}
                  onClick={() => setColor(swatch.color)}
                  className={cn(
                    "grid size-9 place-items-center rounded-full border transition-transform",
                    active ? "scale-110 border-[#D9A441] ring-2 ring-[#D9A441]/40" : "border-black/10 hover:scale-105 dark:border-white/20",
                  )}
                  style={swatch.color ? { backgroundColor: swatch.color } : { background: "linear-gradient(135deg, #fcfaf4 50%, #0B0F0E 50%)" }}
                >
                  {active ? <Check className={cn("size-4", swatch.color && isLightHex(swatch.color) ? "text-black/60" : "text-white")} /> : null}
                </button>
              );
            })}
            <label
              title="Pick a custom color"
              className="grid size-9 cursor-pointer place-items-center rounded-full border border-black/10 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.55)] transition-transform hover:scale-105 dark:border-white/20"
              style={{ background: "conic-gradient(#f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f87171)" }}
            >
              <Plus className="size-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
              <input
                type="color"
                aria-label="Pick a custom color"
                className="sr-only"
                value={setting.kind === "color" && setting.color ? setting.color : "#D9A441"}
                onChange={event => setColor(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">Savanna wallpapers</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SAVANNA_WALLPAPERS.map(option => {
              const active = setting.kind === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSavannaWallpaper(option.id)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-2xl border p-2 text-left transition-colors",
                    active ? "border-[#D9A441] bg-[#D9A441]/10" : "border-[#eadfca] hover:bg-[#D9A441]/5 dark:border-[#2A3942]",
                  )}
                >
                  <span className="grid grid-cols-2 gap-2">
                    <span className={cn("block w-full rounded-xl bg-cover bg-center", option.aspect)} style={{ backgroundImage: `url(${option.lightImage})` }} />
                    <span className={cn("block w-full rounded-xl bg-cover bg-center", option.aspect)} style={{ backgroundImage: `url(${option.darkImage})` }} />
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-2 px-1 pb-1">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">{option.label}</span>
                      <span className="block truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">{option.description}</span>
                    </span>
                    {active ? <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#D9A441] text-white"><Check className="size-3.5" /></span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">Your own wallpaper</p>
          <p className="mt-1 text-xs text-[#5F6861] dark:text-[#9AA1A6]">
            Add a portrait image for phones and a landscape one for desktop — they are independent, and
            leaving one empty makes it reuse the other.
          </p>
          <p className="mt-1 text-xs text-[#5F6861] dark:text-[#9AA1A6]">
            Best fit: <span className="font-semibold">1080 × 2340</span> (9:19.5) portrait,{" "}
            <span className="font-semibold">1800 × 1500</span> (6:5) landscape. Anything close works —
            the chat is a tall, narrow panel, so a 16:9 image loses about a third of its width.
          </p>
          <div className="mt-3 space-y-2.5">
            {CUSTOM_SLOTS.map(({ slot, label, audience, thumbClassName, inUse }) => {
              const own = slot === "portrait" ? portrait : landscape;
              const borrowed = own ? null : slot === "portrait" ? landscape : portrait;
              return (
                <div
                  key={slot}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-2.5",
                    own && setting.kind === "custom"
                      ? "border-[#D9A441] bg-[#D9A441]/5"
                      : "border-[#eadfca] dark:border-[#2A3942]",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded-lg border border-black/5 bg-[#D9A441]/10 bg-cover bg-center dark:border-white/10",
                      thumbClassName,
                    )}
                    style={own || borrowed ? { backgroundImage: `url(${own || borrowed})` } : undefined}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#151A17] dark:text-[#E9EDEF]">
                      {label}
                      <span className="ml-1.5 text-xs font-normal text-[#5F6861] dark:text-[#AEBAC1]">{audience}</span>
                    </p>
                    <p className="truncate text-xs text-[#5F6861] dark:text-[#AEBAC1]">
                      {own && setting.kind === "custom"
                        ? inUse
                        : borrowed
                          ? `Reusing your ${slot === "portrait" ? "landscape" : "portrait"} image`
                          : "Not set"}
                    </p>
                  </div>
                  <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#D9A441]/20 px-3 text-xs font-semibold text-[#9a6410] transition-colors hover:bg-[#D9A441]/30 dark:bg-[#2A3942] dark:text-[#F2C14E]">
                    <Upload className="size-3.5" />
                    {own ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      aria-label={`Upload ${label.toLowerCase()} wallpaper`}
                      onChange={event => void handleWallpaperFile(slot, event)}
                    />
                  </label>
                  {own ? (
                    <button
                      type="button"
                      aria-label={`Remove ${label.toLowerCase()} wallpaper`}
                      onClick={() => clearCustomImage(slot)}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-[#5F6861] transition-colors hover:bg-black/5 dark:text-[#AEBAC1] dark:hover:bg-white/10"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {hasAnyCustom ? (
              <span className="flex items-center gap-2 rounded-full bg-[#D9A441]/10 py-1 pl-1 pr-3">
                <span
                  className="size-8 rounded-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${portrait || landscape})` }}
                />
                <span className="text-xs font-semibold text-[#5F6861] dark:text-[#AEBAC1]">In use</span>
              </span>
            ) : null}
            {setting.kind !== "default" ? (
              <Button type="button" variant="outline" onClick={resetWallpaper} className="rounded-xl border-0 bg-transparent text-[#5F6861] shadow-none hover:bg-[#D9A441]/10 dark:text-[#AEBAC1]">
                <RotateCcw className="mr-2 size-4" />Reset to default
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-[#5F6861] dark:text-[#9AA1A6]">
            PNG or JPG up to {MAX_UPLOAD_MB} MB — resized on your device before it is saved. Stored on this device only.
          </p>
        </div>
      </div>
    </section>
  );
}
