import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCall, type ActiveCallState } from "@/contexts/CallContext";
import { getUserProfile, type AppUser } from "@/lib/userProfile";
import { cn } from "@/lib/utils";

/** Resolve a peer's public profile (name + photo) for the call chrome. */
function usePeerProfile(peerId: string | null): AppUser | null {
  const [profile, setProfile] = useState<AppUser | null>(null);
  useEffect(() => {
    if (!peerId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    void getUserProfile(peerId).then((found) => {
      if (!cancelled) setProfile(found);
    });
    return () => {
      cancelled = true;
    };
  }, [peerId]);
  return profile;
}

function PeerAvatar({
  profile,
  label,
  className,
}: {
  profile: AppUser | null;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden rounded-full bg-[#D9A441]/20 text-[#9a6410]",
        className,
      )}
    >
      {profile?.photoURL ? (
        <img src={profile.photoURL} alt={label} className="size-full object-cover" />
      ) : (
        <span className="font-display text-3xl font-semibold">
          {label.charAt(0).toUpperCase() || "S"}
        </span>
      )}
    </div>
  );
}

function VideoTile({
  stream,
  mirror,
  className,
}: {
  stream: MediaStream | null;
  mirror?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={mirror}
      className={cn(
        "size-full object-cover",
        mirror && "scale-x-[-1]",
        className,
      )}
    />
  );
}

function CallControls({
  micOn,
  cameraOn,
  isVideo,
  onToggleMic,
  onToggleCamera,
  onHangup,
}: {
  micOn: boolean;
  cameraOn: boolean;
  isVideo: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onToggleMic}
        aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        className={cn(
          "grid size-14 place-items-center rounded-full transition",
          micOn
            ? "bg-white/15 text-white hover:bg-white/25"
            : "bg-red-500/90 text-white hover:bg-red-500",
        )}
      >
        {micOn ? <Mic className="size-6" /> : <MicOff className="size-6" />}
      </button>
      {isVideo && (
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
          className={cn(
            "grid size-14 place-items-center rounded-full transition",
            cameraOn
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-red-500/90 text-white hover:bg-red-500",
          )}
        >
          {cameraOn ? <Video className="size-6" /> : <VideoOff className="size-6" />}
        </button>
      )}
      <button
        type="button"
        onClick={onHangup}
        aria-label="End call"
        className="grid size-16 place-items-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
      >
        <PhoneOff className="size-7" />
      </button>
    </div>
  );
}

function IncomingCall({
  peerId,
  kind,
  onAccept,
  onDecline,
}: {
  peerId: string;
  kind: "audio" | "video";
  onAccept: () => void;
  onDecline: () => void;
}) {
  const profile = usePeerProfile(peerId);
  const label = profile?.name || profile?.username || "Caller";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="flex w-[20rem] flex-col items-center gap-5 rounded-3xl bg-[#211913] p-8 text-center text-white shadow-2xl"
    >
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ repeat: Infinity, duration: 1.6 }}
      >
        <PeerAvatar profile={profile} label={label} className="size-24" />
      </motion.div>
      <div>
        <p className="font-display text-xl font-semibold">{label}</p>
        <p className="mt-1 text-sm text-white/70">
          Incoming {kind} call…
        </p>
      </div>
      <div className="flex w-full items-center justify-center gap-5">
        <button
          type="button"
          onClick={onDecline}
          aria-label="Decline call"
          className="grid size-14 place-items-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
        >
          <PhoneOff className="size-6" />
        </button>
        <button
          type="button"
          onClick={onAccept}
          aria-label="Accept call"
          className="grid size-14 place-items-center rounded-full bg-green-500 text-white transition hover:bg-green-600"
        >
          <Phone className="size-6" />
        </button>
      </div>
    </motion.div>
  );
}

function ActiveCall({
  peerId,
  kind,
  state,
  onToggleMic,
  onToggleCamera,
  onHangup,
}: {
  peerId: string;
  kind: "audio" | "video";
  state: ActiveCallState;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onHangup: () => void;
}) {
  const profile = usePeerProfile(peerId);
  const label = profile?.name || profile?.username || "Caller";
  const statusText =
    state.phase === "ringing-out"
      ? "Ringing…"
      : state.phase === "connecting"
        ? "Connecting…"
        : state.error
          ? state.error
          : "Connected";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col bg-[#14110d]"
    >
      {kind === "video" && (
        <div className="absolute inset-0">
          {state.remoteStream ? (
            <VideoTile stream={state.remoteStream} />
          ) : (
            <div className="flex size-full items-center justify-center bg-[#1c1712]">
              <PeerAvatar profile={profile} label={label} className="size-32" />
            </div>
          )}
        </div>
      )}

      {kind === "audio" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <PeerAvatar profile={profile} label={label} className="size-36" />
          <p className="font-display text-2xl font-semibold text-white">{label}</p>
        </div>
      )}

      {/* Local PiP (video only) */}
      {kind === "video" && (
        <div className="absolute bottom-28 right-4 size-28 overflow-hidden rounded-2xl border border-white/20 shadow-lg">
          <VideoTile stream={state.localStream} mirror />
          {!state.cameraOn && (
            <div className="absolute inset-0 grid place-items-center bg-[#1c1712] text-xs text-white/70">
              Camera off
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 mt-auto flex flex-col gap-4 p-6">
        <p className="text-center text-sm text-white/80">{statusText}</p>
        <CallControls
          micOn={state.micOn}
          cameraOn={state.cameraOn}
          isVideo={kind === "video"}
          onToggleMic={onToggleMic}
          onToggleCamera={onToggleCamera}
          onHangup={onHangup}
        />
      </div>
    </motion.div>
  );
}

/**
 * Global call surface. Renders nothing when idle, the incoming ring when
 * someone calls the user, and the in-call screen for the active call. Mounted
 * once at the app root so calls work from any route.
 */
export function CallOverlay() {
  const { user } = useAuth();
  const { incoming, active, acceptCall, declineCall, hangup, toggleMic, toggleCamera } =
    useCall();

  const peerId = (() => {
    const call = active?.call ?? incoming[0];
    if (!call || !user) return null;
    if (active) {
      return call.memberIds.find((id) => id && id !== user.id) ?? null;
    }
    return call.callerId;
  })();

  return (
    <AnimatePresence>
      {active ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-0 backdrop-blur-sm sm:p-6">
          <div className="relative size-full overflow-hidden rounded-none bg-[#14110d] sm:size-auto sm:aspect-[9/16] sm:max-h-[90vh] sm:w-[22rem] sm:rounded-3xl">
            <ActiveCall
              peerId={peerId ?? ""}
              kind={active.call.kind}
              state={active}
              onToggleMic={toggleMic}
              onToggleCamera={toggleCamera}
              onHangup={hangup}
            />
          </div>
        </div>
      ) : incoming[0] ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <IncomingCall
            peerId={peerId ?? ""}
            kind={incoming[0].kind}
            onAccept={() => acceptCall(incoming[0])}
            onDecline={() => declineCall(incoming[0].id)}
          />
        </div>
      ) : null}
    </AnimatePresence>
  );
}
