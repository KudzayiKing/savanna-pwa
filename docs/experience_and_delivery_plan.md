# Savanna PWA: Experience and Delivery Plan

## 1. Experience premise

Savanna should feel like a considered desktop product rather than a mobile layout stretched onto a large screen. Its primary desktop experience gives the user three useful spaces at once: a personal navigation rail, a focused central workspace for Stories, conversations, discovery, products, and lessons, and a contextual right rail for commerce, activity, or course progress. The page remains usable at narrow browser widths by progressively reducing contextual panels rather than shrinking every element until it becomes unreadable.

The visual language is **warm, editorial, and calm**: a pale savanna-sand base, deep charcoal text, a rich acacia-green primary action, warm clay status accents, and restrained shadows. Product imagery and creator video thumbnails provide the color; interface chrome stays refined. Interactions use short transform-and-opacity motion, visible focus indicators, keyboard shortcuts, and a reduced-motion setting.

## 2. Desktop information architecture

| Area | Desktop behavior | Primary actions |
|---|---|---|
| Global rail | Fixed left rail from 1024px upward; includes Home, Messages, Stories, Explore, Shops, Learn, Orders, and Profile. | Navigate, open search, create Story, create listing/course, view notifications. |
| Command/search | Persistent top search on desktop with `Ctrl/Cmd + K` command palette. | Search people, exact handles, conversations, products, businesses, courses, and help. |
| Main canvas | Contextual route workspace with a max-readable width; no generic dashboard card wall. | Consume feed, manage message view, browse storefront, purchase, learn. |
| Context rail | Hidden below large desktop widths; shows current conversations, business support status, story viewers, cart/order state, or lesson progress according to route. | Resume task without leaving current page. |
| Creation entry | Prominent but unobtrusive `Create` trigger. It opens role-aware options: Story, product, course, lesson, or business post. | Begin publishing without overwhelming standard users. |

### Responsive hierarchy

| Viewport | Layout policy |
|---|---|
| **≥ 1440px** | Three-column application shell: 240px global rail, fluid central canvas, 300–336px contextual rail. |
| **1024–1439px** | Two-column shell: global rail + central canvas. Context appears as a focused side panel, sheet, or route module. |
| **768–1023px** | Compact navigation rail with labels on focus/hover. Product and course grids reduce columns without losing action labels. |
| **< 768px** | Mobile browser layout uses a fixed bottom navigation, a top route header, full-width content, bottom sheets for order/payment confirmation, and thumb-reachable primary actions. It remains a PWA browser experience, not a simulated native app. |

## 3. Home and Stories interaction

The Home route begins with the Stories header, then blends people/community updates with product and course discovery. The Stories header is the distinctive interaction: it behaves like a compact, useful strip during normal reading, but becomes immersive when the user deliberately pulls at the top of the Home scroll surface.

### Stories state model

| State | Trigger | Visual behavior | Accessibility behavior |
|---|---|---|---|
| **Expanded** | Initial route load, keyboard activation, or downward pull while `scrollTop = 0` | Header grows from 112px to 240px maximum. Story avatars become large portrait cards, showing name, recency ring, and optional creator/business cue. | A “Expand Stories” button and `Enter`/`Space` alternative expose the same state; screen readers receive an announced expanded/collapsed state. |
| **Pull expansion** | Touch/pointer drag downward or trackpad overscroll at the top; distance is clamped and eased | Height, avatar scale, title opacity, and background crop interpolate from compact to expanded. Releasing after the threshold settles expanded; otherwise it returns compact. | Reduced-motion preference disables spring motion and switches to an immediate state change. |
| **Compact strip** | User scrolls down past the threshold or presses collapse | Header becomes sticky at 72–84px high, retaining circular story entries, an overflow affordance, and a clear `+` create Story action. | Focus order remains stable; compact and expanded structures are one semantic list, not duplicate controls. |
| **Story viewer** | Select a Story | Full-height focused viewer with next/previous, pause, report, mute, and close controls. Desktop supports arrows; mobile supports swipe and buttons. | Dialog focus trap, labelled controls, captions/transcript support for video where supplied. |

The browser’s natural overscroll must not be disabled globally. The interaction is limited to the Home content container and is triggered only at the top boundary, so it does not interfere with browser navigation or normal scrolling. The implementation uses `Pointer Events`, a bounded pull-distance state, `transform` and `opacity` animation, and `prefers-reduced-motion` fallbacks; it does not animate layout properties on every pointer frame.

## 4. Private messaging experience

Messages use a desktop split view. The conversation list appears on the left of the Message workspace, and the selected conversation occupies the remaining width. The conversation header communicates participant name, privacy state, group membership, mute state, and support/merchant context where relevant. The composer supports text and attachments; an attachment enters a local staging state before send. Message delivery is legible without noisy icons: `Sending`, `Sent`, `Delivered`, and `Read` are exposed visually and through accessible labels.

| Flow | Required behavior |
|---|---|
| Start a conversation | Find an exact handle, choose an approved contact, scan/import a QR link, or enter a message-request path for an unknown person. |
| Send message | Client creates a durable local message ID and encrypted envelope, displays optimistic state, then reconciles against server acknowledgement and delivery receipts. |
| Group management | Admins can set roles, approve entrants, create announcement mode, remove members, and set an expiring invite. Members can mute, leave, report, or block. |
| Search | The application searches conversation metadata and user-permitted index material. It does not promise server-side plaintext search of end-to-end encrypted private content. |
| Merchant support | A product/order starts or resumes a labeled customer–merchant thread. Business policy and receipt links are visible, but payment credentials are never injected into chat. |

