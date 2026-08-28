import { describe, expect, it } from "vitest";
import { canAccessLesson, canMerchantAdvanceOrder, canViewStory, resolveReceiptStatus } from "./domainRules";

describe("Savanna domain access rules", () => {
  it("keeps paid course lessons gated until an enrollment is active", () => {
    expect(canAccessLesson({ isCreator: false, isPreview: false, enrollmentState: "pending_payment" })).toBe(false);
    expect(canAccessLesson({ isCreator: false, isPreview: false, enrollmentState: "active" })).toBe(true);
    expect(canAccessLesson({ isCreator: true, isPreview: false, enrollmentState: null })).toBe(true);
  });

  it("does not expose private, custom, or connections-only Stories outside the author", () => {
    expect(canViewStory({ isAuthor: false, audience: "public" })).toBe(true);
    expect(canViewStory({ isAuthor: false, audience: "connections" })).toBe(false);
    expect(canViewStory({ isAuthor: true, audience: "private" })).toBe(true);
  });

  it("downgrades a read receipt when the recipient disables read receipts", () => {
    expect(resolveReceiptStatus({ requestedStatus: "read", recipientAllowsReadReceipts: false })).toBe("delivered");
    expect(resolveReceiptStatus({ requestedStatus: "read", recipientAllowsReadReceipts: true })).toBe("read");
  });

  it("prevents a merchant from advancing an order before payment confirmation", () => {
    expect(canMerchantAdvanceOrder("awaiting_payment")).toBe(false);
    expect(canMerchantAdvanceOrder("paid")).toBe(true);
    expect(canMerchantAdvanceOrder("completed")).toBe(false);
  });
});
