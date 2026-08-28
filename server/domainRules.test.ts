import { describe, expect, it } from "vitest";
import { canAccessLesson, canMerchantAdvanceOrder, canTransitionPaymentIntent, canViewStory, resolveReceiptStatus } from "../shared/domainRules";

describe("Savanna domain access rules", () => {
  it("keeps paid course lessons gated until an enrollment is active", () => {
    expect(canAccessLesson({ isCreator: false, isPreview: false, enrollmentState: "pending_payment" })).toBe(false);
    expect(canAccessLesson({ isCreator: false, isPreview: false, enrollmentState: "active" })).toBe(true);
  });

  it("does not expose non-public Stories outside the author", () => {
    expect(canViewStory({ isAuthor: false, isAudienceMember: false, audience: "custom" })).toBe(false);
    expect(canViewStory({ isAuthor: false, isAudienceMember: true, audience: "custom" })).toBe(true);
    expect(canViewStory({ isAuthor: true, isAudienceMember: false, audience: "private" })).toBe(true);
  });

  it("preserves the recipient’s read-receipt choice", () => {
    expect(resolveReceiptStatus({ requestedStatus: "read", recipientAllowsReadReceipts: false })).toBe("delivered");
  });

  it("prevents merchant status changes before payment confirmation", () => {
    expect(canMerchantAdvanceOrder("awaiting_payment")).toBe(false);
    expect(canMerchantAdvanceOrder("paid")).toBe(true);
  });

  it("allows only non-terminal payment transitions after a provider event", () => {
    expect(canTransitionPaymentIntent("awaiting_authorization", "succeeded")).toBe(true);
    expect(canTransitionPaymentIntent("succeeded", "failed")).toBe(false);
  });
});
