export type EnrollmentAccessState = "pending_payment" | "active" | "revoked" | "refunded" | null;
export type MerchantOrderStatus = "awaiting_payment" | "paid" | "accepted" | "preparing" | "ready" | "completed" | "cancelled" | "refunded";
export type StoryAudience = "public" | "connections" | "custom" | "private";

export function canAccessLesson(input: { isCreator: boolean; isPreview: boolean; enrollmentState: EnrollmentAccessState }) {
  return input.isCreator || input.isPreview || input.enrollmentState === "active";
}

export function canViewStory(input: { isAuthor: boolean; isAudienceMember: boolean; audience: StoryAudience }) {
  return input.isAuthor || input.audience === "public" || (input.audience === "custom" && input.isAudienceMember);
}

export function resolveReceiptStatus(input: { requestedStatus: "delivered" | "read"; recipientAllowsReadReceipts: boolean }) {
  return input.requestedStatus === "read" && input.recipientAllowsReadReceipts ? "read" as const : "delivered" as const;
}

export function canMerchantAdvanceOrder(status: MerchantOrderStatus) {
  return status === "paid" || status === "accepted" || status === "preparing" || status === "ready";
}

export type PaymentIntentState = "draft" | "awaiting_authorization" | "pending_provider" | "succeeded" | "failed" | "cancelled" | "expired";

export function canTransitionPaymentIntent(from: PaymentIntentState, to: PaymentIntentState) {
  if (from === to) return true;
  if (from === "draft") return to === "awaiting_authorization" || to === "cancelled";
  if (from === "awaiting_authorization") return to === "pending_provider" || to === "succeeded" || to === "failed" || to === "cancelled" || to === "expired";
  if (from === "pending_provider") return to === "succeeded" || to === "failed" || to === "cancelled" || to === "expired";
  return false;
}
