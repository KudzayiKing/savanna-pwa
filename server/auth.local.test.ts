import { COOKIE_NAME } from "@shared/const";
import { describe, expect, it } from "vitest";
import { createContext } from "./_core/context";
import { sdk } from "./_core/sdk";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createPublicContext(): { ctx: TrpcContext; cookies: CookieCall[] } {
  const cookies: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "http",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies.push({ name, value, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, cookies };
}

describe("auth.localLogin", () => {
  it("sets a regular session cookie for a local user", async () => {
    const { ctx, cookies } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.localLogin({
      name: "Local Tester",
      email: "LOCAL@SAVANNA.DEV",
    });

    expect(result).toEqual({ success: true });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe(COOKIE_NAME);
    expect(cookies[0]?.options).toMatchObject({
      maxAge: 1000 * 60 * 60 * 24 * 365,
      secure: false,
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    });

    const user = await sdk.authenticateRequest({
      headers: {
        cookie: `${COOKIE_NAME}=${cookies[0]?.value}`,
      },
    } as TrpcContext["req"]);

    expect(user.openId).toMatch(/^local_/);
    expect(user.name).toBe("Local Tester");
    expect(user.email).toBe("local@savanna.dev");
    expect(user.loginMethod).toBe("local");
  });

  it("keeps local users authenticated when device sessions are unavailable", async () => {
    const sessionToken = await sdk.createSessionToken("local_test", {
      name: "Local Tester",
      email: "local@savanna.dev",
    });

    const ctx = await createContext({
      req: {
        protocol: "http",
        headers: {
          cookie: `${COOKIE_NAME}=${sessionToken}`,
        },
      } as TrpcContext["req"],
      res: {
        cookie: () => {},
      } as unknown as TrpcContext["res"],
    });

    expect(ctx.user).toMatchObject({
      openId: "local_test",
      name: "Local Tester",
      email: "local@savanna.dev",
      loginMethod: "local",
    });
    expect(ctx.deviceSessionId).toBeUndefined();
  });
});
