import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

/**
 * Shown to the client in place of an unexpected server fault.
 *
 * Internal errors routinely carry table names, column names, connection
 * strings and file paths. Returning them verbatim hands an attacker a map of
 * the schema for free. The real message is logged server-side and never
 * crosses the wire.
 */
export const INTERNAL_ERROR_MESSAGE =
  "Something went wrong on our end. Please try again.";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Everything except INTERNAL_SERVER_ERROR is a deliberate, intentional
    // result from a procedure (validation, authz, not-found) and is safe — and
    // useful — to surface. Only unexpected faults are redacted.
    const isInternal = shape.data.code === "INTERNAL_SERVER_ERROR";

    if (isInternal) {
      console.error("[tRPC] internal error", error.cause ?? error);
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        message: isInternal ? INTERNAL_ERROR_MESSAGE : error.message,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
