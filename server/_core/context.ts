import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "../../drizzle/schema";
import { resolveDeviceSession } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  deviceSessionId?: number;
};

const DEVICE_COOKIE_NAME = "savanna-device";

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return undefined;
  const target = `${name}=`;
  return cookieHeader.split(";").map(entry => entry.trim()).find(entry => entry.startsWith(target))?.slice(target.length);
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  let deviceSessionId: number | undefined;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user) {
    try {
      const existingToken = readCookie(opts.req.headers.cookie, DEVICE_COOKIE_NAME);
      const deviceToken = existingToken || randomBytes(32).toString("base64url");
      const fingerprint = createHash("sha256").update(deviceToken).digest("hex");
      const label = String(opts.req.headers["user-agent"] ?? "Savanna web session").slice(0, 140);
      const device = await resolveDeviceSession(user.id, fingerprint, label);
      deviceSessionId = device.sessionId;
      if (device.revoked) {
        user = null;
      } else if (!existingToken) {
        opts.res.cookie(DEVICE_COOKIE_NAME, deviceToken, { ...getSessionCookieOptions(opts.req), maxAge: 1000 * 60 * 60 * 24 * 90 });
      }
    } catch (error) {
      console.warn("[Auth] Device session tracking skipped", String(error));
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    deviceSessionId,
  };
}
