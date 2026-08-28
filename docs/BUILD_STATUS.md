# Savanna Build Status

## Delivered foundation

Savanna is implemented as a **desktop-first, responsive Progressive Web App** using React, TypeScript, Tailwind, an Express + tRPC backend, Drizzle, and a relational database. The application includes a web manifest, install guidance, a service-worker cache shell, offline status messaging, an accessible persisted light-dark mode control, and a checkout guard that blocks new payment requests while the browser is offline. The shared header renders **SAVANNA** in Monoton: solid black in light mode and solid white in dark mode. Amber is reserved for interface accents.

## Product modules

| Module | Implemented behavior |
|---|---|
| Account and privacy | Editable profiles; privacy preferences; device-session list and revocation; blocking and evidence-scoped reports. |
| Messaging | Protected direct, group, and merchant-support conversation records; text messages; client-side conversation search; private media attachment upload; sent/delivered/read lifecycle APIs. |
| Stories | Time-limited text Stories, custom-audience membership records, viewer and reaction records, reporting controls, author/public/custom visibility rules, and a home-surface Stories rail that enlarges on pull and compacts as the page scrolls. |
| Shops | Instagram-style storefront profile, merchant verification submission/review states, contact actions, catalog grid, dedicated product-detail pages, transparent pricing, product order entry, and merchant onboarding. |
| Learning | Course discovery, creator course/module/lesson authoring, private MP4 lesson upload, enrollment gating, authorized lesson URLs, and opt-in progress persistence. |
| Orders | Buyer order history, merchant order views, lifecycle updates after payment confirmation, and merchant-support conversation entry points. |
| Payments | Country/provider catalog, encrypted merchant settlement submission, pre-consent quote, consented payment-intent creation, receipt schema, guarded callback endpoint, verified reconciliation function, and payer-facing payment-status/receipt screens. |

## Privacy and access boundaries

Private chat attachments are stored under non-public storage keys and are retrieved only through short-lived signed URLs after conversation membership is checked. Story access permits an author, a public Story viewer, or a selected custom-audience member; private Stories remain author-only. The initial build intentionally does not offer a “connections” Story audience until Savanna has a dedicated, privacy-reviewed social-graph model.

Storefront catalog data is public only when the merchant selects `public` visibility. Merchant settlement references are encrypted server-side and the merchant UI returns only a sanitized status, provider, country, and recipient display alias. Payment intents record explicit payer confirmation before the provider request is created. Course lessons use creator, preview, or active-enrollment authorization; lesson-progress data respects the learner’s progress opt-in.

## Payment integration readiness

The payment model deliberately **does not initiate live mobile-money transactions in this development environment**. The current provider catalog contains disabled adapter entries for M-PESA in Kenya, MTN MoMo in Ghana, Airtel Money in Uganda, and Flutterwave in Kenya, Ghana, Nigeria, and Uganda. Savanna includes a Flutterwave callback boundary that checks the raw-body HMAC signature and verifies a completed transaction server-side against its reference, currency, and amount before reconciliation; the associated checkout initiation remains deliberately inactive. The partner adapter boundary follows the official provider research in [`payment_provider_research.md`](./payment_provider_research.md) and [`flutterwave_adapter_research.md`](./flutterwave_adapter_research.md): a provider must own authorization/prompt creation, authenticated callback verification, status retrieval, and reconciliation; Savanna owns normalized payment states and receipt issuance. A guarded `/api/payments/:providerCode/callback` contract is present for integration testing, but it must be replaced or extended with the official provider-specific verification scheme before production use.

Before live launch in any country, complete the following items:

1. Sign the relevant commercial/provider agreements and configure production API credentials using the project’s secret-management flow.
2. Add provider-specific request signing, callback signature validation, IP/domain requirements, and reconciliation polling as required by each adapter.
3. Register the production callback URL and verify idempotent processing against each provider’s sandbox.
4. Add operational review, customer-support, refund, dispute, KYC/AML, tax, and local regulatory processes with qualified legal and payments specialists.
5. Keep `liveConnected` false until end-to-end sandbox verification, threat modeling, and controlled pilot approval are complete.
6. For Flutterwave, add the server-only `FLUTTERWAVE_SECRET_KEY` and `FLUTTERWAVE_WEBHOOK_SECRET_HASH` values, register the production callback URL, create a provider-approved hosted checkout initiation flow, and repeat the verification and reconciliation tests in sandbox before any live enablement.

## Realtime and operational considerations

The current chat implementation persists conversations and delivery-state records. The app does not yet run a persistent WebSocket worker because the default deployment model is autoscaling and request-oriented. Before enabling high-volume live fan-out, decide between a managed WebSocket/pub-sub service and an always-on reserved runtime, define connection authentication and backpressure limits, and run multi-instance delivery and reconnect tests. Direct resumable media uploads and a streaming/CDN pipeline remain prerequisites for long course video.

The uploaded-video and message-attachment flows intentionally use an 8 MB limit in this initial implementation. Production video delivery should move to direct, resumable uploads and a streaming/CDN pipeline before supporting long course videos.

## Verification performed

TypeScript typechecking succeeds. The Vitest suite currently covers PWA asset presence, logout behavior, tRPC authentication contracts, payment partner country boundaries, offline-safe provider state, paid-course access, Story visibility, read-receipt choices, merchant order state eligibility, and payment lifecycle transitions. Desktop and narrow mobile-browser screenshots were reviewed for the home, messaging, storefront onboarding, public profile, discovery, product detail, payments, orders, and checkout routes. Interactive controls use semantic buttons, links, labels, dialogs, focus-visible states, and live/status messaging; a formal assistive-technology audit remains a pre-launch requirement.
