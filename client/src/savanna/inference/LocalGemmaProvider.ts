import type { InferenceProvider, InferenceRequest, InferenceResponse, SavannaCapabilities } from "./InferenceProvider";
import {
  SAVANNA_EMBEDDING_GEMMA_MODEL_ID,
  SAVANNA_LOCAL_GEMMA_CHECKPOINT_ID,
  SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL,
  SAVANNA_LITERT_LM_RUNTIME_URL,
} from "./InferenceProvider";

declare global {
  interface Navigator {
    gpu?: unknown;
  }
}

export async function detectSavannaCapabilities(): Promise<SavannaCapabilities> {
  const storage = await navigator.storage?.estimate?.().catch(() => null);
  const quota = storage?.quota ?? 0;
  const usage = storage?.usage ?? 0;
  const freeStorage = quota > usage ? quota - usage : 0;
  const webgpu = typeof navigator.gpu !== "undefined";
  const wasm = typeof WebAssembly !== "undefined";
  const sufficientStorage = quota === 0 ? true : freeStorage > 3 * 1024 * 1024 * 1024;

  return {
    webgpu,
    wasm,
    localGemma: webgpu && wasm && sufficientStorage,
    embeddingModel: wasm,
    sufficientStorage,
  };
}

type LocalGemmaWorkerResponse = {
  id: string;
  ok: boolean;
  payload?: { text?: string };
  error?: string;
};

function localModelUrl() {
  return import.meta.env.VITE_SAVANNA_LOCAL_GEMMA_MODEL_URL || SAVANNA_LOCAL_GEMMA_WEB_MODEL_URL;
}

function litertRuntimeUrl() {
  return import.meta.env.VITE_SAVANNA_LITERT_LM_RUNTIME_URL || SAVANNA_LITERT_LM_RUNTIME_URL;
}

function buildGroundedPrompt(request: InferenceRequest) {
  return JSON.stringify({
    instruction: "Answer the user's question using only the retrieved Savanna sources. If the sources do not answer it, say you could not find it.",
    question: request.userQuery,
    conversationTitle: request.context.conversationTitle,
    fallbackAnswer: request.context.fallbackAnswer,
    sources: request.context.sources.map((source, index) => ({
      index: index + 1,
      label: source.label,
      timestamp: new Date(source.timestamp).toISOString(),
      snippet: source.snippet,
      sourceType: source.sourceType,
    })),
  });
}

export class LocalGemmaProvider implements InferenceProvider {
  readonly id = "local-gemma" as const;
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: (value: LocalGemmaWorkerResponse) => void; reject: (error: Error) => void }>();

  async isAvailable() {
    const capabilities = await detectSavannaCapabilities();
    return capabilities.webgpu && capabilities.wasm && capabilities.sufficientStorage && capabilities.localGemma;
  }

  async load() {
    if (!this.worker) {
      this.worker = new Worker(new URL("../../workers/savanna.worker.ts", import.meta.url), { type: "module" });
      this.worker.addEventListener("message", event => {
        const response = event.data as LocalGemmaWorkerResponse;
        const handler = this.pending.get(response.id);
        if (!handler) return;
        this.pending.delete(response.id);
        handler.resolve(response);
      });
      this.worker.addEventListener("error", event => {
        const error = new Error(event.message || "Local Gemma worker failed.");
        for (const handler of Array.from(this.pending.values())) handler.reject(error);
        this.pending.clear();
      });
    }
    await this.request("load", {
      modelUrl: localModelUrl(),
      runtimeUrl: litertRuntimeUrl(),
      maxNumTokens: 4096,
    });
  }

  async unload() {
    if (this.worker) await this.request("unload", {}).catch(() => undefined);
    this.worker?.terminate();
    this.worker = null;
  }

  private async request(type: "detect" | "load" | "generate" | "unload", payload: unknown) {
    if (!this.worker) throw new Error("Local Gemma worker is not loaded.");
    const id = crypto.randomUUID();
    const response = new Promise<LocalGemmaWorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error("Local Gemma worker timed out."));
      }, 120_000);
    });
    this.worker.postMessage({ id, type, payload });
    const result = await response;
    if (!result.ok) throw new Error(result.error || "Local Gemma request failed.");
    return result;
  }

  async generate(request: InferenceRequest): Promise<InferenceResponse> {
    const started = performance.now();
    await this.load();
    const response = await this.request("generate", {
      systemPrompt: request.systemPrompt,
      prompt: buildGroundedPrompt(request),
      maxTokens: request.maxTokens ?? 420,
    });
    const text = response.payload?.text?.trim();
    if (!text) throw new Error("Local Gemma returned no text.");
    return {
      text,
      sources: request.context.sources,
      provider: this.id,
      model: SAVANNA_LOCAL_GEMMA_CHECKPOINT_ID,
      embeddingModel: SAVANNA_EMBEDDING_GEMMA_MODEL_ID,
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      grounded: request.context.sources.length > 0,
    };
  }
}
