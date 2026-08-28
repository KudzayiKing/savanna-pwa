import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    deviceSessionId: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Savanna tRPC contracts", () => {
  it("exposes only configured country-specific payment partners publicly", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.payments.partners({ countryCode: "KE" })).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "mpesa_daraja", countryCode: "KE" }),
      expect.objectContaining({ code: "flutterwave_ke", countryCode: "KE", liveConnected: false }),
    ]));
  });

  it("requires an authenticated user before accessing private account data", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.account.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires authentication before a payment request or Story can be created", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.payments.createOrderIntent({ orderId: 1, countryCode: "KE", providerCode: "mpesa_daraja" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.stories.publishText({ textBody: "A private moment", audience: "private" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
