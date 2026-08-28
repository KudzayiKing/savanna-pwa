import "dotenv/config";
import { createServer } from "http";
import { assertRuntimeConfig } from "../db";
import { createApp } from "./app";
import { startListening } from "./listen";
import { setupVite } from "./vite";

/**
 * DEVELOPMENT entry point (`pnpm dev`).
 *
 * Mirrors the production entry point but mounts the Vite dev server instead of
 * serving prebuilt static files. Kept separate from `index.ts` so that Vite and
 * its plugins stay out of the production bundle.
 */
async function startServer() {
  assertRuntimeConfig();
  const app = await createApp();
  const server = createServer(app);
  await setupVite(app, server);
  await startListening(server);
}

startServer().catch(console.error);
