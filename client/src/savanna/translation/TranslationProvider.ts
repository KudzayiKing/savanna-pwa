export type TranslationProviderId = "local-translate-gemma" | "cloud-translation" | "passthrough";

export type TranslationRequest = {
  text: string;
  sourceLanguage?: string | null;
  targetLanguage: string;
};

export type TranslationResponse = {
  translatedText: string;
  sourceLanguage: string | null;
  targetLanguage: string;
  provider: TranslationProviderId;
  model: string | null;
};

export interface TranslationProvider {
  readonly id: TranslationProviderId;
  isAvailable(): Promise<boolean>;
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}
