#!/usr/bin/env node
/**
 * Fails the build if the emitted client chunks import each other in a cycle.
 *
 * Why this exists: `manualChunks` in vite.config.ts assigns modules to chunks
 * by string matching on the module path, and Rollup does NOT check the result
 * for cycles. A hand-assigned cycle is emitted without so much as a warning,
 * and it is invisible in dev because dev has no chunking at all — so the app
 * works locally and dies in production.
 *
 * At runtime one side of an ES module cycle is evaluated before the other
 * side's bindings are initialised. The entry chunk then throws during module
 * evaluation, `createRoot` never runs, `#root` stays empty, and index.html
 * shows the "Refresh Savanna" boot fallback. Twice now a cycle has shipped
 * this way (once via a `vendor` catch-all, once via `idb`).
 *
 * Only *static* edges are checked. Dynamic `import()` is resolved lazily, so a
 * cycle through it is not a boot hazard.
 *
 * Run with: node scripts/check-chunk-cycles.mjs   (expects `vite build` first)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(projectRoot, "dist", "public", "assets");

if (!fs.existsSync(assetsDir)) {
  console.error(
    `[check:chunks] ${assetsDir} not found. Run \`vite build\` before this check.`,
  );
  process.exit(1);
}

const chunks = fs
  .readdirSync(assetsDir)
  .filter(name => name.endsWith(".js"))
  .sort();

/**
 * Static relative imports as they appear in Rollup's minified ESM output:
 *   import{a as b}from"./chunk.js"   ->  }from"./chunk.js"
 *   export{a}from"./chunk.js"        ->  }from"./chunk.js"
 *   import"./chunk.js"               ->  ;import"./chunk.js"
 *
 * Deliberately not matched: `import("./chunk.js")`, which is dynamic and safe.
 */
const STATIC_EDGE =
  /(?:}|[\w$*])\s*from\s*["']\.\/([^"']+)["']|(?:^|;)\s*import\s*["']\.\/([^"']+)["']/g;

/** filename -> Set<filename> */
const graph = new Map();

for (const chunk of chunks) {
  const source = fs.readFileSync(path.join(assetsDir, chunk), "utf8");
  const deps = new Set();
  for (const match of source.matchAll(STATIC_EDGE)) {
    const target = match[1] ?? match[2];
    if (target && target !== chunk && chunks.includes(target)) deps.add(target);
  }
  graph.set(chunk, deps);
}

/**
 * Iterative DFS with the classic white/grey/black colouring: a back edge into
 * a grey node is a cycle. Iterative rather than recursive because a deep chunk
 * graph would otherwise risk a stack overflow for no benefit.
 */
function findCycle() {
  const state = new Map(); // filename -> "open" | "done"
  const parent = new Map();

  for (const root of graph.keys()) {
    if (state.get(root) === "done") continue;

    const stack = [{ node: root, deps: [...graph.get(root)] }];
    state.set(root, "open");

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.deps.length === 0) {
        state.set(frame.node, "done");
        stack.pop();
        continue;
      }

      const next = frame.deps.shift();
      const colour = state.get(next);

      if (colour === "done") continue;

      if (colour === "open") {
        // Walk parents back to the node we re-entered.
        const cycle = [next];
        let cursor = frame.node;
        while (cursor !== next) {
          cycle.push(cursor);
          cursor = parent.get(cursor);
          if (cursor === undefined) break;
        }
        cycle.push(next);
        return cycle.reverse();
      }

      parent.set(next, frame.node);
      state.set(next, "open");
      stack.push({ node: next, deps: [...graph.get(next)] });
    }
  }

  return null;
}

const cycle = findCycle();

if (cycle) {
  console.error(
    [
      "[check:chunks] FAIL — the production chunks import each other in a cycle.",
      "",
      `  ${cycle.join("\n    -> ")}`,
      "",
      "A cycle between hand-assigned `manualChunks` groups is emitted silently by",
      "Rollup and only breaks in production: one side evaluates before the other's",
      "bindings are initialised, the entry chunk throws before `createRoot`, and the",
      "app never leaves the splash screen (index.html then shows \"Refresh Savanna\").",
      "",
      "Fix: in vite.config.ts, move the shared module into the chunk that the other",
      "chunks already depend on (the base of the group), rather than letting Rollup",
      "place it automatically.",
    ].join("\n"),
  );
  process.exit(1);
}

const edges = [...graph.values()].reduce((total, deps) => total + deps.size, 0);
console.log(
  `[check:chunks] OK — ${chunks.length} chunks, ${edges} static edges, no cycles.`,
);
