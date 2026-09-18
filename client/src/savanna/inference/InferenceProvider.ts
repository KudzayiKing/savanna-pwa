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

export const SAVANNA_MODEL_BASE_URL = "https://pub-610daaff40ac42f18aa2de55bc3970b2.r2.dev/models";
export const SAVANNA_LOCAL_GEMMA_CHECKPOINT_ID = "google/gemma-4-E2B-it-qat-mobile-transformers";
export const SAVANNA_LOCAL_GEMMA_LITERTLM_REPO = "litert-community/gemma-4-E2B-it-litert-lm";
export const SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL = `${SAVANNA_MODEL_BASE_URL}/gemma-4-E2B-it-web.litertlm`;
export const SAVANNA_LITERT_LM_RUNTIME_URL = "https://cdn.jsdelivr.net/npm/@litert-lm/core/+esm";
export const SAVANNA_EMBEDDING_GEMMA_MODEL_ID = "google/embeddinggemma-300m";
export const SAVANNA_EMBEDDING_GEMMA_WEB_MODEL_ID = `${SAVANNA_MODEL_BASE_URL}/embeddinggemma-300m-ONNX`;
export const SAVANNA_TRANSLATE_GEMMA_MODEL_ID = "google/translategemma-4b-it";
export const SAVANNA_TRANSLATE_GEMMA_WEB_MODEL_URL = `${SAVANNA_MODEL_BASE_URL}/translategemma-4b-it-int8-web.task`;
export const SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/+esm";
export const SAVANNA_MEDIAPIPE_GENAI_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm";

function trimmedEnv(value: string | undefined) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export function configuredSavannaModelBaseUrl() {
  return trimmedEnv(import.meta.env.VITE_SAVANNA_MODEL_BASE_URL) || SAVANNA_MODEL_BASE_URL;
}

export function savannaModelAssetUrl(path: string) {
  return `${configuredSavannaModelBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

export function configuredLocalGemmaModelUrl() {
  return trimmedEnv(import.meta.env.VITE_SAVANNA_LOCAL_GEMMA_MODEL_URL) || savannaModelAssetUrl("gemma-4-E2B-it-web.litertlm");
}

export function configuredLiteRtLmRuntimeUrl() {
  return trimmedEnv(import.meta.env.VITE_SAVANNA_LITERT_LM_RUNTIME_URL) || SAVANNA_LITERT_LM_RUNTIME_URL;
}

export function configuredEmbeddingGemmaModelId() {
  return trimmedEnv(import.meta.env.VITE_SAVANNA_EMBEDDING_GEMMA_MODEL_ID) || savannaModelAssetUrl("embeddinggemma-300m-ONNX");
}

export function configuredTranslateGemmaModelUrl() {
  return trimmedEnv(import.meta.env.VITE_SAVANNA_TRANSLATE_GEMMA_MODEL_URL) || savannaModelAssetUrl("translategemma-4b-it-int8-web.task");
}

export function configuredMediaPipeGenAiRuntimeUrl() {
  return trimmedEnv(import.meta.env.VITE_SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL) || SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL;
}

export function configuredMediaPipeGenAiWasmUrl() {
  return trimmedEnv(import.meta.env.VITE_SAVANNA_MEDIAPIPE_GENAI_WASM_URL) || SAVANNA_MEDIAPIPE_GENAI_WASM_URL;
}

export function configuredInferenceMode(): SavannaInferenceMode {
  const value = import.meta.env.VITE_SAVANNA_INFERENCE;
  return value === "local" || value === "cloud" || value === "mock" ? value : "auto";
}
