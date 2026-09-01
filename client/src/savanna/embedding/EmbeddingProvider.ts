export type EmbeddingProviderId = "local-embedding-gemma" | "local-hash";

export type EmbeddingRequest = {
  text: string;
};

export type EmbeddingResponse = {
  embedding: number[];
  model: string;
  provider: EmbeddingProviderId;
  dimensions: number;
  semanticSummary: string;
  languageCode: string | null;
};

export interface EmbeddingProvider {
  readonly id: EmbeddingProviderId;
  isAvailable(): Promise<boolean>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}
