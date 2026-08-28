# Savanna PWA: Architecture and Data Model

**Status:** Approved planning baseline  
**Scope:** Desktop-first social commerce and learning PWA; no native iOS or Android applications  
**Timestamp policy:** Every operational, transactional, audit, and content timestamp is stored as a UTC database timestamp and rendered in the viewer’s local time.

## 1. Platform decision

Savanna will use the initialized full-stack web foundation: **React 19, TypeScript, Vite, Tailwind CSS, Express, tRPC, Drizzle, and a relational MySQL-compatible database**. Authenticated application state is accessed through typed tRPC procedures, while user-generated media is stored in object storage and represented in the database only by key, URL policy, MIME type, size, checksum, and ownership metadata. This separates business data from large file bytes and permits lifecycle controls for images, documents, Stories, and lesson videos.

Savanna is a Progressive Web App, not a native-app substitute. A web manifest and icons support installation in compatible browsers, while a service worker supplies an offline application shell and carefully selected cached assets. Supporting browsers can promote a manifest-backed PWA for installation, and an installed PWA can open in a standalone app-like window.[1] Service workers are a device-side request layer that can serve cached resources when the network is unavailable, but browsers do not guarantee support or immediate first-load control; the core application must remain functional without assuming service-worker availability.[2]

## 2. Realtime delivery options

Savanna should choose the realtime transport only after measuring expected concurrent usage and chat latency requirements. Both options preserve the same database, API, and payment architecture.

| Approach | Trade-offs | Cost | Setup complexity |
|---|---|---|---|
| **Managed autoscaling web application with short-interval refresh and optimistic UI** | It is simpler, horizontally scalable, and suitable for early private beta. New-message latency is a few seconds rather than instant; no persistent socket is held. The database remains the single source of truth. | Starts on the standard managed web-hosting model; usage-based at higher volume. | Lower. This is the recommended first release route. |
| **Persistent realtime web application with WebSocket/SSE delivery** | Enables instant delivery states, presence, typing indicators, and lower-latency chat. It runs as one continuously available process, so capacity must be observed carefully. | Usage-based. At full continuous utilization, the current 1 vCPU / 0.5 GB configuration has a compute ceiling of about $37.50/month before the $10 monthly usage credit; egress is additional and actual cost can be lower.[3] | Higher. Use only when beta telemetry demonstrates the need for always-on socket delivery. |

The initial build should therefore use optimistic sending, durable message IDs, targeted refresh, and server-driven delivery receipts. The protocol boundaries should allow a WebSocket/SSE transport to be added later without changing message persistence or authorization rules.

## 3. PWA requirements

The installable experience includes a web manifest, branded 192px and 512px icons, a `start_url`, standalone display behavior, theme colors, and an in-product install affordance where browsers expose an installation event. Browser-specific installation instructions are supplied rather than promising the same prompt on every platform. The offline shell caches the signed-out entry experience, critical interface assets, recent allowed navigation views, and encrypted local draft/outbox data. It must never cache payment credentials, payment authorization responses, decrypted private message content, or time-sensitive account-permission decisions.

| PWA state | Required behavior |
|---|---|
| First visit | Normal HTTPS web experience; no assumption that a service worker has taken control. |
| Installable browser | Offer contextual installation guidance and respect the browser’s native confirmation flow. |
| Offline | Render the shell, show cached permitted content, allow encrypted drafts/outbox entries, and clearly label unavailable live actions. |
| Reconnected | Reconcile the outbox idempotently, refresh delivery states, and require fresh server confirmation for any payment or purchase action. |
| Update available | Explain that a reload is required for an app update; do not silently invalidate a user’s unsent draft. |

## 4. Privacy-domain architecture

Savanna is not a single data domain. Private conversations, public Stories, storefront content, learning content, and payment data have distinct user expectations, access rules, retention behaviors, and moderation paths. The user interface must label the active domain before a person posts, shares, pays, or reports.

