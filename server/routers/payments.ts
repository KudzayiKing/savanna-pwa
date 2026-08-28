import { z } from "zod";
import { createEnrollmentPaymentIntent, createOrderPaymentIntent, getEnrollmentPaymentQuote, getOrderPaymentQuote, getPaymentIntentForUser, listPaymentIntentsForUser } from "../db";
import { getPaymentCountries, getPaymentPartner, getPaymentPartners } from "../payments/catalog";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

const paymentSelection = z.object({ countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), providerCode: z.string().trim().min(2).max(64) });

export const paymentsRouter = router({
  partners: publicProcedure.input(z.object({ countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional() }).optional()).query(({ input }) => getPaymentPartners(input?.countryCode)),
  countries: publicProcedure.query(() => getPaymentCountries()),
  quoteOrder: protectedProcedure.input(paymentSelection.extend({ orderId: z.number().int().positive() })).query(({ ctx, input }) => {
    if (!getPaymentPartner(input.countryCode, input.providerCode)) throw new Error("This payment partner is not available for the selected country");
    return getOrderPaymentQuote(ctx.user.id, input);
  }),
  quoteEnrollment: protectedProcedure.input(paymentSelection.extend({ enrollmentId: z.number().int().positive() })).query(({ ctx, input }) => {
    if (!getPaymentPartner(input.countryCode, input.providerCode)) throw new Error("This payment partner is not available for the selected country");
    return getEnrollmentPaymentQuote(ctx.user.id, input);
  }),
  createOrderIntent: protectedProcedure.input(paymentSelection.extend({ orderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const partner = getPaymentPartner(input.countryCode, input.providerCode);
    if (!partner) throw new Error("This payment partner is not available for the selected country");
    const intent = await createOrderPaymentIntent(ctx.user.id, input);
    return { intent, partner };
  }),
  createEnrollmentIntent: protectedProcedure.input(paymentSelection.extend({ enrollmentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const partner = getPaymentPartner(input.countryCode, input.providerCode);
    if (!partner) throw new Error("This payment partner is not available for the selected country");
    const intent = await createEnrollmentPaymentIntent(ctx.user.id, input);
    return { intent, partner };
  }),
  mine: protectedProcedure.query(({ ctx }) => listPaymentIntentsForUser(ctx.user.id)),
  detail: protectedProcedure.input(z.object({ paymentIntentId: z.number().int().positive() })).query(({ ctx, input }) => getPaymentIntentForUser(ctx.user.id, input.paymentIntentId)),
});
