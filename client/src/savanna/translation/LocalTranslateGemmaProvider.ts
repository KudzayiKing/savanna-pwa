import {
  SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL,
  SAVANNA_MEDIAPIPE_GENAI_WASM_URL,
  SAVANNA_TRANSLATE_GEMMA_MODEL_ID,
  SAVANNA_TRANSLATE_GEMMA_WEB_MODEL_URL,
} from "../inference/InferenceProvider";
import type { TranslationProvider, TranslationRequest, TranslationResponse } from "./TranslationProvider";

type MediaPipeFilesetResolver = {
  forGenAiTasks(wasmBaseUrl: string): Promise<unknown>;
};

type MediaPipeLlmInference = {
  generateResponse(prompt: string): Promise<string> | string;
  close?(): void;
};

type MediaPipeGenAiModule = {
  FilesetResolver: MediaPipeFilesetResolver;
    LlmInference: {
    createFromOptions(fileset: unknown, options: {
      baseOptions: { modelAssetBuffer: Uint8Array };
      maxTokens?: number;
    }): Promise<MediaPipeLlmInference>;
  };
};

declare global {
  interface Navigator {
    gpu?: unknown;
  }
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object" && "generated_text" in first && typeof first.generated_text === "string") {
      return first.generated_text.trim();
    }
  }
  if (value && typeof value === "object") {
    if ("generated_text" in value && typeof value.generated_text === "string") return value.generated_text.trim();
    if ("text" in value && typeof value.text === "string") return value.text.trim();
  }
  return "";
}

function stripPrompt(text: string, prompt: string) {
  return text.startsWith(prompt) ? text.slice(prompt.length).trim() : text.trim();
}

function buildTranslateGemmaPrompt(request: TranslationRequest) {
  const source = request.sourceLanguage?.trim() || "auto";
  const target = request.targetLanguage.trim();
  return [
    `You are a professional ${source} to ${target} translator.`,
    "Produce only the translation, without additional explanations or commentary.",
    `Please translate the following text into ${target}:`,
    "",
    request.text.trim(),
  ].join("\n");
}

export class LocalTranslateGemmaProvider implements TranslationProvider {
  readonly id = "local-translate-gemma" as const;
  private engine: MediaPipeLlmInference | null = null;
  private engineModelUrl = "";

  async isAvailable() {
    return typeof WebAssembly !== "undefined" && typeof fetch === "function";
  }

  private async loadModelBytes(modelUrl: string) {
    if (!("caches" in window)) {
      const response = await fetch(modelUrl, { mode: "cors" });
      if (!response.ok) throw new Error(`Could not download TranslateGemma web model (${response.status}).`);
      return new Uint8Array(await response.arrayBuffer());
    }

    const cache = await caches.open("savanna-translategemma-models-v1");
    const cached = await cache.match(modelUrl);
    if (cached) return new Uint8Array(await cached.arrayBuffer());

    const response = await fetch(modelUrl, { mode: "cors" });
    if (!response.ok) throw new Error(`Could not download TranslateGemma web model (${response.status}).`);
    await cache.put(modelUrl, response.clone());
    return new Uint8Array(await response.arrayBuffer());
  }

  private async load() {
    const modelUrl = import.meta.env.VITE_SAVANNA_TRANSLATE_GEMMA_MODEL_URL || SAVANNA_TRANSLATE_GEMMA_WEB_MODEL_URL;
    if (this.engine && this.engineModelUrl === modelUrl) return this.engine;

    this.engine?.close?.();
    this.engine = null;

    const runtimeUrl = import.meta.env.VITE_SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL || SAVANNA_MEDIAPIPE_GENAI_RUNTIME_URL;
    const wasmUrl = import.meta.env.VITE_SAVANNA_MEDIAPIPE_GENAI_WASM_URL || SAVANNA_MEDIAPIPE_GENAI_WASM_URL;
    const runtime = await import(/* @vite-ignore */ runtimeUrl) as MediaPipeGenAiModule;
    const fileset = await runtime.FilesetResolver.forGenAiTasks(wasmUrl);
    const model = await this.loadModelBytes(modelUrl);
    this.engine = await runtime.LlmInference.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model },
      maxTokens: 1024,
    });
    this.engineModelUrl = modelUrl;
    return this.engine;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const text = request.text.trim();
    if (!text) {
      return {
        translatedText: "",
        sourceLanguage: request.sourceLanguage ?? null,
        targetLanguage: request.targetLanguage,
        provider: this.id,
        model: null,
      };
    }

    const prompt = buildTranslateGemmaPrompt({ ...request, text });
    const engine = await this.load();
    const result = await engine.generateResponse(prompt);
    const translatedText = stripPrompt(extractText(result), prompt);
    if (!translatedText) throw new Error("Local TranslateGemma returned no text.");

    return {
      translatedText,
      sourceLanguage: request.sourceLanguage ?? null,
      targetLanguage: request.targetLanguage,
      provider: this.id,
      model: SAVANNA_TRANSLATE_GEMMA_MODEL_ID,
    };
  }
}
