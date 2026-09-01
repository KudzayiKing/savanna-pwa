import type { FirebaseMessage, FirebaseMessageMemory } from "@/lib/firebaseChat";
import type { SavannaRecallAnswer, SavannaRecallSource } from "@/lib/savannaRecall";
import { LocalEmbeddingGemmaProvider } from "@/savanna/embedding/LocalEmbeddingGemmaProvider";
import { CloudTranslationProvider } from "@/savanna/translation/CloudTranslationProvider";
import { LocalTranslateGemmaProvider } from "@/savanna/translation/LocalTranslateGemmaProvider";

export type SavannaAiProvider =
  | "cloud-gemma"
  | "cloud-translation"
  | "heuristic"
  | "local-embedding-gemma"
  | "local-gemma"
  | "local-hash"
  | "local-translate-gemma"
  | "passthrough";

export type MemoryAiEnrichment = {
  embedding: number[];
  embeddingModel: string;
  embeddingProvider: "cloud-embedding-gemma" | "gemma" | "local" | "local-embedding-gemma" | "local-hash";
  embeddingDimensions: number;
  semanticSummary: string;
  languageCode: string | null;
};

export type GemmaRecallResponse = {
  answer: string;
  sources: SavannaRecallSource[];
  provider: "gemma" | "heuristic";
  model: string | null;
  embeddingModel: string | null;
};

export type GemmaTranslationResponse = {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  provider: "cloud-translation" | "gemma" | "local-translate-gemma" | "passthrough";
  model: string | null;
};

const FALLBACK_EMBEDDING_DIMENSIONS = 64;
const localEmbeddingGemma = new LocalEmbeddingGemmaProvider();
const localTranslateGemma = new LocalTranslateGemmaProvider();
const cloudTranslation = new CloudTranslationProvider();

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch (error) {
    console.warn("[Gemma] AI request failed", error);
    return null;
  }
}

function cleanSnippet(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 900 ? `${cleaned.slice(0, 897)}...` : cleaned;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map(value => Number((value / magnitude).toFixed(6)));
}

function localEmbedding(text: string) {
  const vector = Array.from({ length: FALLBACK_EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s-]/gi, " ").split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 2166136261;
    for (const char of token) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    vector[Math.abs(hash) % FALLBACK_EMBEDDING_DIMENSIONS] += 1;
  }
  return normalizeVector(vector);
}

function detectLanguage(text: string) {
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[ãõçáéíóúâêô]/i.test(text)) return "pt";
  if (/[àâçéèêëîïôûùüÿñæœ]/i.test(text)) return "fr";
  return null;
}

export function memoryTextForEmbedding(memory: FirebaseMessageMemory) {
  return [
    memory.conversationTitle,
    memory.snippet,
    memory.followUpAction,
    memory.productName,
    memory.productDescription,
    memory.storefrontName,
    memory.communityName,
    memory.storyAuthorName,
    memory.tags.join(" "),
  ].filter(Boolean).join(" ");
}

export function messageTextForEmbedding(message: FirebaseMessage) {
  return message.contentType === "attachment" ? "Private attachment" : message.payload;
}

export async function enrichMemoryWithEmbeddingGemma(text: string) {
  const cleanText = cleanSnippet(text);
  if (!cleanText) return null;

  if (await localEmbeddingGemma.isAvailable().catch(() => false)) {
    const local = await localEmbeddingGemma.embed({ text: cleanText }).catch(error => {
      console.warn("[Savanna] Local memory embedding failed", error);
      return null;
    });
    if (local?.provider === "local-embedding-gemma") {
      return {
        embedding: local.embedding,
        embeddingModel: local.model,
        embeddingProvider: local.provider,
        embeddingDimensions: local.dimensions,
        semanticSummary: local.semanticSummary,
        languageCode: local.languageCode,
      };
    }

    const cloud = await postJson<MemoryAiEnrichment>("/api/ai/memory-enrichment", { text: cleanText });
    if (cloud) return { ...cloud, embeddingProvider: cloud.embeddingProvider === "gemma" ? "cloud-embedding-gemma" : cloud.embeddingProvider };

    if (local) {
      return {
        embedding: local.embedding,
        embeddingModel: local.model,
        embeddingProvider: local.provider,
        embeddingDimensions: local.dimensions,
        semanticSummary: local.semanticSummary,
        languageCode: local.languageCode,
      };
    }
  }

  const enrichment = await postJson<MemoryAiEnrichment>("/api/ai/memory-enrichment", { text: cleanText });
  if (enrichment) return { ...enrichment, embeddingProvider: enrichment.embeddingProvider === "gemma" ? "cloud-embedding-gemma" : enrichment.embeddingProvider };

  const embedding = localEmbedding(cleanText);
  return {
    embedding,
    embeddingModel: "local-hash-fallback",
    embeddingProvider: "local-hash" as const,
    embeddingDimensions: embedding.length,
    semanticSummary: cleanText,
    languageCode: detectLanguage(cleanText),
  };
}

export async function requestGemmaRecallAnswer(input: {
  query: string;
  conversationTitle: string;
  fallback: SavannaRecallAnswer;
}) {
  const sources = input.fallback.sources.map(source => ({
    ...source,
    timestamp: new Date(source.timestamp).toISOString(),
    snippet: cleanSnippet(source.snippet),
  }));
  return postJson<GemmaRecallResponse>("/api/ai/recall-answer", {
    query: input.query,
    conversationTitle: input.conversationTitle,
    fallbackAnswer: input.fallback.answer,
    sources,
  });
}

export async function translateWithTranslateGemma(input: {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string | null;
}) {
  const local = await localTranslateGemma.isAvailable().then(available => available ? localTranslateGemma.translate(input) : null).catch(error => {
    console.warn("[Savanna] Local TranslateGemma unavailable; trying cloud fallback", error);
    return null;
  });
  if (local) return local;

  const cloud = await cloudTranslation.isAvailable().then(available => available ? cloudTranslation.translate(input) : null).catch(error => {
    console.warn("[Savanna] Cloud TranslateGemma fallback unavailable", error);
    return null;
  });
  if (cloud) return cloud;

  return {
    translatedText: input.text.trim(),
    sourceLanguage: input.sourceLanguage ?? null,
    targetLanguage: input.targetLanguage,
    provider: "passthrough" as const,
    model: null,
  };
}
