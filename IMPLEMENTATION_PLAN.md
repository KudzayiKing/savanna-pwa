# Savanna: Desktop-First Social Commerce and Learning PWA

**Status:** Approved product plan and engineering baseline  
**Product:** Savanna  
**Form factor:** Responsive Progressive Web App; no native iOS or Android application  
**Initial stack:** React 19, TypeScript, Vite, Tailwind CSS, Node.js/Express, tRPC, Drizzle, relational MySQL-compatible database, object storage

## 1. Product objective

Savanna will be an elegant, desktop-first social commerce and learning application. It brings together private messages, audience-controlled Stories, Instagram-style merchant profiles, creator courses, and country-specific partner-led mobile-money payments. It is designed to let a customer discover a local seller or teacher, understand the offer and total price, ask a question in a contextual conversation, pay through an eligible local rail, and then track a product order or access paid learning content.

Savanna must not blur its data boundaries. Private chat, public Stories, storefronts, course enrolment, and payment data are different product domains with different access rules, consent, retention, reporting, and user expectations. That clarity is both a trust promise and an implementation constraint.

> **Product principle:** Savanna earns adoption as a private, dependable social experience first. Commerce and learning become useful extensions of that trust—not reasons to weaken it.

## 2. Experience direction

The desktop experience uses a calm, warm application shell. A persistent global navigation rail makes the product immediately navigable; a central canvas supports focused work; a contextual rail surfaces the relevant order, conversation, lesson, or activity detail without forcing the user to leave their task. At widths below desktop, contextual information moves into focused panels and bottom sheets rather than becoming cramped.

The visual system should use a **savanna-sand foundation**, **deep charcoal typography**, **acacia-green primary actions**, and restrained clay/gold highlights for status. The design is editorial rather than dashboard-heavy. Product photography, lesson covers, and Story media create expression; the interface itself remains quiet, legible, and keyboard-accessible.

| Route | Primary desktop experience | Narrow-layout adaptation |
|---|---|---|
| Home | Dynamic Stories header and mixed social/discovery feed | Full-width feed; Stories stay sticky in a compact strip after scrolling. |
| Messages | Conversation list and selected conversation in a split workspace | Conversation list transitions to a dedicated route; back navigation is always visible. |
| Shops | Curated business/product discovery and saved storefronts | Two-column then one-column product grid with explicit price and buy actions. |
| Storefront | Instagram-like merchant/creator profile, product or course tabs, contextual support | Profile masthead stacks; purchase/support actions remain visible. |
| Learn | Course landing pages and an enrolled learner workspace | Module drawer becomes a sheet; video and lesson content remain primary. |
| Orders | Customer order history and seller fulfillment timeline | Timeline becomes a compact, readable event list. |
| Profile and onboarding | Privacy settings, merchant/creator setup, settlement configuration | Stepwise form with resumable save state. |

## 3. Stories: signature interaction

The Home page should implement the requested Telegram-inspired Stories behavior. On opening Home, Stories are shown as an elevated header of rich portrait cards. As the user scrolls down, the header collapses into a compact sticky strip. At the top of the Home scroll surface, a deliberate downward pull or trackpad overscroll expands the strip into a larger immersive header; a keyboard-accessible expand/collapse action provides the same behavior without relying on gesture input.

| State | User trigger | Interaction and implementation rule |
|---|---|---|
| Expanded | Initial page state, explicit expand action, or completed pull gesture | Stories grow from a compact strip to a maximum 240px header. Avatars become portrait cards with name and recency state. |
| Pull expansion | Downward pointer/touch drag while the Home container is already at `scrollTop = 0` | A bounded pull distance controls only `transform` and `opacity` interpolation. Releasing beyond a threshold settles expanded; otherwise it returns compact. |
| Compact | Scrolling down, collapse action, or return below expansion threshold | A sticky 72–84px strip retains Story entry points and a clear create action. |
| Viewer | Select an individual Story | A focused viewer supports keyboard previous/next, pause, report, mute, and close. Video captions/transcripts are displayed where supplied. |

