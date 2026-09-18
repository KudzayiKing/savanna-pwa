import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  CallSession,
  createCallDoc,
  setCallStatus,
  useIncomingCalls,
  type CallDoc,
  type CallKind,
  type CallStatus,
} from "@/lib/firebaseCalls";
import type { FirebaseConversationListItem } from "@/lib/firebaseChat";

type CallPhase = "ringing-out" | "connecting" | "active" | "ended";

export type ActiveCallState = {
  call: CallDoc;
  isCaller: boolean;
  phase: CallPhase;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  cameraOn: boolean;
  error: string | null;
};

type CallContextValue = {
  /** Calls where the user is a member but not the caller, still ringing. */
  incoming: CallDoc[];
  /** The call the user is actively in (outgoing or accepted), or null. */
  active: ActiveCallState | null;
  startCall: (
    conversation: Pick<FirebaseConversationListItem, "id" | "kind" | "memberIds">,
    kind: CallKind,
  ) => void;
  acceptCall: (call: CallDoc) => void;
  declineCall: (callId: string) => void;
  hangup: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const incoming = useIncomingCalls(user);
  const [active, setActive] = useState<ActiveCallState | null>(null);

  const sessionRef = useRef<CallSession | null>(null);
  const acceptedRef = useRef<Set<string>>(new Set());
  const localEndedRef = useRef<Set<string>>(new Set());
  const seenIncoming = useRef<Map<string, CallDoc>>(new Map());

  const buildSessionListeners = useCallback(
    () =>
      ({
        onLocalStream: (stream: MediaStream) =>
          setActive((a) => (a ? { ...a, localStream: stream } : a)),
        onRemoteStream: (stream: MediaStream) =>
          setActive((a) => (a ? { ...a, remoteStream: stream } : a)),
        onConnectionState: (state: RTCPeerConnectionState) =>
          setActive((a) => {
            if (!a) return a;
            if (state === "connected") return { ...a, phase: "active" };
            if (state === "connecting") return { ...a, phase: "connecting" };
            return a;
          }),
        onCallEnded: (status: CallStatus) => {
          const current = sessionRef.current;
          const callId = current?.callId;
          current?.dispose();
          sessionRef.current = null;
          setActive((a) => (a && a.call.id === callId ? null : a));
          if (callId && !localEndedRef.current.has(callId)) {
            toast.info(status === "declined" ? "Call declined" : "Call ended");
          }
        },
        onError: (message: string) =>
          setActive((a) => (a ? { ...a, error: message } : a)),
      }) as const,
    [],
  );

  const startCall = useCallback(
    (
      conversation: Pick<FirebaseConversationListItem, "id" | "kind" | "memberIds">,
      kind: CallKind,
    ) => {
      if (!user) return;
      if (active) return;
      if (conversation.memberIds.length !== 2) {
        toast.error("Group calls aren't available in this release.");
        return;
      }
      const peerId =
        conversation.memberIds.find((id) => id && id !== user.id) ?? null;
      if (!peerId) return;

      void (async () => {
        try {
          const callId = await createCallDoc({
            conversationId: conversation.id,
            callerId: user.id,
            kind,
            memberIds: conversation.memberIds,
          });
          const call: CallDoc = {
            id: callId,
            conversationId: conversation.id,
            callerId: user.id,
            kind,
            status: "ringing",
            memberIds: conversation.memberIds,
            createdAt: null,
            endedAt: null,
          };
          const session = new CallSession({
            call,
            selfId: user.id,
            peerId,
            isCaller: true,
            listeners: buildSessionListeners(),
          });
          sessionRef.current = session;
          setActive({
            call,
            isCaller: true,
            phase: "ringing-out",
            localStream: null,
            remoteStream: null,
            micOn: true,
            cameraOn: kind === "video",
            error: null,
          });
          await session.start();
        } catch {
          /* error surfaced via the onError listener */
        }
      })();
    },
    [user, active, buildSessionListeners],
  );

  const acceptCall = useCallback(
    (call: CallDoc) => {
      if (!user || active) return;
      const peerId =
        call.memberIds.find((id) => id && id !== user.id) ?? null;
      if (!peerId) return;
      acceptedRef.current.add(call.id);

      const session = new CallSession({
        call,
        selfId: user.id,
        peerId,
        isCaller: false,
        listeners: buildSessionListeners(),
      });
      sessionRef.current = session;
      setActive({
        call,
        isCaller: false,
        phase: "connecting",
        localStream: null,
        remoteStream: null,
        micOn: true,
        cameraOn: call.kind === "video",
        error: null,
      });
      // Tell the caller we picked up (rules permit any member to flip status).
      void setCallStatus(call.id, "active");
      void session.start();
    },
    [user, active, buildSessionListeners],
  );

  const declineCall = useCallback((callId: string) => {
    localEndedRef.current.add(callId);
    void setCallStatus(callId, "declined");
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setActive((a) => (a && a.call.id === callId ? null : a));
  }, []);

  const hangup = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    localEndedRef.current.add(current.callId);
    void setCallStatus(current.callId, "ended");
    current.dispose();
    sessionRef.current = null;
    setActive(null);
  }, []);

  const toggleMic = useCallback(() => {
    setActive((a) => {
      if (!a) return a;
      const next = !a.micOn;
      sessionRef.current?.setMicEnabled(next);
      return { ...a, micOn: next };
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setActive((a) => {
      if (!a) return a;
      const next = !a.cameraOn;
      sessionRef.current?.setCameraEnabled(next);
      return { ...a, cameraOn: next };
    });
  }, []);

  // Surface a "Missed call" toast when a ringing incoming call goes away
  // without the user accepting it (caller hung up / gave up).
  useEffect(() => {
    const current = new Map(incoming.map((c) => [c.id, c]));
    seenIncoming.current.forEach((call, id) => {
      if (!current.has(id) && !acceptedRef.current.has(id)) {
        toast.info(`Missed ${call.kind} call`);
      }
    });
    seenIncoming.current = current;
  }, [incoming]);

  // Tear down the media + listeners if the provider unmounts mid-call.
  useEffect(() => {
    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({
      incoming: active
        ? incoming.filter((c) => c.id !== active.call.id)
        : incoming,
      active,
      startCall,
      acceptCall,
      declineCall,
      hangup,
      toggleMic,
      toggleCamera,
    }),
    [
      incoming,
      active,
      startCall,
      acceptCall,
      declineCall,
      hangup,
      toggleMic,
      toggleCamera,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return ctx;
}
