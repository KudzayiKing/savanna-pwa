import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "./ThemeContext";

/**
 * Wallpaper preferences are device-local (like the theme toggle): they live in
 * localStorage and are never written to Firestore, so a wallpaper picked on a
 * phone does not leak onto the person's desktop session.
 */
const WALLPAPER_STORAGE_KEY = "savanna-wallpaper:v1";

/** Anything larger would be base64-inflated past the ~5MB localStorage budget. */
export const MAX_CUSTOM_WALLPAPER_BYTES = 3 * 1024 * 1024;

export type WallpaperKind = "default" | "color" | "savanna-mobile" | "savanna-web" | "custom";

export type WallpaperSetting = {
  kind: WallpaperKind;
  color: string | null;
  customImage: string | null;
};

export type SavannaWallpaperOption = {
  id: "savanna-mobile" | "savanna-web";
  label: string;
  description: string;
  lightImage: string;
  darkImage: string;
  aspect: string;
};

const DEFAULT_SETTING: WallpaperSetting = { kind: "default", color: null, customImage: null };

const KINDS: WallpaperKind[] = ["default", "color", "savanna-mobile", "savanna-web", "custom"];

/**
 * The bundled Savanna artwork. The mobile cut is portrait (941x1672) and the
 * web cut is landscape (1672x941); each ships in a light and dark variant and
 * the active one is swapped automatically when the user toggles the theme.
 */
export const SAVANNA_WALLPAPERS: SavannaWallpaperOption[] = [
  {
    id: "savanna-mobile",
    label: "Savanna (mobile)",
    description: "Portrait art for phone chats.",
    lightImage: "/savanna_light_wallpaper.png",
    darkImage: "/savanna_dark_wallpaper.png",
    aspect: "aspect-[9/16]",
  },
  {
    id: "savanna-web",
    label: "Savanna (web)",
    description: "Landscape art for desktop chats.",
    lightImage: "/savanna_light_wallpaper_web.png",
    darkImage: "/savanna_dark_wallpaper_web.png",
    aspect: "aspect-video",
  },
];

/**
 * Solid backgrounds. The first two entries are the app's own default theme
 * backgrounds, so "match the theme" and "pick that exact color" are both one
 * tap away.
 */
export const WALLPAPER_COLOR_SWATCHES: { label: string; color: string | null }[] = [
  { label: "Default", color: null },
  { label: "Savanna light", color: "#fcfaf4" },
  { label: "Savanna dark", color: "#0B0F0E" },
  { label: "Parchment", color: "#f6f0e2" },
  { label: "Fern", color: "#dce6d8" },
  { label: "Dune", color: "#e8dfc9" },
  { label: "Clay", color: "#9c5337" },
  { label: "Gold", color: "#D9A441" },
  { label: "Forest", color: "#1F3B2C" },
  { label: "Night chat", color: "#111B21" },
  { label: "Slate chat", color: "#202C33" },
  { label: "Charcoal", color: "#151A17" },
];

