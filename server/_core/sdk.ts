import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { verifySupabaseAccessToken } from "./supabase";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * Claims carried by the local session cookie.
 *
 * This is NOT the Supabase token. The browser hands its Supabase access token
 * to `auth.signIn` once; the server verifies it and mints this short-lived,
 * HttpOnly cookie. Every later request is authenticated against the cookie, so
 * the Supabase token never has to be stored somewhere JavaScript can read it.
 */
export type SessionPayload = {
  openId: string;
  name: string;
  email?: string | null;
};

/** Default session lifetime. Short, because it is refreshed on activity. */
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

class SessionService {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret() {
    const secret =
      ENV.cookieSecret ||
      (ENV.isProduction ? "" : "savanna-local-development-secret");
    if (!secret) {
      throw new Error("JWT_SECRET is required for session cookies");
    }
    return new TextEncoder().encode(secret);
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? SESSION_TTL_MS;
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      name: payload.name,
      email: payload.email ?? null,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(Math.floor((issuedAt + expiresInMs) / 1000))
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<SessionPayload | null> {
    if (!cookieValue) return null;

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, name, email } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        name,
        email: typeof email === "string" ? email : null,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  /**
   * Verifies a Supabase access token, then mints a local session cookie.
   * Throws if the token is not a valid, unexpired, authenticated Supabase token.
   */
  async createSessionFromSupabaseToken(
    accessToken: string
  ): Promise<{ token: string; expiresInMs: number; openId: string; email: string | null }> {
    const claims = await verifySupabaseAccessToken(accessToken);
    if (!claims) {
      throw ForbiddenError("Invalid or expired credentials");
    }

    const { supabaseOpenId } = await import("./supabase");
    const openId = supabaseOpenId(claims.sub);
    const email =
      typeof claims.email === "string"
        ? claims.email
        : (claims.user_metadata?.email as string | undefined) ?? null;

    const existing = await db.getUserByOpenId(openId);
    const name =
      existing?.name ??
      (typeof claims.user_metadata?.name === "string"
        ? claims.user_metadata.name
        : null) ??
      (email ? email.split("@")[0] : "Savanna member");

    const token = await this.signSession({ openId, name, email });
    return { token, expiresInMs: SESSION_TTL_MS, openId, email };
  }

  /**
   * Resolves the caller from the session cookie, falling back to an
   * `Authorization: Bearer <session>` header for clients that cannot send
   * cookies (embedded webviews, Safari ITP).
   */
  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);

    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const signedInAt = new Date();
    let user = await db.getUserByOpenId(session.openId);

    // The cookie is signed with our own JWT secret and is only ever issued
    // after a Supabase token has been verified, so provisioning the row lazily
    // here cannot be used to create an account out of thin air.
    if (!user) {
      await db.upsertUser({
        openId: session.openId,
        name: session.name,
        email: session.email ?? null,
        loginMethod: "supabase",
        lastSignedIn: signedInAt,
      });
      user = await db.getUserByOpenId(session.openId);
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({ openId: user.openId, lastSignedIn: signedInAt });

    return user;
  }
}

export const sdk = new SessionService();
export { ONE_YEAR_MS };
