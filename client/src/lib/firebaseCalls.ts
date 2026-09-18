/**
 * WebRTC voice + video calling over Firestore signalling.
 *
 * Signalling model (see `firestore.rules` → `calls/{callId}`):
 *   - One `calls/{callId}` document per call, owned by the caller, with a
 *     closed field set (`conversationId`, `callerId`, `kind`, `status`,
 *     `memberIds`, `createdAt`, `endedAt`). `memberIds` is 2–16.
 *   - Under it, `signalling/{peerId}` — a single document per participant,
 *     named after their own uid, that they alone may write. It carries the SDP
 *     offer/answer plus ICE fields.
 *
 * Because each peer may only write their OWN signalling document, the only
 * topology the rules permit is a 1:1 exchange: the caller writes the offer to
 * `signalling/{callerId}`, the single callee writes the answer to
 * `signalling/{calleeId}`. Group mesh calling would need per-pair offer docs,
 * which the schema forbids, so MVP exposes 1:1 calls only (the UI gates group
 * conversations). This keeps the release honest and the rules forward-compatible.
 *
 * ICE is exchanged non-trickle: each side waits for gathering to complete so
 * the full candidate set is embedded in the SDP it writes. That fits the
 * single-document-per-peer constraint without losing candidates, at the cost
 * of a brief negotiation delay — acceptable for 1:1 with public STUN.
 */

import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type Firestore,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
  query,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { getFirestoreDb } from "./firebase";
import type { AppUser } from "./userProfile";

export type CallKind = "audio" | "video";
export type CallStatus = "ringing" | "active" | "ended" | "declined" | "missed";

export type CallDoc = {
  id: string;
  conversationId: string;
  callerId: string;
  kind: CallKind;
  status: CallStatus;
  memberIds: string[];
  createdAt: unknown | null;
  endedAt: unknown | null;
};

/** Public Google STUN — no TURN, so calls behind symmetric NATs may fail. */
const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

type CallSessionListeners = {
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onCallEnded?: (status: CallStatus) => void;
  onError?: (message: string) => void;
};

/**
 * Drives a single 1:1 WebRTC connection. Framework-agnostic: the React layer
 * owns the lifecycle and renders from the listener callbacks.
 */
export class CallSession {
  readonly callId: string;
  readonly conversationId: string;
  readonly kind: CallKind;
  readonly callerId: string;
  readonly selfId: string;
  readonly peerId: string;
  readonly isCaller: boolean;

  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;

  private pc: RTCPeerConnection | null = null;
  private unsubscribers: Array<() => void> = [];
  private listeners: CallSessionListeners;
  private disposed = false;
  private remoteApplied = false;

  constructor(opts: {
    call: CallDoc;
    selfId: string;
    peerId: string;
    isCaller: boolean;
    listeners?: CallSessionListeners;
  }) {
    this.callId = opts.call.id;
    this.conversationId = opts.call.conversationId;
    this.kind = opts.call.kind;
    this.callerId = opts.call.callerId;
    this.selfId = opts.selfId;
    this.peerId = opts.peerId;
    this.isCaller = opts.isCaller;
    this.listeners = opts.listeners ?? {};
  }

  private db(): Firestore {
    return getFirestoreDb();
  }

  private signallingRef(uid: string) {
    return doc(this.db(), "calls", this.callId, "signalling", uid);
  }

  /** Acquire the camera/mic, then negotiate. Throws on permission denial. */
  async start(): Promise<void> {
    await this.initLocalMedia();
    this.pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.wirePc();
    this.localStream
      ?.getTracks()
      .forEach((track) => this.pc!.addTrack(track, this.localStream!));
    this.watchCallDoc();
    if (this.isCaller) await this.runAsCaller();
    else await this.runAsCallee();
  }

