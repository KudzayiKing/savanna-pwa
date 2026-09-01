import type { TranslationProvider, TranslationRequest, TranslationResponse } from "./TranslationProvider";

type CloudTranslationResponse = {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  provider: "gemma" | "passthrough";
  model: string | null;
};

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
    console.warn("[Savanna] Cloud translation fallback failed", error);
    return null;
  }
}

export class CloudTranslationProvider implements TranslationProvider {
  readonly id = "cloud-translation" as const;

  async isAvailable() {
    return typeof fetch === "function";
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const result = await postJson<CloudTranslationResponse>("/api/ai/translate", request);
    if (!result || result.provider !== "gemma") {
      throw new Error("Cloud translation is unavailable.");
    }
    return {
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      provider: this.id,
      model: result.model,
    };
  }
}
