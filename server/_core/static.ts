import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";

/**
 * Serves the built client from `dist/public`.
 *
 * This module must not import `vite` — it is part of the production entry
 * point, which is bundled with esbuild and must run with only production
 * dependencies installed.
 */
export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}. Run \`pnpm build\` before starting the production server.`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
