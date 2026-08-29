import { z } from "zod";
import {
  createConversation,
  listConversationMessages,
  listConversationsForUser,
  listStoriesForUser,
  publishMediaStory,
  publishTextStory,
  reactToStory,
  recordMessageDelivery,
  recordStoryView,
  replyToStory,
  getMessageAttachmentDownloadUrl,
  sendMessageAttachment,
  sendConversationMessage,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const chatRouter = router({
  list: protectedProcedure.query(({ ctx }) => listConversationsForUser(ctx.user.id)),
  create: protectedProcedure.input(z.object({
    kind: z.enum(["direct", "group", "merchant_support"]),
    title: z.string().trim().max(160).optional(),
    memberIds: z.array(z.number().int().positive()).min(1).max(100),
  })).mutation(({ ctx, input }) => createConversation({ createdByUserId: ctx.user.id, ...input })),
  messages: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(({ ctx, input }) => listConversationMessages(ctx.user.id, input.conversationId)),
  send: protectedProcedure.input(z.object({ conversationId: z.number().int().positive(), clientMessageId: z.string().uuid(), payload: z.string().trim().min(1).max(4000) })).mutation(({ ctx, input }) => sendConversationMessage({ userId: ctx.user.id, ...input })),
  sendAttachment: protectedProcedure.input(z.object({
    conversationId: z.number().int().positive(),
    clientMessageId: z.string().uuid(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/mpeg", "video/mp4"]),
    base64Data: z.string().min(1).max(11_200_000),
    byteSize: z.number().int().positive().max(8 * 1024 * 1024),
  })).mutation(({ ctx, input }) => sendMessageAttachment({ userId: ctx.user.id, ...input })),
  attachmentUrl: protectedProcedure.input(z.object({ attachmentId: z.number().int().positive() })).query(({ ctx, input }) => getMessageAttachmentDownloadUrl(ctx.user.id, input.attachmentId)),
  acknowledge: protectedProcedure.input(z.object({ messageId: z.number().int().positive(), status: z.enum(["delivered", "read"]) })).mutation(async ({ ctx, input }) => {
    await recordMessageDelivery(ctx.user.id, input.messageId, input.status);
    return { success: true } as const;
  }),
});

export const storiesRouter = router({
  list: protectedProcedure.query(({ ctx }) => listStoriesForUser(ctx.user.id)),
  publishText: protectedProcedure.input(z.object({
    textBody: z.string().trim().min(1).max(700),
    audience: z.enum(["public", "custom", "private"]),
    customAudienceUserIds: z.array(z.number().int().positive()).max(100).optional(),
    saveToMemories: z.boolean().optional(),
    storefrontId: z.number().int().positive().nullable().optional(),
    productName: z.string().trim().max(160).nullable().optional(),
    productDescription: z.string().trim().max(280).nullable().optional(),
    productPriceMinor: z.number().int().min(1).nullable().optional(),
    productCurrencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
  })).mutation(({ ctx, input }) => publishTextStory({ authorUserId: ctx.user.id, ...input })),
  publishMedia: protectedProcedure.input(z.object({
    textBody: z.string().trim().max(700).optional(),
    audience: z.enum(["public", "custom", "private"]),
    customAudienceUserIds: z.array(z.number().int().positive()).max(100).optional(),
    saveToMemories: z.boolean().optional(),
    storefrontId: z.number().int().positive().nullable().optional(),
    productName: z.string().trim().max(160).nullable().optional(),
    productDescription: z.string().trim().max(280).nullable().optional(),
    productPriceMinor: z.number().int().min(1).nullable().optional(),
    productCurrencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
    base64Data: z.string().min(1).max(28_000_000),
    byteSize: z.number().int().positive().max(20 * 1024 * 1024),
  })).mutation(({ ctx, input }) => publishMediaStory({ authorUserId: ctx.user.id, ...input })),
  view: protectedProcedure.input(z.object({ storyId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await recordStoryView(ctx.user.id, input.storyId);
    return { success: true } as const;
  }),
  react: protectedProcedure.input(z.object({ storyId: z.number().int().positive(), emoji: z.string().trim().min(1).max(16) })).mutation(async ({ ctx, input }) => {
    await reactToStory(ctx.user.id, input.storyId, input.emoji);
    return { success: true } as const;
  }),
  reply: protectedProcedure.input(z.object({ storyId: z.number().int().positive(), payload: z.string().trim().min(1).max(1000) })).mutation(({ ctx, input }) => replyToStory(ctx.user.id, input.storyId, input.payload)),
});