The interaction will respect `prefers-reduced-motion`, preserve natural browser overscroll outside the Home container, and avoid duplicate semantic controls between compact and expanded visual states.

## 4. Core product modules

| Module | Initial capability | Required guardrails |
|---|---|---|
| Profiles and privacy | Profile details, exact handles, privacy controls, device/session awareness, blocking and reporting | Phone number is not automatically shown to group members, buyers, or public profile visitors. Consent is versioned and revocable. |
| Private chat | Direct/group chat, media attachment metadata, delivery states, group roles, message requests, contextual merchant support conversation | Private content uses an end-to-end encryption architecture; the backend persists encrypted envelopes and conversation membership, not a plaintext content index. |
| Stories | Publishing, audience control, expiry, views, reactions, reporting, highlights later | Story media and views are evaluated against audience rules before response. Public/social content is visibly labeled as a different privacy mode from private chat. |
| Business storefronts | Bio, verification state, contact action, product grid, detail pages, transparent prices, availability, delivery/collection policy, order entry | No fabricated ratings, testimonials, or review data. Verification badges explain their basis. |
| Creator learning | Creator profile, course landing page, modules, lessons, paid enrollment, video/content access, progress tracking | Purchaser-only lesson access requires an active enrollment. Progress tracking and resume position are privacy-scoped and opt-in. |
| Orders and support | Customer order history, seller timeline updates, customer-to-merchant support thread, receipts | Order status is append-only and timestamped; payment credentials never appear in conversation content. |
| Merchant/creator onboarding | Business profile, catalog/course authoring, pricing, verification state, settlement setup, publish review | Settlement setup is staged and cannot be made public until eligible country/rail checks and required policy acceptance are complete. |

## 5. PWA implementation

Savanna will ship as a Progressive Web App with an installable manifest, 192px and 512px branded icons, standalone display behavior, a custom install affordance where browser support allows, and HTTPS delivery. A browser-supported manifest-backed PWA can be installed and launched in an application-style window; browser-specific install behavior must be described rather than assumed to be uniform.[1]

An offline shell provides the layout, critical static assets, limited approved cached route data, and a durable encrypted draft/outbox. Service workers can proxy requests and serve cached resources during network outages, but they are not guaranteed on the first load or across all browsers; therefore, no critical feature assumes a service worker has already activated.[2]

| Connectivity condition | Required response |
|---|---|
| First visit | Standard web app experience; the service worker is an enhancement, not a prerequisite. |
| Offline | Application shell loads; cached permitted content appears with an offline label; drafts remain local; payments and live entitlement changes are unavailable. |
| Reconnection | Outbox reconciles idempotently; latest message/order/story states refresh; payment status is re-queried from the server. |
| Application update | The user sees a non-destructive update indication. No reload discards unsent drafts or partially authored course/product content. |

## 6. Data and tRPC architecture

The database uses normalized relational tables with explicit ownership, authorization rules, state transitions, and audit events. All timestamps—particularly `createdAt`, `updatedAt`, `expiresAt`, `publishedAt`, `paidAt`, `deliveredAt`, `settledAt`, and `revokedAt`—are stored as UTC database timestamps and formatted in the viewer’s local timezone only at the interface layer.

| Domain | Planned tables | Key invariant |
|---|---|---|
| Accounts and safety | `users`, `profiles`, `privacySettings`, `userHandles`, `deviceSessions`, `blocks`, `reports`, `consents`, `auditEvents` | A report records only scope-appropriate user-selected evidence; consent has a clear purpose/version and withdrawal time. |
| Chat | `conversations`, `conversationMembers`, `messages`, `messageAttachments`, `messageDeliveryReceipts`, `messageKeyEnvelopes`, `conversationSearchTokens` | Only active members retrieve private encrypted envelopes. The server does not maintain a plaintext full-text index of E2EE content. |
| Stories | `stories`, `storyMedia`, `storyAudienceRules`, `storyViews`, `storyReactions`, `storyReports` | Every Story has a UTC expiry and exactly one auditable audience policy. |
| Storefronts | `businessProfiles`, `businessMembers`, `businessVerifications`, `products`, `productMedia`, `productPrices`, `inventoryRecords` | Published storefront data is separate from private customer and payment data. |
| Courses | `creatorProfiles`, `courses`, `courseModules`, `lessons`, `lessonAssets`, `courseEnrollments`, `lessonProgress` | A lesson asset is accessible only through a current enrollment authorization decision. |
| Orders and payment | `orders`, `orderItems`, `orderStatusEvents`, `countryPaymentConfigurations`, `paymentProviderAccounts`, `paymentIntents`, `paymentAttempts`, `paymentProviderEvents`, `paymentReceipts`, `settlementRecords`, `refunds` | Order prices are snapshotted. Payment events are immutable and idempotent. Course access or fulfillment never relies on browser-only success state. |

