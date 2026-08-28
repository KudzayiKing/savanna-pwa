import { type Express } from "express";
import fs from "node:fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "node:path";
import { createServer as createViteServer, type ConfigEnv, type UserConfig } from "vite";
import { clientRoot } from "../../vite.shared";
import viteConfig from "../../vite.config";

/**
 * `vite.config.ts` exports the *function* form of `defineConfig` so it can
 * switch plugins on `mode`. Spreading that default export therefore spreads a
 * function, which contributes no own properties — silently discarding `root`,
 * `publicDir`, `resolve.alias` and `envDir`.
 *
 * The symptoms are confusing rather than loud: `client/public` stops being
 * served (so `/manifest.webmanifest` and `/service-worker.js` fall through to
 * the SPA HTML) and every `@/…` import fails to resolve. Resolve the config
 * before spreading it.
 */
async function resolveViteConfig(): Promise<UserConfig> {
  const exported = viteConfig as unknown as
    | UserConfig
    | ((env: ConfigEnv) => UserConfig | Promise<UserConfig>);

  return typeof exported === "function"
    ? await exported({ command: "serve", mode: "development" })
    : exported;
}

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

  const baseConfig = await resolveViteConfig();

  const vite = await createViteServer({
    ...baseConfig,
    configFile: false,
    // Merge rather than replace: the config supplies `host` and
    // `fs.{strict,deny}`, which limit what the dev server will read off disk.
    // Overwriting `server` wholesale silently disabled both.
    server: { ...baseConfig.server, ...serverOptions },
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
