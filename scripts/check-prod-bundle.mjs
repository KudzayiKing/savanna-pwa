#!/usr/bin/env node
/**
 * Guards the production server bundle against devDependency leakage.
 *
 * The server is bundled with esbuild, which hoists transitive external imports
 * to the top of the output. A single static import of a devDependency anywhere
 * in the server's import graph therefore becomes a hard startup dependency of
 * the production process — under `pnpm install --prod` the server dies with
 * `ERR_MODULE_NOT_FOUND` before it can serve a request.
 *
 * This script fails the build if `dist/index.js` statically imports anything
 * that is not a production dependency or a Node builtin.
 *
 * Run with: pnpm check:bundle   (expects `pnpm build` to have run first)
 */
import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Node builtins are always available, whether written as `fs` or `node:fs`.
const BUILTINS = new Set(builtinModules);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(projectRoot, "dist", "index.js");
const packageJsonPath = path.join(projectRoot, "package.json");

if (!fs.existsSync(bundlePath)) {
  console.error(
    `[check:bundle] ${bundlePath} not found. Run \`pnpm build\` before this check.`,
  );
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const productionDeps = new Set(Object.keys(pkg.dependencies ?? {}));
const devDeps = new Set(Object.keys(pkg.devDependencies ?? {}));

const source = fs.readFileSync(bundlePath, "utf8");

// Matches `from "x"` and bare `import "x"`. Deliberately does NOT match
// `import("x")`: dynamic imports are evaluated lazily, so they are safe.
const specifiers = new Set();
for (const match of source.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
  specifiers.add(match[1]);
}

function packageNameOf(specifier) {
  if (specifier.startsWith("node:")) return null;
  if (specifier.startsWith(".") || path.isAbsolute(specifier)) return null;
  if (BUILTINS.has(specifier)) return null;
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

const offenders = [];
for (const specifier of specifiers) {
  const name = packageNameOf(specifier);
  if (!name) continue;
  if (productionDeps.has(name)) continue;
  if (devDeps.has(name)) {
    offenders.push(`  ${specifier}  (declared in devDependencies)`);
  } else {
    offenders.push(`  ${specifier}  (not declared in dependencies at all)`);
  }
}

if (offenders.length > 0) {
  console.error(
    [
      "[check:bundle] FAIL — the production server bundle imports non-production packages.",
      "",
      "These are statically imported by dist/index.js and will be required at startup.",
      "With `pnpm install --prod` the server will crash with ERR_MODULE_NOT_FOUND.",
      "",
      ...offenders,
      "",
      "Fix: remove the static import edge from server/_core/index.ts, or move the",
      "package into `dependencies`. See docs/PRODUCTION_READINESS_PLAN.md (P0-1).",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `[check:bundle] OK — ${specifiers.size} external specifiers, all production dependencies.`,
);
