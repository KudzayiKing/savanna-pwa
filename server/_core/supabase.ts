/**
 * Supabase (GoTrue) integration — server side.
 *
 * Deliberately dependency-free: `@supabase/supabase-js` could not be installed
 * in this environment, and nothing here needs it. GoTrue is a plain REST API
 * and an access token is just an HS256 JWT, which `jose` (already a dependency)
 * verifies locally with no network call.
 *
 * The local `users` row is keyed by `openId = "supabase:<uuid>"` so the identity
 * is namespaced and a future provider can be added without collisions.
 */
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { ENV } from "./env";

/** Prefix used to store a Supabase user id in `users.openId` (varchar(64)). */
const OPEN_ID_PREFIX = "supabase:";

export const supabaseOpenId = (userId: string) => `${OPEN_ID_PREFIX}${userId}`;

export type SupabaseClaims = {
  /** Supabase user id (UUID). */
  sub: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  /** Supabase's own `aud` for logged-in users is always "authenticated". */
  aud?: string;
  /** Issuer, normally `${SUPABASE_URL}/auth/v1`. */
  iss?: string;
  exp?: number;
  /** Email/OAuth identity data copied into the token by GoTrue. */
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

export type SupabaseUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string | null;
};

export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: SupabaseUser;
};

// ---------------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------------

/**
 * Candidate HMAC keys for an access token.
 *
 * GoTrue signs tokens with the raw bytes of the configured JWT secret
 * (`[]byte(secret)`), i.e. the base64 *string* as UTF-8. Some deployments and
 * most community examples instead base64-decode it first. Rather than guess and
 * lock everyone out, both derivations are tried in order and the winner is
 * cached for the life of the process.
 */
let cachedKeyIndex: number | null = null;

function candidateKeys(): Uint8Array[] {
  const secret = ENV.supabaseJwtSecret.trim();
  if (!secret) return [];

  const keys: Uint8Array[] = [new TextEncoder().encode(secret)];

  const decoded = Buffer.from(secret, "base64");
  const isCleanBase64 =
    decoded.length > 0 && decoded.toString("base64") === secret;
  if (isCleanBase64) keys.push(new Uint8Array(decoded));

  return keys;
}

function orderedKeys(): Uint8Array[] {
  const keys = candidateKeys();
  if (cachedKeyIndex !== null && cachedKeyIndex < keys.length) {
    return [keys[cachedKeyIndex], ...keys.filter((_, i) => i !== cachedKeyIndex)];
  }
  return keys;
}

function originalIndexOf(key: Uint8Array): number {
  return candidateKeys().findIndex(
    candidate =>
      candidate.length === key.length && candidate.every((b, i) => b === key[i])
  );
}

/**
 * Algorithms verified against the project's published JWKS.
 *
 * Supabase issues two kinds of access token:
 *
 *  - **Legacy** — HS256 with the project's "JWT secret".
 *  - **Current** — asymmetric (usually ES256) with rotating keys published at
 *    `/auth/v1/.well-known/jwks.json`. Projects created after the signing-keys
 *    rollout use this by default, *and still show the legacy secret in the
 *    dashboard*. The dashboard is therefore not a reliable signal of which
 *    scheme is live.
 *
 * The token's own `alg` header is authoritative, so dispatch on it rather than
 * guessing. Verifying an ES256 token as HS256 rejects every single user.
 */
const ASYMMETRIC_ALGS = [
  "ES256",
  "ES384",
  "ES512",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "EdDSA",
];

/**
 * `createRemoteJWKSet` caches keys and honours HTTP cache headers, so it must be
 * reused across requests rather than rebuilt per call. Keyed by URL so a
 * changed configuration (or a test) gets a fresh set.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(url: string) {
  let keySet = jwksCache.get(url);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, keySet);
  }
  return keySet;
}

/**
 * JWKS endpoint for this project. Overridable so tests can serve keys from a
 * local server without reaching the network.
 */
export function supabaseJwksUrl(): string {
  return (
    process.env.SUPABASE_JWKS_URL ||
    (ENV.supabaseUrl ? `${ENV.supabaseUrl}/auth/v1/.well-known/jwks.json` : "")
  );
}

/**
 * Shared claim checks. The signature has already been verified by the caller;
 * this enforces the shape we rely on.
 */
function toClaims(payload: unknown): SupabaseClaims | null {
  const claims = payload as SupabaseClaims;

  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    console.warn("[Supabase] Access token has no sub claim");
    return null;
  }

  const expectedIssuer = `${ENV.supabaseUrl}/auth/v1`;
  if (ENV.supabaseUrl && claims.iss && claims.iss !== expectedIssuer) {
    // The signature check already binds the token to this project's signing
    // key, so this is defence-in-depth rather than the primary control.
    console.warn(
      `[Supabase] Token issuer "${claims.iss}" does not match "${expectedIssuer}"`
    );
  }

  return claims;
}

/** Verifies an ES256/RS256/… token against the project's published JWKS. */
async function verifyAsymmetricToken(
  token: string
): Promise<SupabaseClaims | null> {
  const jwksUrl = supabaseJwksUrl();
  if (!jwksUrl) {
    console.error(
      "[Supabase] SUPABASE_URL is not configured; cannot fetch signing keys"
    );
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwksFor(jwksUrl), {
      audience: "authenticated",
      clockTolerance: 15,
    });
    return toClaims(payload);
  } catch (error) {
    console.warn(
      "[Supabase] Asymmetric token verification failed",
      String(error)
    );
    return null;
  }
}

