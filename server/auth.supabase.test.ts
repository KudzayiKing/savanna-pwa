/**
 * Supabase session + token verification tests.
 *
 * These run entirely offline. GoTrue access tokens are plain HS256 JWTs, so a
 * valid one can be minted locally with `jose` and run through the real
 * verification path — no network, no database, no dependency on project state.
 *
 * Replaces the old `auth.localLogin` tests, which covered the Manus-era local
 * login that was removed with that integration.
 */
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HttpError } from "@shared/_core/errors";

// A 64-byte secret base64-encoded, i.e. the same shape Supabase issues. It must
// be clean base64 for the decoded-key fallback to be exercised (see below).
const SUPABASE_JWT_SECRET = randomBytes(64).toString("base64");
const SESSION_SECRET = "test-session-secret-value";
const SUPABASE_URL = "https://test-project.supabase.co";

vi.stubEnv("NODE_ENV", "test");
vi.stubEnv("JWT_SECRET", SESSION_SECRET);
vi.stubEnv("SUPABASE_URL", SUPABASE_URL);
vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
vi.stubEnv("SUPABASE_JWT_SECRET", SUPABASE_JWT_SECRET);

const rawKey = new TextEncoder().encode(SUPABASE_JWT_SECRET);
const decodedKey = new Uint8Array(Buffer.from(SUPABASE_JWT_SECRET, "base64"));

type SupabaseModule = typeof import("./_core/supabase");
type SdkModule = typeof import("./_core/sdk");

let supabase: SupabaseModule;
let sdk: SdkModule["sdk"];

beforeAll(async () => {
  vi.resetModules();
  supabase = await import("./_core/supabase");
  sdk = (await import("./_core/sdk")).sdk;
});

type TokenOptions = {
  key: Uint8Array;
  sub?: string;
  audience?: string;
  /** Negative values mint an already-expired token. */
  expiresInSeconds?: number;
  issuer?: string;
};

async function mintAccessToken(options: TokenOptions): Promise<string> {
  const {
    key,
    sub = "11111111-2222-3333-4444-555555555555",
    audience = "authenticated",
    expiresInSeconds = 3600,
    issuer = `${SUPABASE_URL}/auth/v1`,
  } = options;

  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT({ email: "tester@example.com", role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setIssuer(issuer)
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds);

  if (audience !== null) jwt = jwt.setAudience(audience);

  return jwt.sign(key);
}

describe("verifySupabaseAccessToken", () => {
  it("returns null when no token is supplied", async () => {
    expect(await supabase.verifySupabaseAccessToken(undefined)).toBeNull();
    expect(await supabase.verifySupabaseAccessToken("")).toBeNull();
  });

  it("returns null for a malformed or unsigned token", async () => {
    expect(await supabase.verifySupabaseAccessToken("not-a-jwt")).toBeNull();
    expect(await supabase.verifySupabaseAccessToken("a.b.c")).toBeNull();
  });

  // GoTrue signs with the raw bytes of the secret. This is the primary path.
  it("accepts a token signed with the raw secret bytes", async () => {
    const token = await mintAccessToken({ key: rawKey });
    const claims = await supabase.verifySupabaseAccessToken(token);

    expect(claims?.sub).toBe("11111111-2222-3333-4444-555555555555");
    expect(claims?.email).toBe("tester@example.com");
  });

  // Some deployments base64-decode the secret first. Rather than lock those
  // users out, both derivations are accepted — assert that fallback works.
  it("accepts a token signed with the base64-decoded secret", async () => {
    const token = await mintAccessToken({ key: decodedKey });
    const claims = await supabase.verifySupabaseAccessToken(token);

    expect(claims?.sub).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("rejects a token signed with an unrelated key", async () => {
    const token = await mintAccessToken({ key: randomBytes(64) });
    expect(await supabase.verifySupabaseAccessToken(token)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await mintAccessToken({ key: rawKey, expiresInSeconds: -120 });
    expect(await supabase.verifySupabaseAccessToken(token)).toBeNull();
  });

  // The `anon` key also produces a signed JWT for this project. Accepting it
  // would let anyone with the public key authenticate as a user.
  it("rejects a token whose audience is not 'authenticated'", async () => {
    const token = await mintAccessToken({ key: rawKey, audience: "anon" });
    expect(await supabase.verifySupabaseAccessToken(token)).toBeNull();
  });

  it("rejects a token with no subject", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(rawKey);

    expect(await supabase.verifySupabaseAccessToken(token)).toBeNull();
  });
});

// Projects created after Supabase's signing-keys rollout issue ES256 tokens
// verified against a published JWKS, even though the dashboard still shows a
// legacy JWT secret. Dispatching purely on HS256 would lock every user out, so
// the asymmetric path is exercised here against a local JWKS server.
describe("verifySupabaseAccessToken — asymmetric signing keys (ES256)", () => {
  const servers: Server[] = [];
  const KID = "test-signing-key-1";
  const SUBJECT = "22222222-3333-4444-5555-666666666666";

  /** Serves a JWKS document from an ephemeral local port. */
  async function serveJwks(jwk: Record<string, unknown>): Promise<string> {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return `http://127.0.0.1:${port}/jwks.json`;
  }

  async function publishKey(publicKey: KeyLike): Promise<void> {
    const jwk = {
      ...(await exportJWK(publicKey)),
      alg: "ES256",
      kid: KID,
      use: "sig",
    };
    vi.stubEnv("SUPABASE_JWKS_URL", await serveJwks(jwk));
  }

  function mintEs256Token(privateKey: KeyLike, audience = "authenticated") {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ email: "es256@example.com" })
      .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
      .setSubject(SUBJECT)
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience(audience)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);
  }

  afterAll(async () => {
    vi.stubEnv("SUPABASE_JWKS_URL", "");
    await Promise.all(
      servers.map(
        server => new Promise<void>(resolve => server.close(() => resolve()))
      )
    );
  });

  it("accepts an ES256 token signed with a key published in the JWKS", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    await publishKey(publicKey);

    const claims = await supabase.verifySupabaseAccessToken(
      await mintEs256Token(privateKey)
    );

    expect(claims?.sub).toBe(SUBJECT);
    expect(claims?.email).toBe("es256@example.com");
  });

  it("rejects an ES256 token signed by a key absent from the JWKS", async () => {
    const { publicKey } = await generateKeyPair("ES256");
    await publishKey(publicKey);

    const { privateKey: rogueKey } = await generateKeyPair("ES256");
    const token = await mintEs256Token(rogueKey);

    expect(await supabase.verifySupabaseAccessToken(token)).toBeNull();
  });

  it("rejects an ES256 token whose audience is not 'authenticated'", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    await publishKey(publicKey);

    const token = await mintEs256Token(privateKey, "anon");

    expect(await supabase.verifySupabaseAccessToken(token)).toBeNull();
  });
});

