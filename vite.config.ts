import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type PluginOption, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
// Vite-free path constants, shared with the Express dev-server integration so
// the two cannot drift. See vite.shared.ts for why it must not import `vite`.
import { buildOutDir, clientPublicDir, clientRoot, projectRoot as PROJECT_ROOT, resolveAliases } from "./vite.shared";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * Injects Umami analytics only when the deploy provides both values.
 *
 * Keeping the tag out of client/index.html prevents Vite from warning about
 * unresolved `%VITE_*%` placeholders and avoids a broken same-origin /umami
 * request in environments where analytics is intentionally unset.
 */
function vitePluginAnalyticsTag(): Plugin {
  return {
    name: "savanna-analytics-tag",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const endpoint = process.env.VITE_ANALYTICS_ENDPOINT;
        const websiteId = process.env.VITE_ANALYTICS_WEBSITE_ID;

        if (!endpoint || !websiteId) {
          return html;
        }

        return {
          html,
          tags: [
            {
              tag: "script",
              attrs: {
                defer: true,
                src: `${endpoint.replace(/\/+$/, "")}/umami`,
                "data-website-id": websiteId,
              },
              injectTo: "body",
            },
          ],
        };
      },
    },
  };
}

/**
 * Builds the plugin list for the requested mode.
 *
 * The Manus-specific plugins are development conveniences that were being
 * bundled into production. `vitePluginManusRuntime` alone inlined ~367 kB of
 * JavaScript into index.html — 99.6% of the document — which the browser had to
 * download and evaluate before the app could render. `jsxLocPlugin` and the
 * debug collector are Manus-IDE tooling with no production role.
 *
 * `mode` comes from `defineConfig` rather than `process.env.NODE_ENV`, which is
 * not reliably set at config-evaluation time.
 *
 * `vitePluginAnalyticsTag` runs in both modes: it injects analytics only when
 * the relevant environment variables exist.
 */
/**
 * Deletes `__manus__/` from the built output.
 *
 * The directory holds the Manus debug collector, which `publicDir` copies
 * verbatim into `dist/public` on every build. The `<script>` tag that loads it
 * is dev-only, so in production the files are ~25 kB of unreachable JavaScript
 * sitting on a public URL. They stay in `client/public` because the dev server
 * serves them from there.
 */
function vitePluginStripDevAssets(): Plugin {
  return {
    name: "savanna-strip-dev-assets",
    apply: "build",
    closeBundle() {
      const target = path.join(buildOutDir, "__manus__");
      fs.rmSync(target, { recursive: true, force: true });
    },
  };
}

/**
 * Renames the DOM ids and global marker that `vitePluginManusRuntime` hard-
 * codes into the runtime script it inlines into index.html.
 *
 * The plugin exposes a `scriptId` option for the `<script>` tag itself (used
 * below), but the rest are baked into its bundled runtime as string literals
 * with no way to override them. This post-transform rewrites the emitted HTML
 * so nothing carrying Manus branding reaches the browser.
 *
 * Scope: every Manus-branded token that is purely visual — the DOM ids, the
 * host-dev global, and the three `data-*` attributes the runtime stamps onto
 * elements. Renaming any of these is inert: nothing outside the injected script
 * reads them, so a mismatch cannot break behaviour.
 *
 * Storage-backed names are deliberately NOT renamed, because a rename there
 * discards live user state rather than just changing a label:
 *   - `manus-runtime-user-info` — `client/src/_core/hooks/useAuth.ts:115` reads
 *     this localStorage key; renaming one side strands the other.
 *   - `manus-cookie` — renaming would orphan any cookie the runtime already set.
 * `_manusImportantProperties` is skipped too: internal element bookkeeping,
 * invisible to users and not worth the churn.
 *
 * Note that `__MANUS_HOST_DEV__` is *both* written (`window.__MANUS_HOST_DEV__
 * = isHostDev`) and read (`const r = window.__MANUS_HOST_DEV__ ?? false`) by
 * the runtime. Replacing it in the inlined HTML catches both sides at once —
 * if either had been renamed separately, the runtime's host-dev branch would
 * have read `undefined` and silently taken the wrong path.
 */
