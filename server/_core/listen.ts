import { type Server } from "http";
import net from "net";

function probeFamily(port: number, host: string): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * A port counts as available only when it is free on **both** address families.
 *
 * Node's bare `server.listen(port)` binds `::`, and on macOS that can succeed
 * even while another process already owns `0.0.0.0:<port>`, because the two
 * binds land in different families. The result is a split brain: IPv4 clients
 * reach the other app, IPv6 clients reach this one, and `localhost` resolves to
 * whichever the browser tries first — so the app looks like it randomly fails
 * to load. Probing both families explicitly avoids that.
 */
async function isPortAvailable(port: number): Promise<boolean> {
  if (!(await probeFamily(port, "0.0.0.0"))) return false;
  return probeFamily(port, "::");
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function startListening(server: Server): Promise<void> {
  const preferredPort = parseInt(process.env.PORT || "3000");
  const host = process.env.HOST?.trim() || undefined;
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  await new Promise<void>(resolve => {
    server.listen({ port, host }, () => {
      console.log(`Server running on http://${host || "localhost"}:${port}/`);
      resolve();
    });
  });
}
