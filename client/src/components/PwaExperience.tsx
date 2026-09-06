import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { Download, RefreshCw, Smartphone, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const INSTALL_PROMPT_SESSION_KEY = "savanna.pwa.installPrompt.seen";

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isMobileInstallSurface() {
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

function addMediaQueryListener(query: MediaQueryList, listener: () => void) {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }
  query.addListener(listener);
  return () => query.removeListener(listener);
}

export function PwaStatusBanner() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const markOnline = () => setIsOnline(true);
    const markOffline = () => setIsOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[60] border-b border-[#e5c79c] bg-[#fff5e2] px-4 py-2.5 text-[#6f491d]"
    >
      <div className="mx-auto flex max-w-[1720px] items-center gap-2 text-sm font-medium">
        <WifiOff className="size-4 shrink-0" />
        <span>
          You’re offline. Savanna can keep approved cached pages and local
          drafts available, but payments and live updates are paused until you
          reconnect.
        </span>
      </div>
    </div>
  );
}

export function PwaAppPrompts() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [showInstallGuidance, setShowInstallGuidance] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => isStandaloneDisplay());
  const [isMobile, setIsMobile] = useState(() => isMobileInstallSurface());
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const fullscreenQuery = window.matchMedia("(display-mode: fullscreen)");
    const mobileQuery = window.matchMedia("(max-width: 767px), (pointer: coarse)");
    const syncInstallState = () => {
      setIsInstalled(isStandaloneDisplay());
      setIsMobile(isMobileInstallSurface());
    };

    const cleanups = [
      addMediaQueryListener(standaloneQuery, syncInstallState),
      addMediaQueryListener(fullscreenQuery, syncInstallState),
      addMediaQueryListener(mobileQuery, syncInstallState),
    ];

    const captureInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (isMobileInstallSurface() && !isStandaloneDisplay()) {
        setInstallOpen(true);
      }
    };
    const markInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setInstallOpen(false);
      setShowInstallGuidance(false);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", markInstalled);

    return () => {
      cleanups.forEach(cleanup => cleanup());
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isMobile || isInstalled) return;
    if (sessionStorage.getItem(INSTALL_PROMPT_SESSION_KEY)) return;

    const timer = window.setTimeout(() => setInstallOpen(true), 1400);
    return () => window.clearTimeout(timer);
  }, [isInstalled, isMobile]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleUpdateReady = (event: Event) => {
      const worker = (event as CustomEvent<{ worker?: ServiceWorker }>).detail?.worker;
      if (worker) setWaitingWorker(worker);
    };

    window.addEventListener("savanna:pwa-update-ready", handleUpdateReady);
    navigator.serviceWorker.getRegistration()
      .then(registration => {
        if (registration?.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }
      })
      .catch(error => console.warn("[PWA] Could not inspect service worker update state", error));

    return () => window.removeEventListener("savanna:pwa-update-ready", handleUpdateReady);
  }, []);

  const dismissInstall = () => {
    sessionStorage.setItem(INSTALL_PROMPT_SESSION_KEY, "true");
    setInstallOpen(false);
    setShowInstallGuidance(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setShowInstallGuidance(true);
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      setInstallOpen(false);
      setShowInstallGuidance(false);
    } else {
      dismissInstall();
    }
    setDeferredPrompt(null);
  };

  const handleUpdate = () => {
    setIsUpdating(true);
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    window.location.reload();
  };

  return (
    <>
      <Drawer
        open={installOpen && isMobile && !isInstalled}
        onOpenChange={open => {
          if (open) {
            setInstallOpen(true);
            return;
          }
          dismissInstall();
        }}
      >
        <DrawerContent className="savanna-pwa-install-drawer rounded-t-[28px] border-[#ead2a4] bg-[#fffaf0] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] dark:border-[#5b4833] dark:bg-[#111B21]">
          <DrawerHeader className="text-left">
            <span className="savanna-brand-token grid size-14 place-items-center rounded-2xl">
              <Smartphone className="size-7" />
            </span>
            <DrawerTitle className="mt-3 text-left font-display text-3xl text-[#151A17] dark:text-[#E9EDEF]">
              Download Savanna
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4">
            {showInstallGuidance || !deferredPrompt ? (
              <div className="rounded-2xl bg-[#D9A441]/10 p-4 text-sm leading-6 text-[#5F6861] dark:text-[#E9EDEF]">
                On iPhone, open Safari, tap Share, then Add to Home Screen. On Android, use your browser menu and choose Install app.
              </div>
            ) : null}
          </div>
          <DrawerFooter className="px-4">
            <Button type="button" onClick={handleInstall} className="savanna-brand-token h-12 rounded-2xl shadow-none">
              <Download className="mr-2 size-4" />
              Download app
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={dismissInstall}
              className="h-11 rounded-2xl text-[#5F6861] hover:bg-[#D9A441]/10 hover:text-[#D9A441] dark:text-[#AEBAC1]"
            >
              Not now
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {waitingWorker ? (
        <div
          role="status"
          aria-live="polite"
          className="savanna-pwa-update-prompt fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] left-1/2 z-[70] flex w-[min(calc(100vw-1.5rem),430px)] -translate-x-1/2 items-center gap-3 rounded-[24px] border-0 p-3 text-[#151A17] dark:text-[#E9EDEF] lg:bottom-4 lg:w-auto lg:min-w-[340px]"
        >
          <span className="savanna-brand-token grid size-10 shrink-0 place-items-center rounded-2xl">
            <RefreshCw className={cn("size-5", isUpdating && "animate-spin")} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">New version ready</span>
            <span className="block text-xs text-[#5F6861] dark:text-[#AEBAC1]">
              Update Savanna to get the latest changes.
            </span>
          </span>
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={isUpdating}
            className="savanna-brand-token h-10 shrink-0 rounded-2xl px-4 shadow-none"
          >
            Update
          </Button>
        </div>
      ) : null}
    </>
  );
}

export function InstallSavannaButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showGuidance, setShowGuidance] = useState(false);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuidance(false);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setShowGuidance(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  if (isInstalled) return null;

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="outline"
        onClick={handleInstall}
        className="w-full rounded-xl border-[#ead2a4] bg-white/55 text-[#7b4a0d] hover:bg-white"
      >
        <Download className="mr-2 size-4" /> Install Savanna
      </Button>
      {showGuidance ? (
        <div
          role="dialog"
          aria-label="Install Savanna guidance"
          className="absolute bottom-[calc(100%+0.75rem)] left-0 z-50 w-[270px] rounded-2xl border border-[#eadbc0] bg-white p-4 text-left shadow-[0_18px_45px_rgba(84,55,15,0.16)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#3d2d1a]">
                Install from your browser
              </p>
              <p className="mt-1.5 text-xs leading-5 text-[#796b56]">
                Choose <strong>Install Savanna</strong> from your browser menu.
                On Apple devices, use Share then{" "}
                <strong>Add to Home Screen</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuidance(false)}
              className="rounded-lg p-1 text-[#687462] hover:bg-[#eef2e9]"
              aria-label="Close installation guidance"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ConnectionPill() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#8a765d]">
      {isOnline ? (
        <Wifi className="size-3.5 text-[#b36c10]" />
      ) : (
        <WifiOff className="size-3.5 text-[#a56d30]" />
      )}
      {isOnline ? "Connected" : "Offline"}
    </span>
  );
}