function vitePluginSavannaRuntimeIds(): Plugin {
  return {
    name: "savanna-runtime-ids",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        // Global regex rather than `replaceAll`: this file is compiled with a
        // target older than ES2021, whose lib does not declare `replaceAll`.
        // Order does not matter — every token below is disjoint, so no
        // replacement can be clobbered by an earlier one.
        return html
          .replace(/__MANUS_HOST_DEV__/g, "__SAVANNA_HOST_DEV__")
          .replace(/data-manus-element-id/g, "data-savanna-element-id")
          .replace(/data-manus-selector-canvas/g, "data-savanna-selector-canvas")
          .replace(/data-manus-selector-input/g, "data-savanna-selector-input")
          .replace(/manus-previewer-content-root/g, "savanna-previewer-content-root")
          .replace(/manus-previewer-root/g, "savanna-previewer-root");
      },
    },
  };
}

/**
 * Hosts the dev server is allowed to answer on.
 *
 * Vite 6+ rejects requests whose `Host` header is not on this list, which is
 * what stops a public preview URL from being used as an open proxy. The
 * previous value hard-coded the Manus sandbox domains; those are irrelevant to
 * this deployment, and listing third-party hosts here means a takeover of that
 * domain is also a way in. Anything genuinely needed (a tunnel, a staging
 * preview) is opt-in through `VITE_ALLOWED_HOSTS`, comma-separated.
 *
 * Note this only affects `vite dev`; the production build never sees it.
 */
function devAllowedHosts(): string[] {
  const base = ["localhost", "127.0.0.1"];
  const extra = (process.env.VITE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);
  // `Array.from` rather than a spread: this file is compiled with a target
  // older than ES2015, where spreading a `Set` needs --downlevelIteration.
  return Array.from(new Set(base.concat(extra)));
}

// `PluginOption` rather than `Plugin[]`: `react()` and `tailwindcss()` each
// return arrays of plugins, so a flat `Plugin[]` does not describe the result.
function buildPlugins(mode: string): PluginOption[] {
  const isDev = mode === "development";
  return [
    react(),
    tailwindcss(),
    ...(isDev
      ? [
          jsxLocPlugin(),
          vitePluginManusRuntime({ scriptId: "savanna-runtime" }),
          vitePluginManusDebugCollector(),
          vitePluginSavannaRuntimeIds(),
        ]
      : []),
    vitePluginAnalyticsTag(),
    vitePluginStripDevAssets(),
  ];
}

/**
 * Splits node_modules into cache-friendly vendor chunks.
 *
 * IMPORTANT — no catch-all bucket. Everything that falls through these rules
 * returns `undefined` so Rollup places it automatically.
 *
 * There used to be a final `return "vendor"`, and it caused a production
 * outage. `manualChunks` assigns modules blindly: Rollup does NOT check for
 * cycles in hand-assigned chunks. The catch-all scooped up the transpiler
 * helper runtime (@oxc-project/runtime/src/helpers/*) plus assorted libraries,
 * producing this loop:
 *
 *   vendor-react -> vendor (helpers) -> vendor-query -> vendor-react
 *
 * @tanstack/react-query calls React.createContext at module scope, so when the
 * cycle made vendor-query evaluate first, React was still undefined and the app
 * died on the splash screen with:
 *   TypeError: Cannot read properties of undefined (reading 'createContext')
 *
 * Leaving unmatched modules to Rollup avoids this — its automatic chunking is
 * derived from the module graph and cannot produce a cycle.
 */
function manualChunks(id: string) {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("/@firebase/firestore") || id.includes("/firebase/firestore")) return "vendor-firestore";
  if (id.includes("/@firebase/auth") || id.includes("/firebase/auth")) return "vendor-firebase-auth";
  if (id.includes("/@firebase/storage") || id.includes("/firebase/storage")) return "vendor-firebase-storage";
  if (id.includes("/@firebase/app") || id.includes("/firebase/app") || id.includes("/@firebase/util") || id.includes("/@firebase/component") || id.includes("/@firebase/logger")) return "vendor-firebase-core";
  if (id.includes("/@firebase/") || id.includes("/firebase/")) return "vendor-firebase";
  if (id.includes("/@tanstack/")) return "vendor-query";
  if (id.includes("/motion/") || id.includes("/framer-motion/")) return "vendor-motion";
  if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "vendor-react";
  if (id.includes("/lucide-react/") || id.includes("/react-icons/")) return "vendor-icons";
  return undefined;
}

export default defineConfig(({ mode }) => ({
  plugins: buildPlugins(mode),
  resolve: {
    alias: resolveAliases,
  },
  envDir: PROJECT_ROOT,
  root: clientRoot,
  publicDir: clientPublicDir,
  build: {
    outDir: buildOutDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    host: true,
    allowedHosts: devAllowedHosts(),
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
}));
