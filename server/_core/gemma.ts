import { ENV } from "./env";

const DEFAULT_GEMMA_CHAT_MODEL = "google/gemma-4-E2B-it-qat-mobile-transformers";
const DEFAULT_EMBEDDING_GEMMA_MODEL = "google/embeddinggemma-300m";
const DEFAULT_TRANSLATE_GEMMA_MODEL = "google/translategemma-4b-it";
const FALLBACK_EMBEDDING_DIMENSIONS = 64;
const STORED_EMBEDDING_DIMENSIONS = 384;

type JsonRecord = Record<string, unknown>;

export type GemmaRecallSource = {
  sourceType: "message" | "story";
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  senderUserId: string;
  storyId: string | null;
  storyHref: string | null;
  timestamp: string;
  snippet: string;
  label: string;
};

export type GemmaRecallInput = {
  query: string;
  conversationTitle: string;
  fallbackAnswer: string;
  sources: GemmaRecallSource[];
};

export type GemmaRecallAnswer = {
  answer: string;
  sources: GemmaRecallSource[];
  provider: "gemma" | "heuristic";
  model: string | null;
  embeddingModel: string | null;
};

export type GemmaMemoryEnrichment = {
  embedding: number[];
  embeddingModel: string;
  embeddingProvider: "cloud-embedding-gemma" | "gemma" | "local" | "local-hash";
  embeddingDimensions: number;
  semanticSummary: string;
  languageCode: string | null;
};

export type GemmaTranslation = {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  provider: "cloud-translation" | "gemma" | "passthrough";
  model: string | null;
};

function endpoint(path: "chat" | "embedding" | "translate") {
  // Optional CloudGemma/Savanna fallback URLs only. Browser-local Gemma loads
  // from the PWA worker through LiteRT-LM/WebGPU and never receives secrets.
  if (path === "chat" && ENV.gemmaChatEndpoint) return ENV.gemmaChatEndpoint;
  if (path === "embedding" && ENV.gemmaEmbeddingEndpoint) return ENV.gemmaEmbeddingEndpoint;
  if (path === "translate" && ENV.gemmaTranslateEndpoint) return ENV.gemmaTranslateEndpoint;
  if (!ENV.gemmaApiBaseUrl) return "";
  const suffix = path === "embedding" ? "/embeddings" : "/chat/completions";
  return `${ENV.gemmaApiBaseUrl}${suffix}`;
}

