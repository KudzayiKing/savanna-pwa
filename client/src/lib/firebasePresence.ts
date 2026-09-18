/*
 * Real presence + typing, Firestore-backed (no Realtime Database needed).
 *
 * presence/{uid}          { online, lastSeen }       — one doc per user
 * typing/{conversationId}/users/{uid} { updatedAt }    — ephemeral, self-cleared
 *
 * There is deliberately NO /api or Cloud Function here: a client writes its own
 * presence doc and reads others'. Staleness (a tab that crashed without
 * clearing) is handled by treating a lastSeen older than ~90s as not-online,
 * and the heartbeat keeps it fresh while the tab is visible.
 */
import { doc, onSnapshot, setDoc, deleteDoc, collection, serverTimestamp, type DocumentData } from "firebase/firestore";
import { useEffect, useState } from "react";
import type { AppUser } from "@/lib/userProfile";
import { getFirestoreDb } from "./firebase";

export type PresenceState = "online" | "away" | "offline";

const ONLINE_WINDOW_MS = 90_000;
const AWAY_WINDOW_MS = 600_000;
const HEARTBEAT_MS = 20_000;
const TYPING_TTL_MS = 6_000;
const TYPING_CLEAR_MS = 4_000;

function stampToDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return value instanceof Date ? value : null;
}

/** Live presence for one user. Returns "offline" when no uid is given. */
export function usePresence(uid?: string | null | undefined): {
  state: PresenceState;
  lastSeen: Date | null;
} {
  const [state, setState] = useState<PresenceState>("offline");
  const [lastSeen, setLastSeen] = useState<Date | null>(null);

  useEffect(() => {
    if (!uid) {
      setState("offline");
      setLastSeen(null);
      return;
    }
    const ref = doc(getFirestoreDb(), "presence", uid);
    const unsubscribe = onSnapshot(ref, snapshot => {
      const data = snapshot.data() as DocumentData | undefined;
      if (!data) {
        setState("offline");
        setLastSeen(null);
        return;
      }
      const seen = stampToDate(data.lastSeen);
      setLastSeen(seen);
      const age = seen ? Date.now() - seen.getTime() : Infinity;
      if (data.online === true && age < ONLINE_WINDOW_MS) setState("online");
      else if (age < AWAY_WINDOW_MS) setState("away");
      else setState("offline");
    });
    return () => unsubscribe();
  }, [uid]);

  return { state, lastSeen };
}

/** Uids currently typing in a conversation, excluding the viewer. */
export function useTyping(conversationId?: string | null, selfId?: string | null): string[] {
  const [typing, setTyping] = useState<string[]>([]);

  useEffect(() => {
    if (!conversationId) {
      setTyping([]);
      return;
    }
    const ref = collection(getFirestoreDb(), "typing", conversationId, "users");
    const unsubscribe = onSnapshot(ref, snapshot => {
      const now = Date.now();
      const ids = snapshot.docs
        .filter(item => item.id !== selfId)
        .map(item => ({ id: item.id, seen: stampToDate(item.data().updatedAt) }))
        .filter(item => item.seen && now - item.seen.getTime() < TYPING_TTL_MS)
        .map(item => item.id);
      setTyping(ids);
    });
    return () => unsubscribe();
  }, [conversationId, selfId]);

  return typing;
}

/**
 * Signal that the viewer is typing. Self-clears after a short window. Writes
 * are throttled (one every ~2.5s) so a fast typist does not fire a Firestore
 * write per keystroke; the self-clear timer is re-armed on every call so the
 * indicator persists for as long as the user keeps typing, then disappears.
 */
const TYPING_SIGNAL_THROTTLE_MS = 2_500;
const lastSignalledAt = new Map<string, number>();

