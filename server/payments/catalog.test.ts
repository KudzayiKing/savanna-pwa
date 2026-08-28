import { describe, expect, it } from "vitest";
import { getPaymentPartner, getPaymentPartners } from "./catalog";

describe("Savanna payment partner catalog", () => {
  it("returns only the country-specific payment rail for a supported market", () => {
    const kenyaPartners = getPaymentPartners("KE");

    expect(kenyaPartners).toHaveLength(2);
    expect(kenyaPartners[0]).toMatchObject({ code: "mpesa_daraja", countryCode: "KE", currencyCode: "KES" });
    expect(kenyaPartners).toEqual(expect.arrayContaining([expect.objectContaining({ code: "flutterwave_ke", rail: "hosted_checkout", requiresServerVerification: true })]));
  });

  it("does not return a partner code outside its configured country", () => {
    expect(getPaymentPartner("GH", "mpesa_daraja")).toBeNull();
    expect(getPaymentPartner("KE", "mtn_momo")).toBeNull();
    expect(getPaymentPartner("NG", "flutterwave_ng")).toMatchObject({ currencyCode: "NGN", liveConnected: false });
  });

  it("keeps every provider disabled for live transaction initiation until credentials and callback verification are configured", () => {
    expect(getPaymentPartners().every(partner => partner.liveConnected === false)).toBe(true);
  });
});