describe("supabaseOpenId", () => {
  it("namespaces the Supabase user id so providers cannot collide", () => {
    expect(supabase.supabaseOpenId("abc-123")).toBe("supabase:abc-123");
  });
});

describe("session cookie", () => {
  it("round-trips through signSession and verifySession", async () => {
    const token = await sdk.signSession({
      openId: "supabase:user-1",
      name: "Tester",
      email: "tester@example.com",
    });

    const session = await sdk.verifySession(token);
    expect(session).toEqual({
      openId: "supabase:user-1",
      name: "Tester",
      email: "tester@example.com",
    });
  });

  it("rejects a session token signed with the wrong secret", async () => {
    const foreign = await new SignJWT({
      openId: "supabase:attacker",
      name: "Attacker",
      email: null,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("a-completely-different-secret"));

    expect(await sdk.verifySession(foreign)).toBeNull();
  });

  it("rejects an expired session token", async () => {
    const token = await sdk.signSession(
      { openId: "supabase:user-1", name: "Tester", email: null },
      { expiresInMs: -1000 }
    );

    expect(await sdk.verifySession(token)).toBeNull();
  });
});

describe("createSessionFromSupabaseToken", () => {
  it("refuses an invalid access token before touching the database", async () => {
    // Verification happens first, so an invalid token never reaches db lookups.
    // `ForbiddenError` is a factory, not a class, so assert on the HttpError it
    // returns rather than using `toBeInstanceOf`.
    await expect(
      sdk.createSessionFromSupabaseToken("garbage.token.value")
    ).rejects.toMatchObject({ name: "HttpError", statusCode: 403 });
  });

  it("mints a session cookie for a valid token", async () => {
    const token = await mintAccessToken({ key: rawKey });
    const session = await sdk.createSessionFromSupabaseToken(token);

    expect(session.openId).toBe("supabase:11111111-2222-3333-4444-555555555555");
    expect(session.expiresInMs).toBeGreaterThan(0);

    // The minted cookie must itself be a valid local session.
    const verified = await sdk.verifySession(session.token);
    expect(verified?.openId).toBe(session.openId);
  });
});