The Node/tRPC backend will be divided into `profiles`, `chat`, `stories`, `business`, `catalog`, `courses`, `orders`, `payments`, and `safety` routers. Every mutation validates input server-side, uses authentication/role checks, and writes relevant audit events. Object storage is used for media, while the database holds keys and access metadata; no video/image bytes are stored in relational columns.

## 7. Payment and commerce approach

Savanna’s first release will be **partner-led**: it will not custody a user wallet or store raw payment credentials. Instead, a payment-provider adapter is selected only when the customer country, merchant/creator settlement country, currency, and legal configuration make the rail eligible. Safaricom’s Daraja portal offers APIs for M-PESA integration in web and mobile applications, while MTN MoMo’s documentation requires a callback URL for provider notifications.[3] [4] These examples validate a country-by-country adapter model rather than a single universal checkout implementation.

| Checkout step | Savanna responsibility | Provider responsibility |
|---|---|---|
| Quote | Freeze selected items/course, recipient, subtotal, fee, total, currency, and reference | None. |
| Confirmation | Show the merchant/creator recipient, business name, total, fee, currency, and order/course reference before the user consents | None. |
| Authorization | Create an idempotent payment attempt and initiate the selected rail | Present mobile-money prompt or other permitted authorization method. |
| Completion | Verify callback/signature or retrieve authoritative status; atomically update normalized payment state | Send status result/callback and settlement identifiers. |
| Fulfillment | Create course enrollment or advance the merchant order only after verified success; issue receipt and notifications | Perform settlement according to provider agreement. |
| Exception | Maintain failed/cancelled/refunded/disputed state, support route, and reconciliation queue | Return relevant state/refund response where supported. |

The integration must use server-side secrets, a dedicated HTTPS callback endpoint, provider-event signature/credential verification where supported, replay protection, schema validation, immutable callback storage, and scheduled reconciliation. A client-side “success” screen is never a source of truth.

### Commerce-platform decision

Two viable commerce routes should be assessed before implementation begins:

| Approach | Trade-offs | Cost | Setup complexity |
|---|---|---|---|
| **Savanna-native marketplace and payment model** | Best fit for multi-merchant social storefronts, country payment adapters, course entitlements, contextual chat, and unified privacy/audit design. It requires building and operating catalog/order logic responsibly. | Development and provider costs vary; no third-party storefront platform fee is assumed. | Higher. Recommended for Savanna’s stated long-term product model. |
| **Headless external commerce platform for product catalog/checkout** | Accelerates single-merchant catalog, checkout, and fulfillment workflows, but adds a separate system of record and does not replace Savanna’s course entitlements, social conversations, or custom country payment workflow. | Platform subscription/transaction costs depend on chosen provider. | Lower for a simple centralized shop, higher for Savanna’s multi-merchant requirements. |

Savanna should use its native relational domain model as the baseline in this plan. If the team later chooses an external commerce platform, it should be connected only after confirming the merchant/store ownership and determining that its checkout/payment capabilities work with the selected launch-country rails.

## 8. Video lesson delivery

For a limited beta, short MP4 lessons can use object storage with strict upload validation and short-lived purchaser-authorized links. A broad public course catalog should instead use a managed video delivery service for encoding, adaptive streaming, and reliable playback. In both paths, course purchase only creates an enrollment after server-verified payment; the client receives a short-lived asset URL only after the enrollment authorization check.

