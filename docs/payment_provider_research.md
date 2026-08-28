# Payment Provider Research Notes

## Official sources reviewed on 27 August 2026

Safaricom’s **Daraja 3.0** developer portal states that it provides access to Safaricom and M-PESA APIs to bridge payment integration into web and mobile applications. The portal offers account registration and a sandbox testing experience. This validates treating M-PESA as a dedicated country/payment-rail adapter rather than a generic card-processing abstraction.

MTN MoMo’s official developer documentation indicates that payment callbacks require a callback URL in the `X-Callback-Url` request header and that the callback domain must match the domain registered for the API user. This validates an inbound payment-notification architecture with provider-specific verification, idempotency, and reconciliation controls.

## Architectural conclusion

Savanna should implement a **Payment Provider Adapter** contract rather than code individual mobile-money flows throughout the order and course systems. A provider adapter owns payment-intent creation, customer authorization/prompt initiation, status retrieval, webhook/callback verification, refund capability declaration, and settlement metadata. Savanna’s order and enrollment systems consume normalized payment states only after a verified provider update.

## Source references

[1] Safaricom. *Daraja Developer Portal*. https://developer.safaricom.co.ke/ (accessed 2026-08-27)

[2] MTN MoMo. *Callback — Developer Portal*. https://momodeveloper.mtn.com/api-documentation/callback (accessed 2026-08-27)
