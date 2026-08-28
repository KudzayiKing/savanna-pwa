export type PaymentPartner = {
  code: string;
  name: string;
  countryCode: string;
  currencyCode: string;
  rail: "mobile_money" | "hosted_checkout";
  liveConnected: boolean;
  requiresServerVerification: boolean;
  consentCopy: string;
};

const paymentPartners: PaymentPartner[] = [
  { code: "mpesa_daraja", name: "M-PESA", countryCode: "KE", currencyCode: "KES", rail: "mobile_money", liveConnected: false, requiresServerVerification: true, consentCopy: "Savanna will send the shown amount and recipient request to M-PESA only after you confirm." },
  { code: "mtn_momo", name: "MTN MoMo", countryCode: "GH", currencyCode: "GHS", rail: "mobile_money", liveConnected: false, requiresServerVerification: true, consentCopy: "Savanna will send the shown amount and recipient request to MTN MoMo only after you confirm." },
  { code: "airtel_money", name: "Airtel Money", countryCode: "UG", currencyCode: "UGX", rail: "mobile_money", liveConnected: false, requiresServerVerification: true, consentCopy: "Savanna will send the shown amount and recipient request to Airtel Money only after you confirm." },
  { code: "flutterwave_ke", name: "Flutterwave", countryCode: "KE", currencyCode: "KES", rail: "hosted_checkout", liveConnected: false, requiresServerVerification: true, consentCopy: "Savanna will open Flutterwave’s secure checkout for the shown amount only after you confirm." },
  { code: "flutterwave_gh", name: "Flutterwave", countryCode: "GH", currencyCode: "GHS", rail: "hosted_checkout", liveConnected: false, requiresServerVerification: true, consentCopy: "Savanna will open Flutterwave’s secure checkout for the shown amount only after you confirm." },
  { code: "flutterwave_ng", name: "Flutterwave", countryCode: "NG", currencyCode: "NGN", rail: "hosted_checkout", liveConnected: false, requiresServerVerification: true, consentCopy: "Savanna will open Flutterwave’s secure checkout for the shown amount only after you confirm." },
  { code: "flutterwave_ug", name: "Flutterwave", countryCode: "UG", currencyCode: "UGX", rail: "hosted_checkout", liveConnected: false, requiresServerVerification: true, consentCopy: "Savanna will open Flutterwave’s secure checkout for the shown amount only after you confirm." },
];

export function getPaymentPartners(countryCode?: string) {
  return countryCode ? paymentPartners.filter(partner => partner.countryCode === countryCode) : paymentPartners;
}

const countryNames: Record<string, string> = { GH: "Ghana", KE: "Kenya", NG: "Nigeria", UG: "Uganda" };

export function getPaymentCountries() {
  return Array.from(new Set(paymentPartners.map(partner => partner.countryCode))).sort().map(code => ({ code, name: countryNames[code] ?? code }));
}

export function getPaymentPartner(countryCode: string, providerCode: string) {
  return paymentPartners.find(partner => partner.countryCode === countryCode && partner.code === providerCode) ?? null;
}