  private async initLocalMedia(): Promise<void> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.kind === "video",
      });
      this.listeners.onLocalStream?.(this.localStream);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera and microphone permission is required to join the call."
          : "Could not access the camera or microphone.";
      this.listeners.onError?.(message);
      throw error;
    }
  }

  private wirePc(): void {
    const pc = this.pc!;
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        this.remoteStream = stream;
        this.listeners.onRemoteStream?.(stream);
      }
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.listeners.onConnectionState?.(state);
      if (state === "failed") {
        this.listeners.onError?.(
          "The connection failed. Check your network and try again.",
        );
      }
    };
  }

  /** Caller: write the offer (with embedded ICE) and await the callee's answer. */
  private async runAsCaller(): Promise<void> {
    const pc = this.pc!;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIceComplete(pc);
    await setDoc(this.signallingRef(this.selfId), {
      uid: this.selfId,
      type: pc.localDescription!.type,
      sdp: pc.localDescription!.sdp,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const unsub = onSnapshot(this.signallingRef(this.peerId), (snap) => {
      if (this.disposed || this.remoteApplied || !snap.exists()) return;
      const data = snap.data() as { type?: string; sdp?: string };
      if (data.type === "answer" && data.sdp) {
        this.remoteApplied = true;
        void pc
          .setRemoteDescription({ type: "answer", sdp: data.sdp })
          .catch(() => {});
      }
    });
    this.unsubscribers.push(unsub);
  }

  /** Callee: await the caller's offer, then answer with embedded ICE. */
  private async runAsCallee(): Promise<void> {
    const pc = this.pc!;
    const unsub = onSnapshot(this.signallingRef(this.callerId), async (snap) => {
      if (this.disposed || this.remoteApplied || !snap.exists()) return;
      const data = snap.data() as { type?: string; sdp?: string };
      if (data.type !== "offer" || !data.sdp || this.remoteApplied) return;
      this.remoteApplied = true;
      try {
        await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await this.waitForIceComplete(pc);
        await setDoc(this.signallingRef(this.selfId), {
          uid: this.selfId,
          type: pc.localDescription!.type,
          sdp: pc.localDescription!.sdp,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        this.listeners.onError?.("Could not answer the call.");
      }
    });
    this.unsubscribers.push(unsub);
  }

  /** Detect a remote hang-up / decline so both sides tear down together. */
  private watchCallDoc(): void {
    const unsub = onSnapshot(doc(this.db(), "calls", this.callId), (snap) => {
      if (this.disposed || !snap.exists()) return;
      const status = snap.data().status as CallStatus | undefined;
      if (status === "declined" || status === "ended") {
        this.listeners.onCallEnded?.(status);
      }
    });
    this.unsubscribers.push(unsub);
  }

  /** Resolve once ICE gathering finishes, with a safety timeout. */
  private waitForIceComplete(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const onState = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", onState);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", onState);
      // srflx candidates usually land quickly on public STUN; don't block forever.
      setTimeout(resolve, 2_500);
    });
  }

  setMicEnabled(enabled: boolean): void {
    this.localStream
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = enabled));
  }

  setCameraEnabled(enabled: boolean): void {
    this.localStream
      ?.getVideoTracks()
      .forEach((track) => (track.enabled = enabled));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this.localStream?.getTracks().forEach((track) => track.stop());
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* no-op */
      }
      this.pc = null;
    }
  }
}

function mapCallDoc(id: string, data: DocumentData): CallDoc {
  return {
    id,
    conversationId: String(data.conversationId ?? ""),
    callerId: String(data.callerId ?? ""),
    kind: data.kind === "video" ? "video" : "audio",
    status: (data.status as CallStatus) ?? "ringing",
    memberIds: Array.isArray(data.memberIds)
      ? data.memberIds.map(String)
      : [],
    createdAt: data.createdAt ?? null,
    endedAt: data.endedAt ?? null,
  };
}

/** Create the ringing call document. Returns its id. Caller is `user.id`. */
export async function createCallDoc(opts: {
  conversationId: string;
  callerId: string;
  kind: CallKind;
  memberIds: string[];
}): Promise<string> {
  const db = getFirestoreDb();
  const ref = doc(collection(db, "calls"));
  await setDoc(ref, {
    conversationId: opts.conversationId,
    callerId: opts.callerId,
    kind: opts.kind,
    status: "ringing",
    memberIds: opts.memberIds,
    createdAt: serverTimestamp(),
    endedAt: null,
  });
  return ref.id;
}

/**
 * Flip the call status. Only `status` (and `endedAt` for terminal states) are
 * written so the update passes the closed `affectedKeys` rule in `firestore.rules`.
 */
export async function setCallStatus(
  callId: string,
  status: CallStatus,
): Promise<void> {
  const db = getFirestoreDb();
  const ref = doc(db, "calls", callId);
  if (status === "active" || status === "ringing") {
    await updateDoc(ref, { status });
  } else {
    await updateDoc(ref, { status, endedAt: serverTimestamp() });
  }
}

/**
 * Calls ringing for the current user where they are NOT the caller. Powers the
 * incoming-call overlay. Read is gated by `memberIds` membership in the rules,
 * which the `array-contains` query constraint provably satisfies.
 */
export function useIncomingCalls(user: AppUser | null): CallDoc[] {
  const [calls, setCalls] = useState<CallDoc[]>([]);

  useEffect(() => {
    if (!user) {
      setCalls([]);
      return;
    }
    const db = getFirestoreDb();
    const q = query(
      collection(db, "calls"),
      where("memberIds", "array-contains", user.id),
      where("status", "==", "ringing"),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: CallDoc[] = [];
      snap.forEach((document) => {
        const data = document.data();
        if (data.callerId === user.id) return;
        list.push(mapCallDoc(document.id, data));
      });
      setCalls(list);
    });
    return unsub;
  }, [user?.id]);

  return calls;
}