| Domain | Visibility and storage | Authorization rule | Reporting and safety rule |
|---|---|---|---|
| **Private direct and group chat** | Conversation metadata and client-encrypted content references. The proposed product standard is end-to-end encrypted content; backend services handle routing, membership, and encrypted payload persistence rather than plaintext content. | Only active conversation members can retrieve the encrypted payload and attachment envelope. Membership changes take effect immediately. | A report deliberately attaches only the messages the reporter selects; it is not a standing server-side plaintext view. |
| **Stories** | Audience-scoped public/social media with an explicit expiry timestamp, views, reactions, and reporting metadata. | The server evaluates audience rules before each media or story response. | Stories are reportable; report evidence follows the public/social-domain policy. |
| **Storefronts and products** | Discoverable merchant/creator profile data, product metadata, prices, stock, and fulfillment terms. | Public read access is allowed only for published records; editing is limited to authorized merchant staff. | Verification, product-policy reports, takedown status, and merchant escalation are stored separately. |
| **Courses and lessons** | Public sales pages plus purchaser-gated lesson metadata and signed access to video/document assets. | Only active enrollments can request purchaser-only lesson access; every media URL is short-lived and audience-bound. | Course-specific reporting covers misleading listings, infringement, and unsafe content. |
| **Payments** | Provider tokens, normalized transaction states, fee/recipient snapshot, receipt record, and provider events. No raw card or mobile-money credentials are persisted. | Customer, merchant, finance support, and provider services receive narrowly scoped access. | Disputes are attached to payment/order records; private-chat content is never included automatically. |

## 5. Relational domain model

The database is organized around explicit ownership, state transitions, and auditability. All time fields are database timestamps in UTC. `createdAt`, `updatedAt`, `publishedAt`, `expiresAt`, `paidAt`, `deliveredAt`, `settledAt`, and `revokedAt` are never client-local strings.

| Area | Principal tables | Key relationships and invariants |
|---|---|---|
| Identity and privacy | `users`, `profiles`, `privacySettings`, `userHandles`, `deviceSessions`, `blocks`, `reports`, `consents`, `auditEvents` | A user has one profile and one privacy configuration. Handles are unique, non-enumerable by default, and may be revoked. Consent entries record scope, version, grant time, and withdrawal time. |
| Private messaging | `conversations`, `conversationMembers`, `messages`, `messageAttachments`, `messageDeliveryReceipts`, `messageKeyEnvelopes`, `conversationSearchTokens` | A message belongs to one conversation and sender. Private content is encrypted before persistence. Search tokens are client-generated or limited to non-content metadata; the server does not maintain a plaintext full-text index of E2EE messages. |
| Stories | `stories`, `storyMedia`, `storyAudienceRules`, `storyViews`, `storyReactions`, `storyReports` | Every Story has an `expiresAt` UTC timestamp and one audience policy. Views are append-only events with deduplication for viewer analytics. |
| Commerce | `businessProfiles`, `businessMembers`, `businessVerifications`, `products`, `productMedia`, `productPrices`, `inventoryRecords`, `orders`, `orderItems`, `orderStatusEvents` | A business can have multiple authorized managers. Price snapshots are copied to order items so historical orders remain accurate if catalog prices change. |
| Learning | `creatorProfiles`, `courses`, `courseModules`, `lessons`, `lessonAssets`, `courseEnrollments`, `lessonProgress`, `courseReviews` | A course has ordered modules and lessons. Purchaser-only access is evaluated from an active enrollment. Progress is per learner and lesson, with last-seen position stored only when a learner opts in. |
| Payments | `countryPaymentConfigurations`, `paymentProviderAccounts`, `paymentIntents`, `paymentAttempts`, `paymentProviderEvents`, `paymentReceipts`, `settlementRecords`, `refunds` | A payment intent freezes order/enrollment recipient, amount, currency, fee, and provider selection before customer authorization. Provider events are immutable, verified, idempotent, and reconciled to a normalized payment state. |

## 6. Payment-provider adapter contract

Savanna will not build or custody a wallet in the first release. Instead, the backend implements a **payment-provider adapter** for each enabled country and rail. An adapter isolates provider-specific authentication, customer prompts, callbacks, and settlement identifiers from the order and course systems.

```text
createPaymentIntent(order or enrollment, customer, country, currency)
  -> show summary: recipient, subtotal, fee, total, currency, reference
  -> customer explicitly confirms
  -> selected PaymentProviderAdapter.initialize(intent)
  -> customer completes provider authorization / mobile-money prompt
  -> provider sends signed callback or the server retrieves authoritative status
  -> adapter.verifyAndNormalize(event)
  -> Savanna atomically records payment event and advances the order/enrollment state
  -> receipt is issued; merchant/creator and customer receive status updates
```

