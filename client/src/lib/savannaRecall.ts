import type { FirebaseMessage, FirebaseMessageMemory } from "@/lib/firebaseChat";

export type SavannaMemoryTag =
  | "follow_up"
  | "link"
  | "money"
  | "person"
  | "place"
  | "product"
  | "recommendation"
  | "task";

export const SAVANNA_MEMORY_TAG_LABELS: Record<SavannaMemoryTag, string> = {
  follow_up: "Follow-up",
  link: "Link",
  money: "Price",
  person: "Person",
  place: "Place",
  product: "Product",
  recommendation: "Recommendation",
  task: "Task",
};

export type SavannaRecallSource = {
  sourceType: "message" | "story";
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  senderUserId: string;
  storyId: string | null;
  storyHref: string | null;
  timestamp: Date | string;
  snippet: string;
  label: string;
};

export type SavannaFollowUp = {
  dueAt: Date | null;
  label: string | null;
  action: string | null;
};

export type SavannaRecallAnswer = {
  id: string;
  query: string;
  answer: string;
  createdAt: Date;
  source: SavannaRecallSource | null;
  sources: SavannaRecallSource[];
  mode: "conversation" | "memory" | "follow_ups";
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "akati",
  "and",
  "are",
  "did",
  "does",
  "for",
  "from",
  "how",
  "the",
  "this",
  "that",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
]);

export function parseSavannaInvocation(value: string) {
  const trimmed = value.trim();
  if (!/^@savanna\b/i.test(trimmed)) return null;
  return trimmed.replace(/^@savanna\b/i, "").trim();
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w@\s-]/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(value));
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = startOfLocalDay(value);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekday(anchor: Date, weekday: number) {
  const today = startOfLocalDay(anchor);
  const distance = (weekday - today.getDay() + 7) % 7 || 7;
  return addDays(today, distance);
}

function conciseAction(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
}

export function inferSavannaMemoryTags(value: string): SavannaMemoryTag[] {
  const text = value.toLowerCase();
  const tags = new Set<SavannaMemoryTag>();

  if (includesAny(text, [/\b(remind|remember|follow up|follow-up|check back|tomorrow|later|next week|next month)\b/])) tags.add("follow_up");
  if (includesAny(text, [/\b(todo|to-do|task|tasks|need to|must|should|send|call|meet|finish|deliver)\b/])) tags.add("task");
  if (includesAny(text, [/\b(https?:\/\/|www\.|\.com|\.co|link|links)\b/])) tags.add("link");
  if (includesAny(text, [/\b(price|prices|cost|costs|quote|invoice|paid|pay|payment|usd|zwl|rand|rands|\$|£|€|rtgs)\b/])) tags.add("money");
  if (includesAny(text, [/\b(at|near|around|in)\s+[a-z][a-z-]+|\b(harare|bulawayo|avondale|eastlea|borrowdale|cbd)\b/])) tags.add("place");
  if (includesAny(text, [/\b(contact|contacts|person|people|designer|developer|photographer|supplier|vendor|client|customer)\b/])) tags.add("person");
  if (includesAny(text, [/\b(product|products|stock|listing|listings|shop|store|catalog|catalogue|order|delivery)\b/])) tags.add("product");
  if (includesAny(text, [/\b(recommend|recommended|recommendation|recommendations|suggest|suggested|best|try|good place|good person)\b/])) tags.add("recommendation");

  return Array.from(tags);
}

