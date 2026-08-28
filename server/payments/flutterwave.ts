type FlutterwaveVerificationInput = {
  transactionId: string;
  expectedReference: string;
  expectedCurrency: string;
  expectedTotalMinor: number;
};

type FlutterwaveVerification = {
  transactionId: string;
  successful: boolean;
};

export async function verifyFlutterwaveTransaction(input: FlutterwaveVerificationInput): Promise<FlutterwaveVerification> {
  const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secretKey) throw new Error("Flutterwave verification is not configured");
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(input.transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Flutterwave transaction verification failed");
  const payload = await response.json() as { data?: { id?: unknown; status?: unknown; tx_ref?: unknown; currency?: unknown; charged_amount?: unknown } };
  const transaction = payload.data;
  const chargedMinor = typeof transaction?.charged_amount === "number" ? Math.round(transaction.charged_amount * 100) : Number.NaN;
  const valid = transaction?.status === "successful" && transaction.tx_ref === input.expectedReference && transaction.currency === input.expectedCurrency && Number.isFinite(chargedMinor) && chargedMinor >= input.expectedTotalMinor;
  return { transactionId: typeof transaction?.id === "number" || typeof transaction?.id === "string" ? String(transaction.id) : input.transactionId, successful: valid };
}