| Adapter responsibility | Required implementation rule |
|---|---|
| Availability | Only offer a provider when the customer country, merchant settlement country, currency, and legal configuration permit the rail. |
| Initialization | Generate an idempotency key and a Savanna payment reference before calling the provider. Persist the pending attempt before the external request. |
| Customer confirmation | Present recipient display name, business/creator name, subtotal, applied fee, total, currency, and order/course reference. No payment begins before confirmation. |
| Webhook/callback | Require a dedicated HTTPS endpoint, provider signature/credential verification where supported, schema validation, replay protection, and idempotent event storage. MTN MoMo documents a callback URL requirement; Safaricom’s Daraja portal explicitly supports M-PESA API integration for web and mobile apps.[4] [5] |
| State normalization | Map provider states to `created`, `pending_customer_action`, `processing`, `succeeded`, `failed`, `cancelled`, `expired`, `refunded`, and `disputed`. Never grant product fulfillment or course enrollment from a client-side success screen alone. |
| Reconciliation | Compare provider settlement/status data with internal payment intents at a scheduled cadence. Reconciliation is server-side, auditable, and never changes a paid order without an audit event. |
| Secrets and data | Store provider credentials only in server-side secrets. Keep provider callbacks and sensitive identifiers out of browser logs, URLs, and client analytics. |

## 7. Course-video delivery decision

The first product needs a media delivery approach that protects purchaser-only lessons without making the web application responsible for heavyweight video processing.

| Approach | Trade-offs | Recommendation |
|---|---|---|
| **Signed object-storage video files** | Faster initial implementation. Requires upload size limits, media duration rules, browser-compatible MP4 output, short-lived access URLs, and a manual content-quality process. | Suitable for a tightly scoped beta with short lessons. |
| **Managed video delivery partner** | Adds vendor integration and cost but provides adaptive streaming, encoding, playback analytics, and stronger delivery reliability. | Preferred for a broad public course catalog and long-form content. |

In both cases, paid access is enforced by enrollment authorization before the server returns a short-lived video URL. This gate is separate from product ordering and separate from the customer’s private message history.

## 8. Server-side module boundaries

| Module | tRPC responsibilities | Server and database responsibilities |
|---|---|---|
| `auth` and `profiles` | Session, profile edit, privacy settings, handle lookup by exact value | User lifecycle, consent, device-session audit, access checks. |
| `chat` | Conversation list, create group, send encrypted envelope, list permitted messages, delivery receipt | Member authorization, durable ordering, attachment metadata, rate limits. |
| `stories` | Feed list, publish, view, react, delete, report | Audience filtering, expiry, media URL authorization, abuse queue. |
| `business` and `catalog` | Profile management, verification submission, product CRUD, product listing | Staff-role checks, catalog validation, immutable price history. |
| `courses` | Course authoring, enrollment status, lesson list, progress mutation | Creator checks, access gate, signed asset authorization. |
| `orders` | Create draft, submit order, seller status update, customer order history | Stock checks, order-state transitions, append-only status timeline. |
| `payments` | Quote, confirm, payment status, receipt | Provider adapter, callback endpoint, immutable provider event log, reconciliation. |
| `safety` | Block, report, appeal/create case | Scope-specific evidence handling, reviewer access control, audit events. |

## 9. Security and quality gates

Before real money or private messaging are introduced, Savanna requires a completed threat model, input validation and authorization tests for every procedure, file-type/size validation, malware scanning strategy for uploaded files, rate limits, audit logging for staff actions, and independent review of the private-message encryption design. Payments require test/sandbox certification with every provider, callback signature testing, idempotency testing, order/payment reconciliation testing, and finance-support operating procedures. No payment provider credentials or live settlement details are embedded in the client.

## References

[1] MDN. *Making PWAs installable*. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable (accessed 2026-08-27)

[2] web.dev. *Service workers*. https://web.dev/learn/pwa/service-workers (accessed 2026-08-27)

[3] Manus. *Reserved Hosting Reference*. Internal implementation reference, accessed 2026-08-27.

[4] Safaricom. *Daraja Developer Portal*. https://developer.safaricom.co.ke/ (accessed 2026-08-27)

[5] MTN MoMo. *Callback — Developer Portal*. https://momodeveloper.mtn.com/api-documentation/callback (accessed 2026-08-27)