## 5. Business storefront experience

Business profiles adopt an Instagram-like composition without copying its visual identity. A profile masthead contains a circular or square logo/avatar, display name, verification state with explainer, category, concise bio, service location/range, storefront links, and contact actions. Below it, tabs distinguish **Shop**, **About**, **Stories**, **Reviews** (only if real and moderated), and **Support**. No fabricated ratings, testimonials, or reviews may appear at any stage.

| Screen | Key content | Conversion and safety requirements |
|---|---|---|
| Business profile | Bio, verified status, contact action, story highlights, product grid | Verification indicator explains what was verified; contact opens a scoped support conversation. |
| Product grid | Image, product name, current price, availability, optional delivery badge | Price is never hidden behind a chat action. Grid supports keyboard browse and responsive columns. |
| Product detail | Media, full price, quantity, options, delivery/collection details, merchant policy, question/support action | `Buy` opens an order summary; `Ask a question` opens chat without starting payment. |
| Order confirmation | Recipient, items, quantity, subtotal, fee, total, payment rail, fulfillment information | User must explicitly confirm these details before provider authorization. |
| Customer order area | Orders by current state, receipt, merchant update timeline, support entry | Status changes are event-based and timestamped in UTC, displayed locally. |

## 6. Creator and learning experience

Creator storefronts share the business architecture but place learning outcomes, course covers, creator credentials, and course modules ahead of physical catalog items. A creator can publish a course landing page, draft modules, upload or attach a video lesson, set a price, and preview the purchaser experience. A course is not publicly viewable as “paid” until price, purchaser access, and settlement configuration are complete.

| Screen | Required experience |
|---|---|
| Creator profile | Bio, verification/identity context where available, selected courses, Stories, follow/contact actions. |
| Course landing page | Outcome statement, curriculum outline, lesson count/duration, price, creator info, refund/terms link, and purchase action. |
| Checkout | Same recipient, price, fee, and payment-confirmation surface used for products. A successful payment becomes an enrollment only after verified server-side payment completion. |
| Learning workspace | Desktop lesson sidebar, video/content canvas, module progress, notes/downloads where allowed, discussion/contact entry. |
| Progress | Explicit progress indicator, resume point, completion state. Watch-position tracking is opt-in and belongs to the learning privacy domain. |

## 7. Merchant and creator onboarding

Onboarding is staged rather than a single intimidating application. The platform first captures a public profile, then asks for the relevant catalog/course information, then requests settlement/provider details only when the account is ready to accept payments. Each stage is resumable and has a clear “not yet public” status.

| Stage | Merchant outcome | Creator outcome |
|---|---|---|
| 1. Profile | Public business name, bio, category, service location, contact preference | Creator name, bio, expertise summary, public profile details. |
| 2. Content | Product images, inventory, descriptions, price, delivery/collection policy | Course cover, course outline, modules, lessons, price, learner access rules. |
| 3. Trust | Verification submission and clear pending/approved/rejected status | Creator verification where required for payments or restricted content. |
| 4. Settlement | Eligible country, supported provider, settlement recipient, policy acceptance | Same provider and payout configuration. |
| 5. Publish | Review preview, public catalog, first order readiness | Review course experience, public landing page, purchaser access readiness. |

## 8. Delivery milestones

| Milestone | Outcome | Included work | Explicitly deferred |
|---|---|---|---|
| **M0: Product foundation** | Coherent visual shell and data model baseline | Design tokens, route map, auth/profile/privacy, PWA shell, relational schema, storage policy, test harness | Live payments, encrypted message transport, full course video processing. |
| **M1: Trusted social layer** | Users can establish a private profile, use Stories, and communicate | Direct/group chat foundations, attachments, delivery states, Stories pull/compact interaction, block/report, responsive keyboard navigation | Public discovery ranking, merchant payment collection. |
| **M2: Merchant commerce** | Verified sellers can present products and manage orders | Business onboarding, profile, catalog, products, checkout quote, order history/status, merchant support conversations | More than one production payment rail per initial country. |
| **M3: Paid learning** | Creators can sell and deliver courses securely | Creator onboarding, course authoring, lesson access gate, progress tracking, signed video delivery, enrollment receipt | Open creator marketplace/ranking and livestream courses. |
| **M4: Country payment rollout** | Customers pay through enabled country-specific rails | Payment adapter, sandbox certification, callback processing, receipt, refunds/dispute workflow, reconciliation | Custodial wallet, informal cross-border transfers, speculative token features. |
| **M5: Scale and realtime upgrade** | Product sustains growth without privacy/quality regression | Observability, abuse operations, accessibility audit, performance work, realtime transport decision from usage telemetry | New product surfaces without measured retention/safety justification. |

## 9. Acceptance criteria for the first public beta

The beta is ready only when an authenticated user can install the PWA in a supported desktop browser, navigate all core routes using a keyboard, use the offline shell without a crash, maintain a private profile with clear privacy choices, send a message that reconciles to its delivery state, publish a Story with a correct expiry, browse a real merchant storefront, see a full price before an order, and receive a verified payment result only from an authorized server/provider event. Every supported content type must have an intentional report/block path, and users must never see a private-chat, payment, or purchaser-only asset merely through a public URL or browser cache.