/** Verifies an HS256 token against the legacy JWT secret. */
async function verifyLegacyToken(
  token: string
): Promise<SupabaseClaims | null> {
  const keys = orderedKeys();
  if (keys.length === 0) {
    console.error("[Supabase] SUPABASE_JWT_SECRET is not configured");
    return null;
  }

  for (const key of keys) {
    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
        audience: "authenticated",
        clockTolerance: 15,
      });
      cachedKeyIndex = originalIndexOf(key);
      return toClaims(payload);
    } catch {
      // Try the next key derivation.
    }
  }

  return null;
}

/**
 * Verifies a Supabase access token's signature, expiry and audience.
 * Returns null on any failure — never throws, so callers can treat an invalid
 * token identically to an absent one.
 */
export async function verifySupabaseAccessToken(
  token: string | undefined | null
): Promise<SupabaseClaims | null> {
  if (!token) return null;

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    // Not a JWT at all.
    return null;
  }

  if (alg && ASYMMETRIC_ALGS.includes(alg)) return verifyAsymmetricToken(token);
  if (alg === "HS256") return verifyLegacyToken(token);

  console.warn(`[Supabase] Unsupported access token alg "${alg}"`);
  return null;
}

// ---------------------------------------------------------------------------
// GoTrue REST
// ---------------------------------------------------------------------------

export class SupabaseAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

/** User-safe messages. GoTrue's own wording is not surfaced to the client. */
const PUBLIC_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  email_not_confirmed: "Confirm your email address before signing in.",
  user_already_exists:
    "An account with this email already exists. Try signing in instead.",
  weak_password:
    "Choose a stronger password — at least 8 characters, mixing letters and numbers.",
  over_email_send_rate_limit:
    "Too many emails sent. Wait a few minutes and try again.",
  over_request_rate_limit: "Too many attempts. Wait a moment and try again.",
  signup_disabled: "New sign-ups are currently disabled.",
  email_address_invalid: "That email address is not valid.",
  validation_failed: "Please check the details you entered.",
  refresh_token_not_found: "Your session has expired. Please sign in again.",
  otp_expired: "That code has expired. Request a new one.",
};

export function publicAuthMessage(error: unknown): string {
  if (error instanceof SupabaseAuthError && error.code) {
    return PUBLIC_MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof SupabaseAuthError) return error.message;
  return "Authentication is temporarily unavailable. Please try again.";
}

async function gotrue<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    /** End-user access token. Omit to call with the publishable key only. */
    accessToken?: string;
  } = {}
): Promise<T> {
  const url = `${ENV.supabaseUrl}/auth/v1${path}`;
  const headers: Record<string, string> = {
    apikey: ENV.supabasePublishableKey,
    "Content-Type": "application/json",
  };
  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  } else {
    headers.authorization = `Bearer ${ENV.supabasePublishableKey}`;
  }

  const response = await fetch(url, {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const record = (parsed ?? {}) as Record<string, unknown>;
    const rawCode =
      typeof record.error_code === "string"
        ? record.error_code
        : typeof record.error === "string"
          ? record.error
          : undefined;
    const message =
      typeof record.msg === "string"
        ? record.msg
        : typeof record.message === "string"
          ? record.message
          : `Supabase request failed (${response.status})`;
    throw new SupabaseAuthError(message, response.status, rawCode);
  }

  return parsed as T;
}

export async function signUpWithPassword(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<SupabaseSession | { needsConfirmation: true; email: string }> {
  const result = await gotrue<Partial<SupabaseSession> & { id?: string }>(
    "/signup",
    {
      body: {
        email: input.email,
        password: input.password,
        data: input.name ? { name: input.name, full_name: input.name } : undefined,
      },
    }
  );

  // With email confirmation on, GoTrue returns the user but no session.
  if (!result.access_token) {
    return { needsConfirmation: true, email: input.email };
  }
  return result as SupabaseSession;
}

export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<SupabaseSession> {
  return gotrue<SupabaseSession>("/token?grant_type=password", {
    body: { email: input.email, password: input.password },
  });
}

export async function refreshSession(
  refreshToken: string
): Promise<SupabaseSession> {
  return gotrue<SupabaseSession>("/token?grant_type=refresh_token", {
    body: { refresh_token: refreshToken },
  });
}

export async function getUser(accessToken: string): Promise<SupabaseUser> {
  return gotrue<SupabaseUser>("/user", {
    method: "GET",
    accessToken,
  });
}

/** Revokes the refresh token server-side. Best effort — never throws. */
export async function revokeSession(accessToken: string): Promise<void> {
  try {
    await gotrue("/logout", { accessToken });
  } catch (error) {
    console.warn("[Supabase] Logout call failed", error);
  }
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  await gotrue("/recover", { body: { email } });
}

/**
 * Completes a password reset using the `token_hash` from Supabase's recovery
 * email. Handled server-side so the browser never needs a Supabase client.
 */
export async function completePasswordReset(input: {
  tokenHash: string;
  password: string;
}): Promise<void> {
  await gotrue("/verify", {
    body: {
      type: "recovery",
      token_hash: input.tokenHash,
      password: input.password,
    },
  });
}

export function displayNameOf(user: SupabaseUser): string {
  const metadata = user.user_metadata ?? {};
  for (const key of ["name", "full_name", "preferred_username"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 100);
  }
  if (user.email) return user.email.split("@")[0].slice(0, 100);
  return "Savanna member";
}
