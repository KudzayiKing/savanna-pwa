import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
