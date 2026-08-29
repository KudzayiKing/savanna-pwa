import "dotenv/config";
import serverless from "serverless-http";
import { assertRuntimeConfig } from "../db";
import { createApp } from "./app";

/**
 * NETLIFY FUNCTION entry point.
 *
 * Netlify static hosting only serves files, so the Express app bundled by
 * `pnpm build` is never executed and every `/api/trpc/*` call falls through to
 * the SPA fallback. The browser then receives `<!doctype html>` where it
 * expects JSON, which tRPC reports as
 * `SyntaxError: Unexpected token '<' … is not valid JSON`.
 *
 * This file adapts `createApp()` to a Netlify Function so `/api/*` can be
 * rewritten onto it (see netlify.toml). Keeping the API on the *same* origin as
 * the front end is what makes this the right fix rather than pointing the
 * client at a separate API host: the session cookie is `SameSite=Lax`
 * (see `./cookies.ts`), and a `SameSite=Lax` cookie is not sent on cross-site
 * `fetch()`. A split-origin deployment would therefore let sign-in appear to
 * succeed and then silently drop the session on every later request.
 *
 * Like `./index.ts`, this must never import the Vite dev server (`./vite`).
 * It also deliberately does NOT call `serveStatic` — Netlify serves
 * `dist/public` itself, and the function only exists to answer `/api/*`.
 */

interface NetlifyEvent {
  httpMethod?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  multiValueHeaders?: Record<string, string[]>;
  queryStringParameters?: Record<string, string> | null;
  multiValueQueryStringParameters?: Record<string, string[]> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface NetlifyResult {
  statusCode: number;
  headers?: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: string;
  isBase64Encoded?: boolean;
}

type Handler = (event: NetlifyEvent, context: unknown) => Promise<NetlifyResult>;

/**
 * The Express app is built once per cold start and reused by every warm
 * invocation. Rebuilding per request would throw away the database connection
 * pool and re-run tRPC router setup on every call.
 *
 * Note this is cached *outside* the try/catch below: a failed init is retried on
 * the next invocation rather than being permanently poisoned, so fixing an
 * environment variable does not require a redeploy.
 */
let cachedHandler: Handler | null = null;

async function buildHandler(): Promise<Handler> {
  // Fail fast on missing configuration. Without this the process would accept
  // traffic with no database and every write would vanish silently.
  assertRuntimeConfig();

  const app = await createApp();
  const handler = serverless(app) as Handler;

  return async (event, context) => {
    // Netlify hands the function either the original request path
    // (`/api/trpc/auth.signIn`) or the rewritten one
    // (`/.netlify/functions/api/trpc/auth.signIn`) depending on how the
    // rewrite was applied. Normalise both onto the `/api/...` form the Express
    // app routes on. The query string is left untouched.
    const path = (event.path ?? "/").replace(/^\/\.netlify\/functions\/api/, "/api");

    return handler({ ...event, path }, context);
  };
}

export async function handler(event: NetlifyEvent, context: unknown): Promise<NetlifyResult> {
  try {
    if (!cachedHandler) {
      cachedHandler = await buildHandler();
    }
    return await cachedHandler(event, context);
  } catch (error) {
    // Never let an initialisation failure escape as Netlify's HTML error page.
    // The tRPC client parses every body as JSON, so an HTML error surfaces as
    // the same misleading "Unexpected token '<'" — the exact symptom this
    // function exists to eliminate. A JSON body makes the real cause visible.
    console.error("[netlify-function] request failed:", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    };
  }
}