export function signalTyping(conversationId: string, user: AppUser) {
  const ref = doc(getFirestoreDb(), "typing", conversationId, "users", user.id);
  const key = `${conversationId}:${user.id}`;
  const now = Date.now();
  const last = lastSignalledAt.get(key) ?? 0;
  if (now - last >= TYPING_SIGNAL_THROTTLE_MS) {
    lastSignalledAt.set(key, now);
    void setDoc(ref, { updatedAt: serverTimestamp() }, { merge: true });
  }
  const existing = typingTimers.get(key);
  if (existing) clearTimeout(existing);
  typingTimers.set(
    key,
    setTimeout(() => {
      typingTimers.delete(key);
      lastSignalledAt.delete(key);
      void deleteDoc(ref).catch(() => undefined);
    }, TYPING_CLEAR_MS)
  );
}

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type PresenceSnapshot = {
  headline: string;
  subline: string;
  online: boolean;
  typing: boolean;
  groupActivityCount: number;
};

function compactRelativeTime(from: Date, now: number = Date.now()): string {
  const diff = Math.max(0, now - from.getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Derive a presence snapshot for a conversation from real Firestore presence
 * and typing indicators.
 *
 * - 1:1 / merchant_support: the peer's derived state (online/away/offline from
 *   `lastSeen` freshness) plus whether *they* are typing. Peer id is the
 *   non-viewer member; groups have none.
 * - group / community: no per-member fan-out (expensive, and the rules make the
 *   list-read impossible to gate per member anyway). We report typing when
 *   anyone in the conversation is typing and otherwise stay quiet — never a
 *   fabricated "N people active".
 */
export function useConversationPresence(
  conversation: { id: string; kind: string; memberIds: string[] } | null | undefined,
  viewerId?: string | null,
): PresenceSnapshot {
  const peerId =
    conversation && conversation.kind !== "group" && conversation.kind !== "community"
      ? (conversation.memberIds.find(id => id && id !== viewerId) ?? null)
      : null;
  const peer = usePresence(peerId);
  const typingIds = useTyping(conversation?.id, viewerId);

  if (!conversation) {
    return { headline: "", subline: "", online: false, typing: false, groupActivityCount: 0 };
  }

  const someoneTyping = typingIds.length > 0;
  if (conversation.kind === "group" || conversation.kind === "community") {
    return {
      headline: someoneTyping ? "typing…" : "",
      subline: someoneTyping ? "People are writing" : "",
      online: false,
      typing: someoneTyping,
      groupActivityCount: 0,
    };
  }

  if (someoneTyping && peerId) {
    return { headline: "Typing…", subline: "Writing back", online: true, typing: true, groupActivityCount: 0 };
  }

  if (peer.state === "online") {
    return { headline: "Online", subline: "Here now", online: true, typing: false, groupActivityCount: 0 };
  }

  const seen = peer.lastSeen ? compactRelativeTime(peer.lastSeen) : null;
  if (peer.state === "away") {
    return {
      headline: seen ? `Active ${seen}` : "Active recently",
      subline: "Around a bit ago",
      online: false,
      typing: false,
      groupActivityCount: 0,
    };
  }
  return {
    headline: seen ? `Active ${seen}` : "Offline",
    subline: seen ? "Last seen a while back" : "Not around",
    online: false,
    typing: false,
    groupActivityCount: 0,
  };
}

/**
 * Begin broadcasting the viewer's presence. Writes online now, keeps a
 * heartbeat while the tab is visible, and marks offline on hide / unload.
 * Returns a stop function. Fire-and-forget: presence is best-effort.
 */
export function startPresenceSession(user: AppUser) {
  const ref = doc(getFirestoreDb(), "presence", user.id);
  const write = (online: boolean) => {
    void setDoc(
      ref,
      { online, lastSeen: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => undefined);
  };

  write(true);
  const heartbeat = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      write(true);
    }
  }, HEARTBEAT_MS);

  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      write(false);
    }
  };
  const onUnload = () => write(false);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
  }

  return () => {
    clearInterval(heartbeat);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
    }
    write(false);
  };
}
