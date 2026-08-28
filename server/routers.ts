import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { upsertUser } from "./db";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accountRouter } from "./routers/account";
import { commerceRouter } from "./routers/commerce";
import { learningRouter } from "./routers/learning";
import { paymentsRouter } from "./routers/payments";
import { chatRouter, storiesRouter } from "./routers/social";

const localLoginInput = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
});

function localOpenIdForEmail(email: string) {
  const digest = createHash("sha256").update(email).digest("base64url").slice(0, 32);
  return `local_${digest}`;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure.input(localLoginInput).mutation(async ({ ctx, input }) => {
      if (ENV.isProduction && process.env.ENABLE_LOCAL_AUTH !== "true") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Local auth is disabled in production",
        });
      }

      const openId = localOpenIdForEmail(input.email);
      await upsertUser({
        openId,
        name: input.name,
        email: input.email,
        loginMethod: "local",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: input.name,
        email: input.email,
        expiresInMs: ONE_YEAR_MS,
      });
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: ONE_YEAR_MS,
      });

      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  account: accountRouter,
  chat: chatRouter,
  commerce: commerceRouter,
  learning: learningRouter,
  payments: paymentsRouter,
  stories: storiesRouter,
});

export type AppRouter = typeof appRouter;
