import type { SavannaRecallSource } from "@/lib/savannaRecall";

export type SavannaInferenceMode = "auto" | "local" | "cloud" | "mock";
export type SavannaInferenceProviderId = "local-gemma" | "cloud-gemma" | "mock";

export type SavannaCapabilities = {
  webgpu: boolean;
  wasm: boolean;
  localGemma: boolean;
  embeddingModel: boolean;
  sufficientStorage: boolean;
};

export type MemoryContext = {
  query: string;
  conversationTitle: string;
  fallbackAnswer: string;
  sources: SavannaRecallSource[];
};

export type InferenceRequest = {
  systemPrompt: string;
  userQuery: string;
  context: MemoryContext;
  language?: string | null;
  maxTokens?: number;
};

export type InferenceResponse = {
  text: string;
  sources: SavannaRecallSource[];
  provider: SavannaInferenceProviderId;
  model: string | null;
  embeddingModel: string | null;
  latencyMs: number;
  grounded: boolean;
};

export interface InferenceProvider {
  readonly id: SavannaInferenceProviderId;
  isAvailable(): Promise<boolean>;
  generate(request: InferenceRequest): Promise<InferenceResponse>;
}

export const SAVANNA_LOCAL_GEMMA_CHECKPOINT_ID = "google/gemma-4-E2B-it-qat-mobile-transformers";
export const SAVANNA_LOCAL_GEMMA_LITERTLM_REPO = "litert-community/gemma-4-E2B-it-litert-lm";
export const SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm";
export const SAVANNA_LITERT_LM_RUNTIME_URL = "https://cdn.jsdelivr.net/npm/@litert-lm/core/+esm";
export const SAVANNA_EMBEDDING_GEMMA_MODEL_ID = "google/embeddinggemma-300m";
export const SAVANNA_EMBEDDING_GEMMA_WEB_MODEL_ID = "onnx-community/embeddinggemma-300m-ONNX";
export const SAVANNA_TRANSLATE_GEMMA_MODEL_ID = "google/translategemma-4b-it";
export const SAVANNA_TRANSLATE_GEMMA_WEB_MODEL_URL = "https://huggingface.co/litert-community/TranslateGemma-4B-IT/resolve/main/translategemma-4b-it-int8-web.task";
export const SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/+esm";
export const SAVANNA_MEDIAPIPE_GENAI_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm";

export function configuredInferenceMode(): SavannaInferenceMode {
  const value = import.meta.env.VITE_SAVANNA_INFERENCE;
  return value === "local" || value === "cloud" || value === "mock" ? value : "auto";
}
