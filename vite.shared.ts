import path from "node:path";

/**
 * Path constants shared by the Vite client build (`vite.config.ts`) and the
 * Express dev-server integration (`server/_core/vite.ts`).
 *
 * This module MUST NOT import `vite` or any other devDependency.
 *
 * The server is bundled for production with esbuild. Any static `vite` import
 * anywhere in the server's import graph is hoisted to the top of the bundle,
 * which makes the whole Vite toolchain a hard startup dependency of the
 * production process. Under a production-only install (`--omit=dev`) the server
 * then dies immediately with `ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`.
 * Keeping the shared configuration free of `vite` is what prevents that.
 */
export const projectRoot = path.resolve(import.meta.dirname);
export const clientRoot = path.resolve(projectRoot, "client");
export const clientPublicDir = path.resolve(projectRoot, "client", "public");
export const buildOutDir = path.resolve(projectRoot, "dist", "public");

export const resolveAliases = {
  "@": path.resolve(projectRoot, "client", "src"),
  "@shared": path.resolve(projectRoot, "shared"),
  "@assets": path.resolve(projectRoot, "attached_assets"),
};
