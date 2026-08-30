import type { FirebaseMessage } from "@/lib/firebaseChat";

export type SavannaRecallSource = {
  conversationId: string;
  messageId: string;
  senderUserId: string;
  timestamp: Date | string;
  snippet: string;
};

export type SavannaRecallAnswer = {
  id: string;
  query: string;
  answer: string;
  createdAt: Date;
  source: SavannaRecallSource | null;
  mode: "conversation";
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

function snippet(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

export function answerConversationRecall(input: {
  conversationId: string;
  conversationTitle: string;
  query: string;
  messages: FirebaseMessage[];
}): SavannaRecallAnswer {
  const query = input.query.trim();
  const terms = tokenize(query);
  const candidates = input.messages
    .filter(message => message.contentType === "text" && message.payload.trim() && !parseSavannaInvocation(message.payload))
    .map(message => {
      const haystack = message.payload.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { message, score };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.message.createdAt).getTime() - new Date(left.message.createdAt).getTime();
    });

  const best = candidates[0]?.message ?? null;
  if (!best) {
    return {
      id: crypto.randomUUID(),
      query,
      answer: `I could not find a clear source for that in ${input.conversationTitle}.`,
      createdAt: new Date(),
      source: null,
      mode: "conversation",
    };
  }

  const sourceSnippet = snippet(best.payload);
  return {
    id: crypto.randomUUID(),
    query,
    answer: `I found the most relevant message in ${input.conversationTitle}: "${sourceSnippet}"`,
    createdAt: new Date(),
    source: {
      conversationId: input.conversationId,
      messageId: best.id,
      senderUserId: best.senderUserId,
      timestamp: best.createdAt,
      snippet: sourceSnippet,
    },
    mode: "conversation",
  };
}
