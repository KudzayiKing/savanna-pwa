import { z } from "zod";
import {
  blockAccount,
  createSafetyReport,
  ensureAccountProfile,
  getPublicProfile,
  listDeviceSessions,
  recordConsent,
  revokeDeviceSession,
  updateAccountPrivacy,
  updateAccountProfile,
  withdrawConsent,
} from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const profileInput = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(500).nullable().optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  profileVisibility: z.enum(["public", "connections", "private"]),
});

const privacyInput = z.object({
  phoneVisibility: z.enum(["nobody", "connections"]),
  handleDiscoverability: z.enum(["exact_match", "invite_only"]),
  storyAudienceDefault: z.enum(["connections", "custom", "private"]),
  readReceiptsEnabled: z.boolean(),
  lastSeenVisibility: z.enum(["nobody", "connections"]),
  courseProgressOptIn: z.boolean(),
});

export const accountRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const account = await ensureAccountProfile(ctx.user.id, ctx.user.name?.trim() || "Savanna member");
    const sessions = await listDeviceSessions(ctx.user.id);
    return { ...account, sessions, currentSessionId: ctx.deviceSessionId ?? null };
  }),
  profile: publicProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ ctx, input }) => getPublicProfile(ctx.user?.id ?? null, input.userId)),
  updateProfile: protectedProcedure.input(profileInput).mutation(async ({ ctx, input }) => updateAccountProfile(ctx.user.id, input)),
  updatePrivacy: protectedProcedure.input(privacyInput).mutation(async ({ ctx, input }) => updateAccountPrivacy(ctx.user.id, input)),
  grantConsent: protectedProcedure.input(z.object({ scope: z.enum(["payment_provider", "marketing", "course_progress", "analytics", "story_audience"]), policyVersion: z.string().trim().min(1).max(32) })).mutation(async ({ ctx, input }) => {
    await recordConsent(ctx.user.id, input.scope, input.policyVersion);
    return { success: true } as const;
  }),
  withdrawConsent: protectedProcedure.input(z.object({ scope: z.enum(["payment_provider", "marketing", "course_progress", "analytics", "story_audience"]) })).mutation(async ({ ctx, input }) => {
    await withdrawConsent(ctx.user.id, input.scope);
    return { success: true } as const;
  }),
  block: protectedProcedure.input(z.object({ userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await blockAccount(ctx.user.id, input.userId);
    return { success: true } as const;
  }),
  revokeSession: protectedProcedure.input(z.object({ sessionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await revokeDeviceSession(ctx.user.id, input.sessionId);
    return { success: true } as const;
  }),
  report: protectedProcedure.input(z.object({
    targetDomain: z.enum(["profile", "story", "storefront", "product", "course", "message", "payment"]),
    targetId: z.string().trim().min(1).max(96),
    reason: z.enum(["spam", "impersonation", "scam", "harassment", "unsafe_content", "other"]),
    detail: z.string().trim().max(1200).optional(),
    evidenceScope: z.enum(["none", "selected_item", "user_submitted"]),
  })).mutation(async ({ ctx, input }) => {
    await createSafetyReport({ reporterUserId: ctx.user.id, ...input });
    return { success: true } as const;
  }),
});