export function inferSavannaFollowUp(value: string, anchorValue: Date | string = new Date()): SavannaFollowUp {
  const text = value.toLowerCase();
  const anchor = anchorValue instanceof Date ? anchorValue : new Date(anchorValue);
  const base = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  const weekdays: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  let dueAt: Date | null = null;
  let label: string | null = null;
  const inDays = text.match(/\bin\s+(\d{1,2})\s+days?\b/);
  const weekday = Object.entries(weekdays).find(([day]) => new RegExp(`\\b${day}\\b`).test(text));

  if (/\btomorrow\b/.test(text)) {
    dueAt = addDays(base, 1);
    label = "Tomorrow";
  } else if (/\b(today|tonight)\b/.test(text)) {
    dueAt = startOfLocalDay(base);
    label = /tonight/.test(text) ? "Tonight" : "Today";
  } else if (inDays) {
    const days = Number(inDays[1]);
    dueAt = addDays(base, days);
    label = `In ${days} day${days === 1 ? "" : "s"}`;
  } else if (/\bnext week\b/.test(text)) {
    dueAt = addDays(base, 7);
    label = "Next week";
  } else if (/\bnext month\b/.test(text)) {
    dueAt = startOfLocalDay(base);
    dueAt.setMonth(dueAt.getMonth() + 1);
    label = "Next month";
  } else if (weekday) {
    dueAt = nextWeekday(base, weekday[1]);
    label = weekday[0][0].toUpperCase() + weekday[0].slice(1);
  }

  const isFollowUp = Boolean(dueAt) || inferSavannaMemoryTags(value).includes("follow_up");
  return {
    dueAt,
    label,
    action: isFollowUp ? conciseAction(value) : null,
  };
}

