# Flutterwave adapter requirements

Flutterwave’s official documentation describes webhooks as the mechanism for asynchronous payment updates, including mobile-money flows. Its webhook payload includes an event identifier, event type, timestamp, and a `data` object with a transaction identifier, status, and reference. The provider signs the raw request body with HMAC-SHA256 using a dashboard-configured secret hash and returns that signature in the `flutterwave-signature` header. Savanna must verify the signature before processing any event and must return `200` to acknowledge a valid receipt. [1]

Flutterwave also directs integrators to verify a completed charge server-side before granting value. The verification must confirm that the generated transaction reference matches, the final status is successful, the currency matches the expected currency, and the paid amount is sufficient. The transaction ID from the webhook’s `data.id` is used for the verification request. [2]

Savanna’s Flutterwave adapter must therefore remain disabled until a user configures a Flutterwave secret key, an encrypted webhook secret hash, a callback URL in the Flutterwave dashboard, and an approved country/currency/payment-method matrix. A validated webhook alone is not sufficient to unlock an order or course enrollment; server-side verification must reconcile the provider response to the expected intent reference, amount, currency, and recipient before Savanna transitions the intent to `succeeded` and issues a receipt.

## References

[1]: https://developer.flutterwave.com/docs/webhooks "Flutterwave Documentation — Webhooks"
[2]: https://developer.flutterwave.com/v3.0/docs/transaction-verification "Flutterwave Documentation — Transaction Verification"