function readStoredSetting(): WallpaperSetting {
  try {
    const raw = localStorage.getItem(WALLPAPER_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTING;
    const parsed = JSON.parse(raw) as Partial<WallpaperSetting> | null;
    if (!parsed || !KINDS.includes(parsed.kind as WallpaperKind)) return DEFAULT_SETTING;
    return {
      kind: parsed.kind as WallpaperKind,
      color: typeof parsed.color === "string" ? parsed.color : null,
      customImage: typeof parsed.customImage === "string" ? parsed.customImage : null,
    };
  } catch {
    return DEFAULT_SETTING;
  }
}

type WallpaperContextValue = {
  setting: WallpaperSetting;
  activeImage: string | null;
  activeColor: string | null;
  setColor: (color: string | null) => void;
  setSavannaWallpaper: (kind: "savanna-mobile" | "savanna-web") => void;
  setCustomImage: (dataUrl: string) => void;
  resetWallpaper: () => void;
};

const WallpaperContext = createContext<WallpaperContextValue | undefined>(undefined);

export function WallpaperProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [setting, setSetting] = useState<WallpaperSetting>(readStoredSetting);
  const [prefersLandscapeWallpaper, setPrefersLandscapeWallpaper] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px), (orientation: landscape)").matches;
  });

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px), (orientation: landscape)");
    const syncPreference = () => setPrefersLandscapeWallpaper(query.matches);
    syncPreference();
    query.addEventListener("change", syncPreference);
    return () => query.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    try {
      if (setting.kind === "default") {
        localStorage.removeItem(WALLPAPER_STORAGE_KEY);
      } else {
        localStorage.setItem(WALLPAPER_STORAGE_KEY, JSON.stringify(setting));
      }
    } catch {
      // Quota exceeded or storage disabled: the wallpaper still applies for
      // this visit, it just will not survive a reload.
    }

    const root = document.documentElement;
    if (setting.kind === "default") {
      root.removeAttribute("data-wallpaper");
      root.style.removeProperty("--savanna-wallpaper-color");
      root.style.removeProperty("--savanna-wallpaper-image");
      root.style.removeProperty("--savanna-wallpaper-image-portrait");
      root.style.removeProperty("--savanna-wallpaper-image-landscape");
      return;
    }
    // The wallpaper lives behind the chat thread only. The data attribute is
    // what gates the CSS: with no wallpaper chosen the attribute is absent and
    // the thread keeps its regular opaque theme background.
    root.dataset.wallpaper = setting.kind === "color" ? "color" : "image";
    if (setting.kind === "color" && setting.color) {
      root.style.setProperty("--savanna-wallpaper-color", setting.color);
    } else {
      root.style.removeProperty("--savanna-wallpaper-color");
    }
    let image = "none";
    if (setting.kind === "savanna-mobile" || setting.kind === "savanna-web") {
      // Both bundled cuts are published together so a chat opened on a phone
      // shows the portrait art while the same choice on a desktop shows the
      // landscape art; the CSS media query picks between them.
      const portraitImage = theme === "dark" ? SAVANNA_WALLPAPERS[0].darkImage : SAVANNA_WALLPAPERS[0].lightImage;
      const landscapeImage = theme === "dark" ? SAVANNA_WALLPAPERS[1].darkImage : SAVANNA_WALLPAPERS[1].lightImage;
      root.style.setProperty("--savanna-wallpaper-image-portrait", `url("${portraitImage}")`);
      root.style.setProperty("--savanna-wallpaper-image-landscape", `url("${landscapeImage}")`);
      image = `url("${prefersLandscapeWallpaper ? landscapeImage : portraitImage}")`;
    } else {
      root.style.removeProperty("--savanna-wallpaper-image-portrait");
      root.style.removeProperty("--savanna-wallpaper-image-landscape");
      if (setting.kind === "custom" && setting.customImage) {
        image = `url("${setting.customImage}")`;
      }
    }
    root.style.setProperty("--savanna-wallpaper-image", image);
  }, [prefersLandscapeWallpaper, setting, theme]);

  const setColor = useCallback((color: string | null) => {
    setSetting(color ? { kind: "color", color, customImage: null } : DEFAULT_SETTING);
  }, []);

  const setSavannaWallpaper = useCallback((kind: "savanna-mobile" | "savanna-web") => {
    setSetting({ kind, color: null, customImage: null });
  }, []);

  const setCustomImage = useCallback((dataUrl: string) => {
    setSetting({ kind: "custom", color: null, customImage: dataUrl });
  }, []);

  const resetWallpaper = useCallback(() => setSetting(DEFAULT_SETTING), []);

  const value = useMemo<WallpaperContextValue>(() => {
    const activeImage =
      setting.kind === "savanna-mobile" || setting.kind === "savanna-web"
        ? prefersLandscapeWallpaper
          ? theme === "dark" ? SAVANNA_WALLPAPERS[1].darkImage : SAVANNA_WALLPAPERS[1].lightImage
          : theme === "dark" ? SAVANNA_WALLPAPERS[0].darkImage : SAVANNA_WALLPAPERS[0].lightImage
          : setting.kind === "custom" ? setting.customImage : null;
    return {
      setting,
      activeImage,
      activeColor: setting.kind === "color" ? setting.color : null,
      setColor,
      setSavannaWallpaper,
      setCustomImage,
      resetWallpaper,
    };
  }, [prefersLandscapeWallpaper, setting, theme, setColor, setSavannaWallpaper, setCustomImage, resetWallpaper]);

  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>;
}

export function useWallpaper() {
  const context = useContext(WallpaperContext);
  if (!context) {
    throw new Error("useWallpaper must be used within WallpaperProvider");
  }
  return context;
}
