# Savanna — implementation gaps

Audit run 2026-09-08 against `IMPLEMENTATION_PLAN.md`, `todo.md` and `docs/`.
Every item was verified by reading the code; file + line evidence is attached.

Headline: the social core (chat, Stories, Communities, Shops/Orders, Safety,
Admin, push, PWA shell) is genuinely built. `todo.md` and `docs/BUILD_STATUS.md`
claim near-total completion, which is overstated. Four things matter most:
presence/typing are fabricated, E2EE does not exist despite the docs promising
it, the whole Learn module is dead code, and every `/api/*` call is dead on
Firebase Hosting.

---

## P0 — broken or misleading

### 1. Presence and typing indicators are invented
`getConversationPresence()` returns hardcoded strings: `"38 people active"` for
every group, `"Active 2m ago"` for every merchant chat, and for direct chats a
pseudo-random pick from `["Online", "Typing...", "Active 2m ago"]` seeded by
`hashId(conversation.id)`. Users are told someone is typing when they are not.
Nothing writes presence anywhere in the client.
- `client/src/pages/MessagesPage.tsx:91-116` (generator)
- rendered at `:1920`, `:1978`, `:2025`, `:2033`, `:2168`
- `firestore.rules:581` declares a `match /presence/{uid}` block that no client
  code ever writes to — dead rule.

### 2. No end-to-end encryption — messages are stored plaintext
`IMPLEMENTATION_PLAN.md:50,77` and `docs/architecture_decisions.md:40,52` promise
E2EE via `messageKeyEnvelopes`. There is no crypto code in `client/src` at all;
`sendFirebaseMessage` / `sendFirebaseAttachment` write `body` straight to
Firestore.
- `client/src/lib/firebaseChat.ts:565` (`sendFirebaseMessage`)
- `client/src/lib/firebaseChat.ts:661` (`sendFirebaseAttachment`)

### 3. Video and voice calling are toast placeholders
- `client/src/pages/MessagesPage.tsx:1121-1122`

### 4. Every `/api/*` call is dead on the deployed site
`firebase.json:5-10` rewrites `**` → `/index.html`, so `/api/*` returns HTML.
`functions/index.js` only exports a Firestore trigger, no HTTPS function. Yet the
client calls four endpoints:
- `client/src/main.tsx:216` — tRPC at `/api/trpc`
- `client/src/lib/gemmaAi.ts:133,148` — `/api/ai/memory-enrichment`
- `client/src/lib/gemmaAi.ts:172` — `/api/ai/recall-answer`
- `client/src/savanna/translation/CloudTranslationProvider.ts:35` — `/api/ai/translate`

Effect: Payments pages get HTML where JSON is expected; Savanna Recall, memory
enrichment and cloud translation fail silently. A correct Netlify config exists
(`netlify.toml:9-14`) but Firebase is the active target.
**Fix options:** (a) add an `api` HTTPS function + `/api` rewrite in
`firebase.json`, or (b) deploy the Express server to Netlify and point DNS there.

### 5. Device sessions screen is fake
Renders one hardcoded row for the current browser plus a permanently disabled
button. No session list, no revocation — contradicting `todo.md:8-9`.
- `client/src/pages/ProfilePage.tsx:596-597`

---

## P1 — clearly missing

### 6. The entire Learning / paid-courses module is unreachable
`CoursePage.tsx`, `LearnPage.tsx`, `CreatorStudioPage.tsx` are imported by
nothing, and all three Learn routes redirect away.
- `client/src/App.tsx:88-96` — `/learn/manage` → `/shops/manage`, `/learn/:slug`
  → `/shops`, `/learn` → `/shops`
- Course checkout hard-disabled: `client/src/pages/CheckoutPage.tsx:75`

### 7. Home route and page are dead
`/home` redirects to `/messages`; `pages/Home.tsx` is unreferenced. The plan's
Home feed + Stories header no longer exists as a destination.
- `client/src/App.tsx:67-69`, `client/src/pages/Home.tsx`

### 8. Dead navigation controls in the shell
Three prominent controls with no handler (the file has exactly one `onClick`,
for mobile haptics at `:322`):
- "Create" / creator menu — `SavannaShell.tsx:212-217`
- Account menu — `:219-222`
- "Search Savanna ⌘K" — `:256`; no `metaKey`/`KeyK` listener exists anywhere

### 9. Orders, Payments, Learn and Profile are absent from navigation
Both navs render only Messages, Services, Stories, Communities, so `/orders` and
`/payments` are reachable only by redirect or by typing the URL.
- `client/src/components/SavannaShell.tsx:21-26`

### 10. No offline outbox or durable drafts
`IMPLEMENTATION_PLAN.md:61,66-67` requires a durable draft/outbox that reconciles
idempotently. Drafts live in React state only; there is no `outbox` symbol.
- `client/src/pages/MessagesPage.tsx:1663`, `client/src/hooks/useNetworkState.ts`

### 11. Payments are not processed
Checkout is an order-confirmation form that says so explicitly.
- `client/src/pages/CheckoutPage.tsx:95,109,156`

### 12. No message-request flow and no private-group roles
`docs/experience_and_delivery_plan.md:46-50` requires a message-request path for
unknown senders, plus admin roles / announcement mode / expiring invites for
groups. Neither exists (Communities have roles; private groups do not).

---

## P2 — partial

- **Mute notifications is a toast** — `MessagesPage.tsx:1160`. The data model
  exists and is honoured server-side (`functions/index.js:77-85,193`); only the
  UI control is missing.
- **Admin dashboard silently falls back to an empty object** while loading, so
  "0 users / 0 reports" is indistinguishable from real data —
  `client/src/pages/AdminPage.tsx:122-133,1313`.
- **Savanna Recall is text-only** — `MessagesPage.tsx:880`.
- **Story replies are text-only** — `lib/firebaseChat.ts:1258`.
- **Service worker caches the shell only** — no route-data caching, no background
  sync (`client/public/service-worker.js:84-137`), so offline does not deliver
  the "cached permitted content" the plan promises.
- **Desktop story rail chips are not clickable** — `MessagesPage.tsx:196` renders
  a `<div>` per author with no handler, unlike the mobile rail.
- **Unused demo key** — `client/src/components/Map.tsx:141` (`DEMO_MAP_ID`).

---

## P3 — cleanup

- Orphaned files to delete or wire: `pages/Home.tsx`, `pages/LearnPage.tsx`,
  `pages/CoursePage.tsx`, `pages/CreatorStudioPage.tsx`, `pages/PlaceholderPage.tsx`.
  `Home.tsx:41,48` also contains fabricated copy (`onlineCount = Math.min(2, ...)`).
- Manifest hardcodes `theme_color`/`background_color` to `#FFFFFF`, so dark-mode
  installs get a white splash.
- Dead `presence` block in `firestore.rules:581` — remove or implement.

---

## Confirmed working (do not re-do)

- Story analytics — wired in `StoriesPage.tsx:132,451`, `ProfilePage.tsx:63`,
  `MerchantStudioPage.tsx:77`.
- Voice messages — real `MediaRecorder` → upload (`MessagesPage.tsx:1402-1458`).
- Push notifications — client token registration
  (`lib/firebaseNotifications.ts:220-230`) + Cloud Function with re-validation
  and stale-token pruning (`functions/index.js:267-323`) + SW handlers.
- Unread counts — incremented on send (`lib/firebaseChat.ts:626,723,797`), reset
  on read (`:408-444`), rendered (`MessagesPage.tsx:1922,1991`).
- Dev-only preview chats / preview Stories are correctly gated behind
  `import.meta.env.DEV` — not a defect.