function snippet(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function formatFollowUp(memory: FirebaseMessageMemory, index: number) {
  const due = memory.followUpLabel || (memory.followUpAt ? new Date(memory.followUpAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "Follow-up");
  const action = memory.followUpAction || memory.snippet;
  return `${index + 1}. ${due}: ${snippet(action)} (${memory.conversationTitle})`;
}

export function isSavannaFollowUpMemory(memory: FirebaseMessageMemory) {
  return Boolean((memory.followUpAt || memory.tags?.includes("follow_up") || memory.followUpAction) && !memory.followUpCompletedAt);
}

export function isSavannaFollowUpDue(memory: FirebaseMessageMemory, nowValue: Date | string = new Date()) {
  if (!isSavannaFollowUpMemory(memory)) return false;
  if (!memory.followUpAt) return true;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return new Date(memory.followUpAt).getTime() < endOfToday.getTime();
}

function memorySource(memory: FirebaseMessageMemory): SavannaRecallSource {
  return {
    sourceType: memory.sourceType,
    conversationId: memory.conversationId,
    conversationTitle: memory.conversationTitle,
    messageId: memory.messageId,
    senderUserId: memory.senderUserId,
    storyId: memory.storyId,
    storyHref: memory.storyHref,
    timestamp: memory.sourceCreatedAt,
    snippet: memory.snippet,
    label: memory.sourceType === "story" ? memory.productName ?? memory.storefrontName ?? memory.communityName ?? memory.storyAuthorName ?? "Saved Story" : memory.conversationTitle,
  };
}

function formatRecallResult(source: SavannaRecallSource, index: number, prefix: string) {
  return `${index + 1}. ${prefix} in ${source.conversationTitle}: "${snippet(source.snippet)}"`;
}

export function answerConversationRecall(input: {
  conversationId: string;
  conversationTitle: string;
  query: string;
  messages: FirebaseMessage[];
  memories?: FirebaseMessageMemory[];
}): SavannaRecallAnswer {
  const query = input.query.trim();
  const terms = tokenize(query);
  const queryTags = inferSavannaMemoryTags(query);
  const wantsFollowUps = queryTags.includes("follow_up") || /\b(due|owed|promise|promised|need to|follow-ups?|tasks?|tomorrow)\b/i.test(query);
  const followUpMemories = (input.memories ?? [])
    .filter(isSavannaFollowUpMemory)
    .sort((left, right) => {
      const leftTime = left.followUpAt ? new Date(left.followUpAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.followUpAt ? new Date(right.followUpAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

  if (wantsFollowUps) {
    const selectedFollowUps = followUpMemories.slice(0, 4);
    if (!selectedFollowUps.length) {
      return {
        id: crypto.randomUUID(),
        query,
        answer: "I could not find any saved follow-ups yet. Save a message that mentions a time, task, or promise and I will track it here.",
        createdAt: new Date(),
        source: null,
        sources: [],
        mode: "follow_ups",
      };
    }

    const sources = selectedFollowUps.map(memorySource);
    return {
      id: crypto.randomUUID(),
      query,
      answer: `Here are your saved follow-ups:\n${selectedFollowUps.map(formatFollowUp).join("\n")}`,
      createdAt: new Date(),
      source: sources[0] ?? null,
      sources,
      mode: "follow_ups",
    };
  }

  const messageCandidates = input.messages
    .filter(message => message.contentType === "text" && message.payload.trim() && !parseSavannaInvocation(message.payload))
    .map(message => {
      const haystack = message.payload.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      const source: SavannaRecallSource = {
        sourceType: "message",
        conversationId: input.conversationId,
        conversationTitle: input.conversationTitle,
        messageId: message.id,
        senderUserId: message.senderUserId,
        storyId: null,
        storyHref: null,
        timestamp: message.createdAt,
        snippet: snippet(message.payload),
        label: input.conversationTitle,
      };
      return {
        score,
        createdAt: message.createdAt,
        mode: "conversation" as const,
        source,
        title: input.conversationTitle,
      };
    });
  const memoryCandidates = (input.memories ?? [])
    .filter(memory => memory.snippet.trim())
    .map(memory => {
      const tags = memory.tags?.length ? memory.tags : inferSavannaMemoryTags(memory.snippet);
      const followUpText = `${memory.followUpLabel ?? ""} ${memory.followUpAction ?? ""}`;
      const storyText = `${memory.productName ?? ""} ${memory.productDescription ?? ""} ${memory.storefrontName ?? ""} ${memory.communityName ?? ""} ${memory.storyAuthorName ?? ""}`;
      const haystack = `${memory.conversationTitle} ${memory.snippet} ${followUpText} ${storyText} ${tags.map(tag => SAVANNA_MEMORY_TAG_LABELS[tag] ?? tag).join(" ")}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
        + queryTags.reduce((total, tag) => total + (tags.includes(tag) ? 1.5 : 0), 0)
        + (wantsFollowUps && isSavannaFollowUpMemory(memory) ? 2 : 0);
      return {
        score: score + (score > 0 ? 1 : 0),
        createdAt: memory.updatedAt,
        mode: "memory" as const,
        source: memorySource(memory),
        title: memory.conversationTitle,
      };
    });
  const candidates = [...memoryCandidates, ...messageCandidates]
    .filter(item => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

  const selected = candidates.slice(0, 3);
  const best = selected[0] ?? null;
  if (!best) {
    return {
      id: crypto.randomUUID(),
      query,
      answer: `I could not find a clear source for that in ${input.conversationTitle}.`,
      createdAt: new Date(),
      source: null,
      sources: [],
      mode: "conversation",
    };
  }

  const sources = selected.map(item => item.source);
  if (selected.length > 1) {
    return {
      id: crypto.randomUUID(),
      query,
      answer: `I found ${selected.length} useful matches:\n${selected.map((item, index) => formatRecallResult(item.source, index, item.mode === "memory" ? "Saved memory" : "Chat")).join("\n")}`,
      createdAt: new Date(),
      source: sources[0] ?? null,
      sources,
      mode: selected.some(item => item.mode === "memory") ? "memory" : "conversation",
    };
  }

  return {
    id: crypto.randomUUID(),
    query,
    answer: best.mode === "memory"
      ? `I found this in your saved memories from ${best.title}: "${best.source.snippet}"`
      : `I found the most relevant message in ${best.title}: "${best.source.snippet}"`,
    createdAt: new Date(),
    source: best.source,
    sources,
    mode: best.mode,
  };
}
