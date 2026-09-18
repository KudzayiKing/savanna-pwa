/**
 * Durable composer drafts and an offline send outbox.
 *
 * The plan calls for drafts and queued messages that survive a reload and a
 * lost connection. Both are persisted to localStorage keyed by conversation id
 * so the composer restores what the user was typing and queued sends replay
 * once connectivity returns. Kept deliberately small and synchronous — the
 * outbox holds text only (attachments need an upload that cannot run offline).
 */

const DRAFT_PREFIX = "savanna:draft:";
const OUTBOX_KEY = "savanna:outbox";

export type OutboxReplyTo = {
  messageId: string;
  senderUserId: string;
  snippet: string;
} | null;

export type OutboxItem = {
  id: string;
  conversationId: string;
  body: string;
  memberIds: string[];
  replyTo: OutboxReplyTo;
  createdAt: number;
};

export function loadDraft(conversationId: string): string {
  try {
    return localStorage.getItem(DRAFT_PREFIX + conversationId) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(conversationId: string, text: string): void {
  try {
    if (text) localStorage.setItem(DRAFT_PREFIX + conversationId, text);
    else localStorage.removeItem(DRAFT_PREFIX + conversationId);
  } catch {
    /* storage unavailable (private mode / quota) — drafts just won't persist */
  }
}

export function clearDraft(conversationId: string): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + conversationId);
  } catch {
    /* no-op */
  }
}

export function loadOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function saveOutbox(items: OutboxItem[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* no-op */
  }
}

export function enqueueOutbox(item: OutboxItem): OutboxItem[] {
  const next = [...loadOutbox(), item];
  saveOutbox(next);
  return next;
}

export function removeFromOutbox(id: string): OutboxItem[] {
  const next = loadOutbox().filter((item) => item.id !== id);
  saveOutbox(next);
  return next;
}

export function newOutboxId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ob_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
