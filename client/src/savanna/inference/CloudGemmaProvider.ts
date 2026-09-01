import { requestGemmaRecallAnswer } from "@/lib/gemmaAi";
import type { InferenceProvider, InferenceRequest, InferenceResponse } from "./InferenceProvider";

export class CloudGemmaProvider implements InferenceProvider {
  readonly id = "cloud-gemma" as const;

  async isAvailable() {
    return typeof fetch === "function" && navigator.onLine !== false;
  }

  async generate(request: InferenceRequest): Promise<InferenceResponse> {
    const started = performance.now();
    const result = await requestGemmaRecallAnswer({
      query: request.userQuery,
      conversationTitle: request.context.conversationTitle,
      fallback: {
        id: crypto.randomUUID(),
        query: request.context.query,
        answer: request.context.fallbackAnswer,
        createdAt: new Date(),
        source: request.context.sources[0] ?? null,
        sources: request.context.sources,
        mode: request.context.sources.some(source => source.sourceType === "story") ? "memory" : "conversation",
      },
    });

    if (!result) {
      throw new Error("Cloud Gemma is unavailable.");
    }

    return {
      text: result.answer,
      sources: result.sources,
      provider: this.id,
      model: result.model,
      embeddingModel: result.embeddingModel,
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      grounded: result.sources.length > 0,
    };
  }
}
