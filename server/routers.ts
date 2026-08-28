import { COOKIE_NAME, ONE_YEAR_MS, REFRESH_COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TrpcContext } from "./_core/context";
import { upsertUser } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import {
  type SupabaseSession,
  SupabaseAuthError,
  completePasswordReset,
  publicAuthMessage,
  refreshSession,
  revokeSession,
  sendPasswordResetEmail,
  signInWithPassword,
  signUpWithPassword,
} from "./_core/supabase";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { accountRouter } from "./routers/account";
import { commerceRouter } from "./routers/commerce";
import { learningRouter } from "./routers/learning";
import { paymentsRouter } from "./routers/payments";
import { chatRouter, storiesRouter } from "./routers/social";

const emailInput = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(320);

// 8 chars is Supabase's sane floor; 72 is the bcrypt input limit, beyond which
// extra characters are silently ignored.
const passwordInput = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

const nameInput = z.string().trim().min(2, "Enter your name").max(100);

type AuthContext = Pick<TrpcContext, "req" | "res">;

function readCookie(context: AuthContext, name: string): string | undefined {
  const header = context.req.headers.cookie;
  if (typeof header !== "string") return undefined;
  const target = `${name}=`;
  return header
    .split(";")
    .map(entry => entry.trim())
    .find(entry => entry.startsWith(target))
    ?.slice(target.length);
}

/**
 * Verifies the Supabase access token the browser just obtained, provisions the
 * local user row, and sets the HttpOnly session cookie.
 *
 * The Supabase tokens are never returned to the browser and never persisted in
 * localStorage — only the refresh token is kept, and only in an HttpOnly cookie.
 */
async function establishSession(context: AuthContext, session: SupabaseSession) {
  const local = await sdk.createSessionFromSupabaseToken(session.access_token);

  await upsertUser({
    openId: local.openId,
    name: local.email ? local.email.split("@")[0] : "Savanna member",
    email: local.email,
    loginMethod: "supabase",
    lastSignedIn: new Date(),
  });

  const cookieOptions = getSessionCookieOptions(context.req);
  context.res.cookie(COOKIE_NAME, local.token, {
    ...cookieOptions,
    maxAge: local.expiresInMs,
  });

  if (session.refresh_token) {
    context.res.cookie(REFRESH_COOKIE_NAME, session.refresh_token, {
      ...cookieOptions,
      maxAge: ONE_YEAR_MS,
    });
  }
}

function clearSession(context: AuthContext) {
  const cookieOptions = getSessionCookieOptions(context.req);
  context.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
  context.res.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
}

/**
 * Clears the local session and revokes it at Supabase, so a refresh token
 * cannot outlive the browser session that created it.
 */
async function signOutHandler(context: AuthContext) {
  const refreshToken = readCookie(context, REFRESH_COOKIE_NAME);
  clearSession(context);

  if (refreshToken) {
    try {
      // /logout requires a live access token, so rotate the refresh token
      // first. Failure here is not fatal — the local session is already gone.
      const refreshed = await refreshSession(refreshToken);
      await revokeSession(refreshed.access_token);
    } catch (error) {
      console.warn("[Auth] Supabase session revocation failed", error);
    }
  }

  return { success: true as const };
}

/**
 * Maps provider failures onto tRPC errors. Supabase's own wording and status
 * codes are never surfaced verbatim — see `publicAuthMessage`.
 */
function toTrpcError(error: unknown): TRPCError {
  if (error instanceof SupabaseAuthError) {
    const code =
      error.code === "invalid_credentials"
        ? "UNAUTHORIZED"
        : error.status === 401
          ? "UNAUTHORIZED"
          : "BAD_REQUEST";
    return new TRPCError({ code, message: publicAuthMessage(error) });
  }
  console.error("[Auth] Unexpected failure", error);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Authentication is temporarily unavailable. Please try again.",
  });
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    signUp: publicProcedure
      .input(z.object({ name: nameInput, email: emailInput, password: passwordInput }))
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await signUpWithPassword({
            email: input.email,
            password: input.password,
            name: input.name,
          });

          // With email confirmation enabled, GoTrue returns the user but no
          // session. The account exists; the user must click the link first.
          if ("needsConfirmation" in result) {
            return { needsEmailConfirmation: true as const };
          }

          await establishSession(ctx, result);
          return { needsEmailConfirmation: false as const };
        } catch (error) {
          throw toTrpcError(error);
        }
      }),

    signIn: publicProcedure
      .input(z.object({ email: emailInput, password: passwordInput }))
      .mutation(async ({ ctx, input }) => {
        try {
          const session = await signInWithPassword({
            email: input.email,
            password: input.password,
          });
          await establishSession(ctx, session);
          return { success: true as const };
        } catch (error) {
          throw toTrpcError(error);
        }
      }),

    requestPasswordReset: publicProcedure
      .input(z.object({ email: emailInput }))
      .mutation(async ({ input }) => {
        try {
          await sendPasswordResetEmail(input.email);
        } catch (error) {
          // Always report success. Telling the caller whether an address exists
          // turns this endpoint into an account-enumeration oracle.
          console.warn("[Auth] Password reset request failed", error);
        }
        return { success: true as const };
      }),

    completePasswordReset: publicProcedure
      .input(z.object({ tokenHash: z.string().min(10).max(500), password: passwordInput }))
      .mutation(async ({ input }) => {
        try {
          await completePasswordReset({
            tokenHash: input.tokenHash,
            password: input.password,
          });
          return { success: true as const };
        } catch (error) {
          throw toTrpcError(error);
        }
      }),

    /** `signOut` is the canonical name; `logout` is an alias kept for `useAuth`. */
    signOut: publicProcedure.mutation(({ ctx }) =>
      signOutHandler(ctx)
    ),
    logout: publicProcedure.mutation(({ ctx }) =>
      signOutHandler(ctx)
    ),
  }),

  account: accountRouter,
  chat: chatRouter,
  commerce: commerceRouter,
  learning: learningRouter,
  payments: paymentsRouter,
  stories: storiesRouter,
});

export type AppRouter = typeof appRouter;
