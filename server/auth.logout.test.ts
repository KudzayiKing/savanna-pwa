import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME, REFRESH_COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "supabase",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  // Signing out must clear BOTH cookies. Leaving the refresh token behind would
  // let anyone holding it mint a fresh Supabase session after logout.
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(2);
    expect(clearedCookies.map(cookie => cookie.name).sort()).toEqual(
      [COOKIE_NAME, REFRESH_COOKIE_NAME].sort()
    );

    for (const cookie of clearedCookies) {
      expect(cookie.options).toMatchObject({
        maxAge: -1,
        secure: true,
        // `lax`, never `none`: SameSite=None would let any third-party page
        // attach the session cookie to a cross-site request.
        sameSite: "lax",
        httpOnly: true,
        path: "/",
      });
    }
  });

  it("exposes signOut as the canonical alias with identical behaviour", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.signOut();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(2);
  });
});
