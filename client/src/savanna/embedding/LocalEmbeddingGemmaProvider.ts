import { captureError } from "@/lib/observability";
import { SAVANNA_EMBEDDING_GEMMA_MODEL_ID, SAVANNA_EMBEDDING_GEMMA_WEB_MODEL_ID } from "../inference/InferenceProvider";
import type { EmbeddingProvider, EmbeddingRequest, EmbeddingResponse } from "./EmbeddingProvider";

const FALLBACK_EMBEDDING_DIMENSIONS = 64;

type FeatureExtractor = (text: string, options?: { pooling?: "mean"; normalize?: boolean }) => Promise<{
  data?: Float32Array | number[];
  tolist?: () => number[] | number[][];
}>;

function cleanSnippet(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 900 ? `${cleaned.slice(0, 897)}...` : cleaned;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map(value => Number((value / magnitude).toFixed(6)));
}

function localHashEmbedding(text: string) {
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

function vectorFromOutput(output: Awaited<ReturnType<FeatureExtractor>>) {
  if (output.data) return Array.from(output.data).map(Number).filter(Number.isFinite);
  const list = output.tolist?.();
  if (Array.isArray(list?.[0])) return (list[0] as number[]).map(Number).filter(Number.isFinite);
  if (Array.isArray(list)) return (list as number[]).map(Number).filter(Number.isFinite);
  return [];
}

export class LocalEmbeddingGemmaProvider implements EmbeddingProvider {
  readonly id = "local-embedding-gemma" as const;
  private extractor: FeatureExtractor | null = null;

  async isAvailable() {
    return typeof WebAssembly !== "undefined";
  }

  private async load() {
    if (this.extractor) return this.extractor;
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = true;
    env.allowRemoteModels = true;
    const model = import.meta.env.VITE_SAVANNA_EMBEDDING_GEMMA_MODEL_ID || SAVANNA_EMBEDDING_GEMMA_WEB_MODEL_ID;
    this.extractor = await pipeline("feature-extraction", model, {
      device: typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm",
      dtype: "q8",
    }) as FeatureExtractor;
    return this.extractor;
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const semanticSummary = cleanSnippet(request.text);
    if (!semanticSummary) {
      return {
        embedding: [],
        model: "empty",
        provider: "local-hash",
        dimensions: 0,
        semanticSummary,
        languageCode: null,
      };
    }

    try {
      const extractor = await this.load();
      const output = await extractor(semanticSummary, { pooling: "mean", normalize: true });
      const embedding = normalizeVector(vectorFromOutput(output));
      if (embedding.length) {
        return {
          embedding,
          model: SAVANNA_EMBEDDING_GEMMA_MODEL_ID,
          provider: this.id,
          dimensions: embedding.length,
          semanticSummary,
          languageCode: detectLanguage(semanticSummary),
        };
      }
    } catch (error) {
      console.warn("[Savanna] Local EmbeddingGemma unavailable; using local hash fallback", error);
      // Recorded because this failure is invisible by design: the caller gets a
      // working hash embedding and the user never sees an error, so without
      // this the only sign that local retrieval is degrading is that recall
      // slowly gets worse. Tagged as a warning — it is a degradation, and the
      // product is still functioning.
      captureError("model.load", error, { model: "embedding-gemma", degraded: true });
    }

    const embedding = localHashEmbedding(semanticSummary);
    return {
      embedding,
      model: "local-hash-fallback",
      provider: "local-hash",
      dimensions: embedding.length,
      semanticSummary,
      languageCode: detectLanguage(semanticSummary),
    };
  }
}
