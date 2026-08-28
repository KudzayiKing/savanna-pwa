import { z } from "zod";
import { pingDatabase } from "../db";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(async () => {
      // Previously this returned a hard-coded `{ ok: true }`, which told an
      // operator nothing: it stays green while the database is unreachable and
      // every write is failing. It now actually queries.
      //
      // It reports failure rather than throwing, so a database blip surfaces as
      // `ok: false` the client can render instead of a tRPC error the user has
      // to decode. Infrastructure that needs a real status code should poll
      // /readyz instead.
      let database: "up" | "down" = "down";
      let latencyMs = 0;

      try {
        latencyMs = await pingDatabase();
        database = "up";
      } catch (error) {
        console.error("[Health] database probe failed:", error);
      }

      return {
        ok: database === "up",
        database,
        latencyMs,
        checkedAt: new Date().toISOString(),
      };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
