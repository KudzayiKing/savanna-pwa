import { z } from "zod";
import {
  createMerchantSupportConversation,
  createOrder,
  createProduct,
  createStorefront,
  getMyStorefront,
  getStorefrontBySlug,
  listOrdersForMerchant,
  listOrdersForUser,
  listPublicProductMemories,
  listPublicProducts,
  listPublicStorefronts,
  reviewStorefrontVerification,
  saveMerchantSettlementProfile,
  submitStorefrontVerification,
  updateMerchantOrderStatus,
  updateStorefront,
  uploadProductMedia,
  uploadStorefrontCover,
} from "../db";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getPaymentPartner } from "../payments/catalog";

const storefrontInput = z.object({
  name: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(700).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  contactEmail: z.string().trim().email().max(320).nullable().optional(),
  visibility: z.enum(["draft", "public", "paused"]),
});

const productInput = z.object({
  storefrontId: z.number().int().positive(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1800).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  priceMinor: z.number().int().min(1),
  inventoryQuantity: z.number().int().min(0).nullable().optional(),
  status: z.enum(["draft", "active", "archived", "sold_out"]),
});

const uploadInput = z.object({
  fileName: z.string().trim().min(1).max(160),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
  base64Data: z.string().min(1),
  byteSize: z.number().int().positive().max(20 * 1024 * 1024),
});

export const commerceRouter = router({
  storefronts: router({
    list: publicProcedure.input(z.object({ query: z.string().trim().max(120).optional() }).optional()).query(({ ctx, input }) => listPublicStorefronts(input?.query, ctx.user?.id ?? null)),
    products: publicProcedure.input(z.object({ query: z.string().trim().max(120).optional() }).optional()).query(({ ctx, input }) => listPublicProducts(input?.query, ctx.user?.id ?? null)),
    memories: publicProcedure.input(z.object({ query: z.string().trim().max(120).optional() }).optional()).query(({ ctx, input }) => listPublicProductMemories(input?.query, ctx.user?.id ?? null)),
    detail: publicProcedure.input(z.object({ slug: z.string().trim().min(1).max(80) })).query(({ ctx, input }) => getStorefrontBySlug(ctx.user?.id ?? null, input.slug)),
    mine: protectedProcedure.query(({ ctx }) => getMyStorefront(ctx.user.id)),
    create: protectedProcedure.input(storefrontInput).mutation(({ ctx, input }) => createStorefront(ctx.user.id, input)),
    update: protectedProcedure.input(storefrontInput.extend({ storefrontId: z.number().int().positive() })).mutation(({ ctx, input }) => {
      const { storefrontId, ...values } = input;
      return updateStorefront(ctx.user.id, storefrontId, values);
    }),
    createProduct: protectedProcedure.input(productInput).mutation(({ ctx, input }) => {
      const { storefrontId, ...values } = input;
      return createProduct(ctx.user.id, storefrontId, values);
    }),
    uploadCover: protectedProcedure.input(uploadInput.omit({ mimeType: true }).extend({ storefrontId: z.number().int().positive(), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) })).mutation(({ ctx, input }) => uploadStorefrontCover(ctx.user.id, input)),
    uploadProductMedia: protectedProcedure.input(uploadInput.extend({ productId: z.number().int().positive() })).mutation(({ ctx, input }) => uploadProductMedia(ctx.user.id, input)),
    saveSettlement: protectedProcedure.input(z.object({ storefrontId: z.number().int().positive(), countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), providerCode: z.string().trim().min(2).max(64), recipientAlias: z.string().trim().min(2).max(180), recipientReference: z.string().trim().min(2).max(180) })).mutation(({ ctx, input }) => {
      if (!getPaymentPartner(input.countryCode, input.providerCode)) throw new Error("This settlement partner is not available for the selected country");
      return saveMerchantSettlementProfile(ctx.user.id, input);
    }),
    submitVerification: protectedProcedure.input(z.object({ storefrontId: z.number().int().positive() })).mutation(({ ctx, input }) => submitStorefrontVerification(ctx.user.id, input.storefrontId)),
    reviewVerification: adminProcedure.input(z.object({ storefrontId: z.number().int().positive(), decision: z.enum(["verified", "rejected"]), note: z.string().trim().max(500).optional() })).mutation(({ ctx, input }) => reviewStorefrontVerification(ctx.user.id, input.storefrontId, input.decision, input.note)),
    supportConversation: protectedProcedure.input(z.object({ storefrontId: z.number().int().positive() })).mutation(({ ctx, input }) => createMerchantSupportConversation(ctx.user.id, input.storefrontId)),
  }),
  orders: router({
    mine: protectedProcedure.query(({ ctx }) => listOrdersForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(50) })).min(1).max(20), buyerNote: z.string().trim().max(800).optional() })).mutation(({ ctx, input }) => createOrder(ctx.user.id, input.items, input.buyerNote)),
    merchantList: protectedProcedure.input(z.object({ storefrontId: z.number().int().positive() })).query(({ ctx, input }) => listOrdersForMerchant(ctx.user.id, input.storefrontId)),
    updateStatus: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), status: z.enum(["accepted", "preparing", "ready", "completed", "cancelled"]), note: z.string().trim().max(500).optional() })).mutation(({ ctx, input }) => updateMerchantOrderStatus(ctx.user.id, input.orderId, input.status, input.note)),
  }),
});
