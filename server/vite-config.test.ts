import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

/**
 * Guards the contract between `vite.config.ts` and the Express dev-server
 * integration in `server/_core/vite.ts`.
 *
 * The config exports the *function* form of `defineConfig` so plugins can be
 * gated on `mode`. That makes the default export a function, and spreading a
 * function yields no own properties — so `createViteServer({ ...viteConfig })`
 * silently received `{}` and dropped `root`, `publicDir`, `resolve.alias` and
 * `envDir`. The failure was quiet: static files fell through to the SPA HTML and
 * every `@/…` import failed to resolve, with nothing in the logs pointing at the
 * cause.
 */
describe("Vite dev-server integration", () => {
  it("resolves the function-form config before spreading it into createViteServer", async () => {
    const [config, vite] = await Promise.all([
      readFile(resolve(projectRoot, "vite.config.ts"), "utf8"),
      readFile(resolve(projectRoot, "server/_core/vite.ts"), "utf8"),
    ]);

    // The config really is the function form — the reason the bug was possible.
    expect(config).toMatch(/defineConfig\(\s*\(\{[^)]*mode[^)]*\}\)\s*=>/);

    // It must be resolved, never spread directly.
    expect(vite).toContain("resolveViteConfig");
    expect(vite).not.toMatch(/\.\.\.viteConfig\b/);

    // Resolving has to be conditional, so reverting the config to the object
    // form keeps working rather than throwing on a non-callable default export.
    expect(vite).toMatch(/typeof exported === "function"/);

    // Middleware-mode options must merge over the config's `server` block, not
    // replace it — `fs.strict` and `fs.deny` live there.
    expect(vite).toContain("...baseConfig.server");
  });

  it("keeps the client public directory wired to the same path in both build and dev", async () => {
    const shared = await readFile(resolve(projectRoot, "vite.shared.ts"), "utf8");
    const config = await readFile(resolve(projectRoot, "vite.config.ts"), "utf8");

    // `server/_core/vite.ts` imports this module rather than `vite` because it
    // is reachable from the dev entry point. If the two drifted, dev would
    // serve static files from somewhere the build never writes.
    expect(shared).toContain('export const clientPublicDir = path.resolve(projectRoot, "client", "public")');
    expect(shared).toContain('export const buildOutDir = path.resolve(projectRoot, "dist", "public")');
    expect(config).toContain("publicDir: clientPublicDir");

    // This module must stay free of `vite`, or the production bundle pulls the
    // whole Vite toolchain in and the server dies under `--omit=dev`.
    expect(shared).not.toMatch(/from ["']vite["']/);
  });

  it("routes Netlify API traffic to the serverless tRPC function before the SPA fallback", async () => {
    const [netlify, pkg, adapter] = await Promise.all([
      readFile(resolve(projectRoot, "netlify.toml"), "utf8"),
      readFile(resolve(projectRoot, "package.json"), "utf8"),
      readFile(resolve(projectRoot, "server/_core/netlify.ts"), "utf8"),
    ]);

    const apiRedirect = netlify.indexOf('from = "/api/*"');
    const spaRedirect = netlify.indexOf('from = "/*"');

    expect(apiRedirect).toBeGreaterThanOrEqual(0);
    expect(spaRedirect).toBeGreaterThanOrEqual(0);
    expect(apiRedirect).toBeLessThan(spaRedirect);
    expect(netlify).toContain('to = "/.netlify/functions/api/:splat"');
    expect(netlify).toContain('directory = "netlify/functions"');
    expect(pkg).toContain("server/_core/netlify.ts");
    expect(pkg).toContain("netlify/functions/api.mjs");
    expect(pkg).toContain('"serverless-http"');
    expect(adapter).toContain("serverless(app)");
    expect(adapter).toContain('replace(/^\\/\\.netlify\\/functions\\/api/, "/api")');
    expect(adapter).toContain('headers: { "content-type": "application/json" }');
  });
});