## 9. Realtime delivery decision

The first beta should optimize for data integrity and operational simplicity through optimistic chat UI, durable client message IDs, targeted refresh, and server-side delivery receipts. It should not assume a continuously open connection. If beta telemetry proves that instant presence, typing, and sub-second delivery materially improve retention, Savanna can add a persistent realtime transport without replacing the database or tRPC contracts.

| Approach | Trade-offs | Cost | Setup complexity |
|---|---|---|---|
| **Managed autoscaling application with targeted refresh** | Early beta messages may appear with a short delay, but the system remains simple and scales without persistent process management. | Standard managed hosting usage; lower baseline. | Lower; recommended for first beta. |
| **Persistent WebSocket/SSE service** | Enables immediate delivery, presence, and typing. It runs continuously as one process and must be load-tested. | Usage-based; the 1 vCPU / 0.5 GB configuration currently has an approximate full-utilization compute ceiling of $37.50/month before a $10 monthly usage credit, with egress additional.[5] | Higher; introduce only after measurement demonstrates the benefit. |

## 10. Delivery sequence

| Milestone | Product result | Scope |
|---|---|---|
| **M0 — Foundations** | A coherent application base and secure engineering boundary | Design system, responsive shell, PWA manifest/offline shell, auth/profile/privacy, relational schema, media-storage policy, Vitest baseline. |
| **M1 — Trusted social experience** | Private communication and the signature Stories interaction | Direct/group chat foundations, attachment metadata, delivery states, Stories expansion/collapse, audience controls, report/block, accessible keyboard paths. |
| **M2 — Merchant commerce** | Sellers can establish an elegant presence and take orders | Merchant onboarding, profile/verification UI, catalog, product detail, transparent ordering, customer history, seller status timeline, merchant support conversation. |
| **M3 — Paid learning** | Creators can sell structured courses and learners can access them securely | Creator onboarding, course authoring, lesson modules, purchaser access, progress tracking, short-lived video delivery. |
| **M4 — Country payment rollout** | Tested checkout in chosen launch countries | Adapter implementation, provider sandbox testing, callback verification, receipts, refund/dispute process, finance reconciliation. |
| **M5 — Scale and evolution** | Measured performance, safety, and real-time improvements | Observability, accessibility/performance audit, abuse operations, country configuration expansion, realtime decision based on telemetry. |

## 11. Quality gates

Before public beta, Savanna must pass PWA install/offline tests, keyboard-only navigation across key routes, responsive viewport checks, authorization tests for every tRPC mutation, relational state-transition tests for orders/enrollments/payments, signed media-link tests, content/reporting workflow tests, and malicious/replayed payment-callback tests. Private-message encryption requires a dedicated threat model and independent security review before live private content is trusted. Each payment provider requires sandbox certification, operational support procedures, and reconciliation evidence before live money is enabled.

## 12. Decisions required before M2/M4

The product can begin M0/M1 without commercial secrets, but the following inputs are necessary before actual payment or seller settlement work starts: the initial country or countries, the legal entity and payment-compliance owner, the first supported settlement rails, whether Savanna is a marketplace facilitator or merely a payment-orchestration layer, refund/dispute policy, merchant-verification standard, fulfillment/delivery model, and video delivery partner decision. These decisions determine provider contracts, data retention, support procedures, and customer-facing terms.

## References

[1] MDN. *Making PWAs installable*. https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable (accessed 2026-08-27)

[2] web.dev. *Service workers*. https://web.dev/learn/pwa/service-workers (accessed 2026-08-27)

[3] Safaricom. *Daraja Developer Portal*. https://developer.safaricom.co.ke/ (accessed 2026-08-27)

[4] MTN MoMo. *Callback — Developer Portal*. https://momodeveloper.mtn.com/api-documentation/callback (accessed 2026-08-27)

[5] Manus. *Reserved Hosting Reference*. Internal implementation reference, accessed 2026-08-27.
