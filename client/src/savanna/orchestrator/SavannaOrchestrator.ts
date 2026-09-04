import type { FirebaseMessage, FirebaseMessageMemory } from "@/lib/firebaseChat";
import { captureError } from "@/lib/observability";
import {
  answerConversationRecall,
  savannaMemorySource,
  type SavannaRecallAnswer,
  type SavannaRecallSource,
} from "@/lib/savannaRecall";
import { LocalEmbeddingGemmaProvider } from "../embedding/LocalEmbeddingGemmaProvider";
import { CloudGemmaProvider } from "../inference/CloudGemmaProvider";
import { configuredInferenceMode, type InferenceProvider } from "../inference/InferenceProvider";
import { LocalGemmaProvider } from "../inference/LocalGemmaProvider";
import { MockInferenceProvider } from "../inference/MockInferenceProvider";

type OrchestratorInput = {
  conversationId: string;
  conversationTitle: string;
  query: string;
  messages: FirebaseMessage[];
  memories?: FirebaseMessageMemory[];
};

export type SavannaOrchestratorResult = SavannaRecallAnswer & {
  aiProvider: "deterministic" | "local-gemma" | "cloud-gemma" | "mock" | "heuristic";
  aiModel: string | null;
  embeddingModel: string | null;
  grounded: boolean;
  latencyMs: number | null;
};

function shouldGenerate(answer: SavannaRecallAnswer) {
  if (!answer.sources.length) return false;
  if (answer.mode === "follow_ups") return false;
  if (answer.sources.length > 1) return true;
  return /\b(summarize|summary|compare|explain|why|decision|decide|decided|recommend|context)\b/i.test(answer.query);
}

async function firstAvailable(providers: InferenceProvider[]) {
  for (const provider of providers) {
    // Availability probes throw for ordinary reasons — no WebGPU, model not
    // downloaded — so a bare `.catch(() => false)` is right for control flow.
    // What it hides is *which* provider failed and why, which is the only
    // signal an admin has that local inference is silently never being used.
    const available = await provider.isAvailable().catch(error => {
      captureError("model.load", error, { provider: provider.id, stage: "availability" });
      return false;
    });
    if (available) return provider;
  }
  return null;
}

export function parseQuery(query: string) {
  return {
    raw: query,
    normalized: query.trim().toLowerCase(),
    wantsGeneration: /\b(summarize|summary|compare|explain|why|decision|decide|decided|recommend|context)\b/i.test(query),
  };
}

export function retrieveMemories(memories: FirebaseMessageMemory[] = []) {
  return memories.filter(memory => memory.snippet.trim());
}

export function retrieveSources(answer: SavannaRecallAnswer) {
  return answer.sources;
}

function cosine(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let total = 0;
  for (let index = 0; index < length; index += 1) total += left[index] * right[index];
  return total;
}

function dedupeSources(sources: SavannaRecallSource[]) {
  const seen = new Set<string>();
  return sources.filter(source => {
    const key = `${source.sourceType}:${source.conversationId}:${source.messageId}:${source.storyId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function retrieveSemanticMemorySources(query: string, memories: FirebaseMessageMemory[]) {
  const embeddedMemories = memories.filter(memory => Array.isArray(memory.embedding) && memory.embedding.length && memory.snippet.trim());
  if (!embeddedMemories.length || !query.trim()) return [];

  const embedding = await new LocalEmbeddingGemmaProvider().embed({ text: query }).catch(error => {
    console.warn("[Savanna] Semantic query embedding failed; using deterministic recall only", error);
    return null;
  });
  if (!embedding?.embedding.length) return [];

  return embeddedMemories
    .map(memory => ({
      memory,
      score: cosine(embedding.embedding, memory.embedding ?? []),
    }))
    .filter(item => item.score > 0.18)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.memory.updatedAt).getTime() - new Date(left.memory.updatedAt).getTime();
    })
    .slice(0, 5)
    .map(item => savannaMemorySource(item.memory));
}

export function resolveConflicts(answer: SavannaRecallAnswer) {
  return {
    ...answer,
    sources: [...answer.sources].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
  };
}

export async function selectProvider(answer: SavannaRecallAnswer) {
  if (!shouldGenerate(answer)) return null;
  const mode = configuredInferenceMode();
  const local = new LocalGemmaProvider();
  const cloud = new CloudGemmaProvider();
  const mock = new MockInferenceProvider();

  if (mode === "mock") return mock;
  if (mode === "local") return await firstAvailable([local]);
  if (mode === "cloud") return await firstAvailable([cloud]);
  return await firstAvailable([local, cloud]);
}

export async function generateAnswer(input: OrchestratorInput): Promise<SavannaOrchestratorResult> {
  const parsed = parseQuery(input.query);
  const retrievedMemories = retrieveMemories(input.memories);
  const deterministic = answerConversationRecall({
    conversationId: input.conversationId,
    conversationTitle: input.conversationTitle,
    query: parsed.raw,
    messages: input.messages,
    memories: retrievedMemories,
  });
  const semanticSources = await retrieveSemanticMemorySources(parsed.raw, retrievedMemories);
  const heuristic = resolveConflicts({
    ...deterministic,
    answer: deterministic.sources.length || !semanticSources.length
      ? deterministic.answer
      : `I found this in your saved memories: "${semanticSources[0]?.snippet ?? ""}"`,
    source: deterministic.source ?? semanticSources[0] ?? null,
    sources: dedupeSources([...deterministic.sources, ...semanticSources]).slice(0, 10),
    mode: deterministic.sources.length ? deterministic.mode : semanticSources.length ? "memory" : deterministic.mode,
  });
  const provider = await selectProvider(heuristic);

  if (!provider) {
    return {
      ...heuristic,
      aiProvider: heuristic.sources.length ? "deterministic" : "heuristic",
      aiModel: null,
      embeddingModel: null,
      grounded: heuristic.sources.length > 0,
      latencyMs: null,
    };
  }

  try {
    const result = await provider.generate({
      systemPrompt: "You are Savanna, the memory assistant inside this chat application. Answer only using supplied sources.",
      userQuery: parsed.raw,
      context: {
        query: parsed.raw,
        conversationTitle: input.conversationTitle,
        fallbackAnswer: heuristic.answer,
        sources: retrieveSources(heuristic).slice(0, 10),
      },
      maxTokens: 420,
    });
    return {
      ...heuristic,
      answer: result.grounded ? result.text : heuristic.answer,
      source: result.sources[0] ?? heuristic.source,
      sources: result.sources.length ? result.sources : heuristic.sources,
      aiProvider: result.provider,
      aiModel: result.model,
      embeddingModel: result.embeddingModel,
      grounded: result.grounded,
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    console.warn("[Savanna] Inference provider failed; using deterministic answer", error);
    return {
      ...heuristic,
      aiProvider: "heuristic",
      aiModel: null,
      embeddingModel: null,
      grounded: heuristic.sources.length > 0,
      latencyMs: null,
    };
  }
}

export function attachSources(answer: SavannaOrchestratorResult) {
  return answer.sources;
}
