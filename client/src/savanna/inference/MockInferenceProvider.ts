import type { InferenceProvider, InferenceRequest, InferenceResponse } from "./InferenceProvider";

export class MockInferenceProvider implements InferenceProvider {
  readonly id = "mock" as const;

  async isAvailable() {
    return true;
  }

  async generate(request: InferenceRequest): Promise<InferenceResponse> {
    const started = performance.now();
    return {
      text: request.context.fallbackAnswer,
      sources: request.context.sources,
      provider: this.id,
      model: "mock-savanna-inference",
      embeddingModel: null,
      latencyMs: Math.max(1, Math.round(performance.now() - started)),
      grounded: request.context.sources.length > 0,
    };
  }
}