function headers() {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (ENV.gemmaApiKey) result.Authorization = `Bearer ${ENV.gemmaApiKey}`;
  return result;
}

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function postJson(url: string, body: JsonRecord) {
  const response = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemma request failed (${response.status})${detail ? `: ${detail.slice(0, 220)}` : ""}`);
  }
  return response.json() as Promise<unknown>;
}

function extractText(payload: unknown): string | null {
  if (!isObject(payload)) return null;
  const choices = payload.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!isObject(choice)) continue;
      const message = choice.message;
      if (isObject(message) && typeof message.content === "string") return message.content.trim();
      if (typeof choice.text === "string") return choice.text.trim();
    }
  }
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  if (typeof payload.response === "string") return payload.response.trim();
  if (typeof payload.text === "string") return payload.text.trim();
  return null;
}

function extractEmbedding(payload: unknown): number[] | null {
  if (!isObject(payload)) return null;
  const data = payload.data;
  if (Array.isArray(data) && isObject(data[0]) && Array.isArray(data[0].embedding)) {
    return data[0].embedding.map(Number).filter(Number.isFinite);
  }
  if (Array.isArray(payload.embedding)) {
    return payload.embedding.map(Number).filter(Number.isFinite);
  }
  return null;
}

function normalizeVector(vector: number[], dimensions = STORED_EMBEDDING_DIMENSIONS) {
  const trimmed = vector.slice(0, dimensions);
  const magnitude = Math.hypot(...trimmed) || 1;
  return trimmed.map(value => Number((value / magnitude).toFixed(6)));
}

function localEmbedding(text: string, dimensions = FALLBACK_EMBEDDING_DIMENSIONS) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s-]/gi, " ").split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 2166136261;
    for (const char of token) {
      hash ^= char.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1;
  }
  return normalizeVector(vector, dimensions);
}

function cosine(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) total += left[index] * right[index];
  return total;
}

function conciseSummary(text: string) {
  const cleaned = text.trim().replace(/\s+/g, " ");
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

function detectLanguage(text: string) {
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[ãõçáéíóúâêô]/i.test(text)) return "pt";
  if (/[àâçéèêëîïôûùüÿñæœ]/i.test(text)) return "fr";
  return null;
}

export async function embedWithEmbeddingGemma(text: string): Promise<GemmaMemoryEnrichment> {
  const cleanText = conciseSummary(text);
  const url = endpoint("embedding");
  const model = ENV.gemmaEmbeddingModel || DEFAULT_EMBEDDING_GEMMA_MODEL;

  if (url) {
    try {
      const payload = await postJson(url, { model, input: cleanText });
      const embedding = extractEmbedding(payload);
      if (embedding?.length) {
        const normalized = normalizeVector(embedding);
        return {
          embedding: normalized,
          embeddingModel: model,
          embeddingProvider: "cloud-embedding-gemma",
          embeddingDimensions: normalized.length,
          semanticSummary: cleanText,
          languageCode: detectLanguage(cleanText),
        };
      }
    } catch (error) {
      console.warn("[Gemma] EmbeddingGemma unavailable; using local fallback", error);
    }
  }

  const fallback = localEmbedding(cleanText);
  return {
    embedding: fallback,
    embeddingModel: "local-hash-fallback",
    embeddingProvider: "local-hash",
    embeddingDimensions: fallback.length,
    semanticSummary: cleanText,
    languageCode: detectLanguage(cleanText),
  };
}

async function chatWithGemma(system: string, user: string, model = ENV.gemmaChatModel || DEFAULT_GEMMA_CHAT_MODEL) {
  const url = endpoint("chat");
  if (!url) return null;
  const payload = await postJson(url, {
    model,
    temperature: 0.2,
    max_tokens: 420,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return extractText(payload);
}

export async function answerRecallWithGemma(input: GemmaRecallInput): Promise<GemmaRecallAnswer> {
  const model = ENV.gemmaChatModel || DEFAULT_GEMMA_CHAT_MODEL;
  const embeddingModel = ENV.gemmaEmbeddingModel || DEFAULT_EMBEDDING_GEMMA_MODEL;
  let rankedSources = input.sources.slice(0, 6);

  try {
    const queryEmbedding = (await embedWithEmbeddingGemma(input.query)).embedding;
    const scored = await Promise.all(input.sources.slice(0, 16).map(async source => ({
      source,
      score: cosine(queryEmbedding, (await embedWithEmbeddingGemma(`${source.label} ${source.snippet}`)).embedding),
    })));
    rankedSources = scored.sort((left, right) => right.score - left.score).map(item => item.source).slice(0, 6);
  } catch (error) {
    console.warn("[Gemma] Semantic ranking unavailable; using provided source order", error);
  }

  try {
    const answer = await chatWithGemma(
      "You are Savanna Recall. Answer only from the supplied sources. Be concise, warm, and practical. If the sources do not contain the answer, say you could not find it.",
      JSON.stringify({
        question: input.query,
        conversationTitle: input.conversationTitle,
        fallbackAnswer: input.fallbackAnswer,
        sources: rankedSources.map((source, index) => ({
          index: index + 1,
          label: source.label,
          snippet: source.snippet,
          timestamp: source.timestamp,
          sourceType: source.sourceType,
        })),
      }),
      model,
    );
    if (answer) {
      return { answer, sources: rankedSources, provider: "gemma", model, embeddingModel };
    }
  } catch (error) {
    console.warn("[Gemma] Gemma 4 QAT recall unavailable; using heuristic answer", error);
  }

  return {
    answer: input.fallbackAnswer,
    sources: rankedSources,
    provider: "heuristic",
    model: null,
    embeddingModel: rankedSources.length ? embeddingModel : null,
  };
}

export async function translateWithTranslateGemma(input: {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string | null;
}): Promise<GemmaTranslation> {
  const cleanText = input.text.trim();
  const targetLanguage = input.targetLanguage.trim();
  const model = ENV.gemmaTranslateModel || DEFAULT_TRANSLATE_GEMMA_MODEL;
  if (!cleanText || !targetLanguage) {
    return { translatedText: cleanText, sourceLanguage: input.sourceLanguage ?? null, targetLanguage, provider: "passthrough", model: null };
  }

  try {
    const answer = await chatWithGemma(
      "You are TranslateGemma inside Savanna. Translate the user's text only. Preserve names, amounts, and @usernames. Return only the translation.",
      JSON.stringify({ text: cleanText, sourceLanguage: input.sourceLanguage ?? "auto", targetLanguage }),
      model,
    );
    if (answer) {
      return { translatedText: answer, sourceLanguage: input.sourceLanguage ?? null, targetLanguage, provider: "cloud-translation", model };
    }
  } catch (error) {
    console.warn("[Gemma] TranslateGemma unavailable; returning original text", error);
  }

  return { translatedText: cleanText, sourceLanguage: input.sourceLanguage ?? null, targetLanguage, provider: "passthrough", model: null };
}
