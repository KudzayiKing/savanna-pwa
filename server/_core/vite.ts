import { type Express } from "express";
import fs from "node:fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { clientRoot } from "../../vite.shared";
import viteConfig from "../../vite.config";

/**
 * Attaches the Vite dev server as Express middleware.
 *
 * DEV-ONLY. This module imports `vite`, which is a devDependency. It must never
 * be reachable from the production entry point (`server/_core/index.ts`),
 * because esbuild hoists those imports into the production bundle and the
 * server then fails to start under a `--omit=dev` install. The dev entry point
 * is `server/_core/dev.ts`.
 */
export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(clientRoot, "index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
