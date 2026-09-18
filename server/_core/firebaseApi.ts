import express from "express";
import { createApp } from "./app";
import { registerAiRoutes } from "./aiRoutes";
import { errorHandler, securityHeaders } from "./security";

/**
 * FIREBASE CLOUD FUNCTIONS entry point for `/api/*`.
 *
 * Firebase Hosting is static, so `firebase.json` rewrites every unmatched path
 * to `/index.html` — which is why `/api/trpc` and the three `/api/ai/*` routes
 * are dead in production today: the browser gets 29 KB of HTML where it expects
 * JSON. This module is the Express app behind the `api` HTTPS function that the
 * `/api/**` rewrite points at (see `functions/index.js` and `firebase.json`).
 *
 * It is the sibling of `./netlify.ts` and follows the same two rules:
 *
 *  1. Never import `./vite`. It is a devDependency, and esbuild hoists
 *     transitive imports, so a single static edge to it would make the whole
 *     Vite toolchain a startup dependency of the deployed function.
 *  2. Never call `serveStatic`. Firebase Hosting serves `dist/public` itself;
 *     this function exists only to answer `/api/*`.
 *
 * Deliberately does NOT import `dotenv/config` (unlike `./netlify.ts`). Firebase
 * Functions v2 already injects `functions/.env` and `functions/.env.<projectId>`
 * into `process.env`, and dotenv would resolve `.env` relative to the function's
 * working directory — reading the same file a second time and, worse, picking up
 * a root `.env` with a `DATABASE_URL` pointing somewhere else entirely.
 *
 * Environment is loaded by the Firebase runtime, not by this file:
 *   firebase functions:secrets:set GEMMA_API_KEY       # then bind in functions/index.js
 *   echo 'GEMMA_API_BASE_URL=...' >> functions/.env
 * See the comment block at the top of `functions/index.js`.
 */
export async function createApiApp(): Promise<express.Express> {
  try {
    return await createApp();
  } catch (error) {
    // The MVP only needs the AI routes, and none of them touch the database.
    // `createApp()` does not require one today — `getDb()` is lazy and
    // `assertRuntimeConfig()` is only called by `./index.ts` — but it does pull
    // the tRPC router (and therefore the whole data layer) into its import
    // graph. If that ever changes, a missing `DATABASE_URL` must degrade the
    // function to "AI only", not take `/api/ai/*` down with it.
    console.error("[firebase-api] createApp() failed; serving AI routes only", error);
    const app = express();
    app.use(securityHeaders);
    app.use(express.json({ limit: "100kb" }));
    app.get("/healthz", (_req, res) => {
      res.set("Cache-Control", "no-store");
      res.status(200).json({ status: "degraded", uptimeSeconds: Math.round(process.uptime()) });
    });
    registerAiRoutes(app);
    app.use(errorHandler);
    return app;
  }
}
