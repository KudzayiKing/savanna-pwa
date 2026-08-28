import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app";
import { startListening } from "./listen";
import { serveStatic } from "./static";

/**
 * PRODUCTION entry point.
 *
 * This is the file bundled by `pnpm build`. It must never import the Vite dev
 * server (`./vite`) — statically or dynamically. `vite` is a devDependency, and
 * esbuild hoists transitive external imports to the top of the bundle, so a
 * single static edge to it makes the whole Vite toolchain a startup dependency
 * of the production server. Under a production-only install the process dies
 * with `ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`.
 *
 * The dev entry point that does use Vite is `server/_core/dev.ts`.
 */
async function startServer() {
  const app = await createApp();
  serveStatic(app);
  const server = createServer(app);
  await startListening(server);
}

startServer().catch(console.error);
