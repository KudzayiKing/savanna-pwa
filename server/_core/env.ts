/**
 * Centralised runtime configuration.
 *
 * Supabase is the only identity provider. The Manus OAuth variables
 * (OAUTH_SERVER_URL / VITE_APP_ID / VITE_OAUTH_PORTAL_URL / OWNER_OPEN_ID)
 * were removed with that integration — do not reintroduce them.
 */
export const ENV = {
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",

  // --- Supabase -----------------------------------------------------------
  // Project URL, e.g. https://abcdefgh.supabase.co
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/+$/, ""),

  // `sb_publishable_...` key. Safe to expose to the browser; enforcement comes
  // from Row Level Security, not from hiding this value.
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",

  // Legacy JWT secret from Supabase → Project Settings → API. Used to verify
  // access tokens locally, so session validation needs no network round trip.
  // SERVER ONLY — never place this behind a VITE_ name.
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",

  // Supabase user id (a UUID) that is auto-promoted to `admin` on first
  // sign-in. Leave empty to disable the bootstrap.
  ownerSupabaseUserId: process.env.OWNER_SUPABASE_USER_ID ?? "",

  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // --- Optional Gemma cloud fallback --------------------------------------
  // The browser-local path uses LiteRT-LM/WebGPU; these are server-only fallbacks.
  gemmaApiBaseUrl: (process.env.GEMMA_API_BASE_URL ?? "").replace(/\/+$/, ""),
  gemmaApiKey: process.env.GEMMA_API_KEY ?? "",
  gemmaChatEndpoint: process.env.GEMMA_CHAT_ENDPOINT ?? "",
  gemmaEmbeddingEndpoint: process.env.GEMMA_EMBEDDING_ENDPOINT ?? "",
  gemmaTranslateEndpoint: process.env.GEMMA_TRANSLATE_ENDPOINT ?? "",
  gemmaChatModel: process.env.GEMMA_CHAT_MODEL ?? "",
  gemmaEmbeddingModel: process.env.GEMMA_EMBEDDING_MODEL ?? "",
  gemmaTranslateModel: process.env.GEMMA_TRANSLATE_MODEL ?? "",
};

export function assertSupabaseConfig(): void {
  const missing = (
    [
      ["SUPABASE_URL", ENV.supabaseUrl],
      ["SUPABASE_PUBLISHABLE_KEY", ENV.supabasePublishableKey],
      ["SUPABASE_JWT_SECRET", ENV.supabaseJwtSecret],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Supabase is not configured. Missing: ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill it in.`
    );
  }
}
