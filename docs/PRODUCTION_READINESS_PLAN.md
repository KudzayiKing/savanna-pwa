# Savanna PWA — Production Readiness Plan

**Date:** 2026-08-28
**Scope:** Everything between the current state (typechecks pass, 17/19 tests pass, full UI/domain build done) and a safe public launch.

Known deferred items already tracked in `todo.md` (live payment credentials, realtime message fan-out, resumable media uploads) are covered here in Phase 5; everything else below was found by auditing server, client, and infra.

---

## Phase 0 — Repo hygiene & CI (quick wins, ~1 day)

| # | Item | Evidence | Fix |
|---|---|---|---|
| 0.1 | 2 failing tests break any CI gate | `server/pwa.assets.test.ts` asserts stale strings (`color: #111111`, `MobileNavIcon` import) | Update or delete the brittle cosmetic assertions |
| 0.2 | Accidental `add` package in devDependencies | `package.json:91` | `pnpm remove add`; also drop the redundant `pnpm` devDependency |
| 0.3 | Template/dev leftovers tracked in git | `template.json`, `vite.config.ts.bak`, `.manus/`, `.manus-logs/`, `.DS_Store` | Delete from git, extend `.gitignore` |
| 0.4 | Manus debug collector ships to prod | `client/public/__manus__/debug-collector.js` is copied into `dist/public` | Move out of `client/public`, serve dev-only |
| 0.5 | Dead code in bundle | `client/src/pages/ComponentShowcase.tsx` (1437 lines, unrouted, has console.log), unused `Map.tsx`/`AIChatBox.tsx`/`ManusDialog.tsx` | Delete unreferenced files |
| 0.6 | Manus-only Vite plugins run in prod builds | `vite.config.ts:7,77-151,153` (`jsxLocPlugin`, manus runtime/debug collector, `.manuspre.computer` allowlist) | Gate all manus plugins behind `import.meta.env.DEV`; remove host allowlist |
| 0.7 | No env documentation | 14 env vars only discoverable by grep | Add `.env.example` + README section |
| 0.8 | No CI, no README, no `engines` | no `.github/`, no Dockerfile, `package.json` has no engines | GitHub Actions running `pnpm check && pnpm test && pnpm build`; `engines.node >= 22`; README with setup/deploy/migration steps |
| 0.9 | **Live credentials in local `.project-config.json`** (TiDB URL+password, JWT_SECRET, API keys, git token) | untracked but one `git add -f` away | **Rotate all of these now**; move to a secret manager |

## Phase 1 — Server security hardening (blockers, ~3–4 days)

| # | Item | Evidence | Fix |
|---|---|---|---|
| 1.1 | No security headers / HTTPS enforcement | `server/_core/index.ts:33-40` — bare express, no helmet, no trust proxy | `helmet()`, `app.set("trust proxy", 1)` |
| 1.2 | No rate limiting; 50 MB JSON body limit on every route | `index.ts:37-38`, login (`routers.ts:31-54`) and uploads unthrottled | `express-rate-limit` global + strict per-route limits on login/upload/webhook; default body limit ~100 KB, large limit only on upload routes |
| 1.3 | CSRF exposure: `SameSite=None` cookie + no Origin check | `server/_core/cookies.ts:47`; `x-forwarded-proto` trusted without trust proxy (`cookies.ts:11-22`) | `SameSite=Lax` in production + Origin/Referer verification on tRPC mutations |
| 1.4 | Fail-silent database; server boots without required env | `server/db.ts:47-62` (`getDb()` → null, `upsertUser` silently no-ops); no startup check | Startup validation: throw if `DATABASE_URL`/`JWT_SECRET`/`OAUTH_SERVER_URL` unset in production; make `upsertUser` throw |
| 1.5 | JWT secret fallback in any non-`production` NODE_ENV | `server/_core/sdk.ts:158-166` (known dev secret when `NODE_ENV=staging`) | Require a real secret whenever not running a local dev build; fail closed |
| 1.6 | Sessions last 1 year, never rotate, JWT survives logout | `shared/const.ts:2`, `routers.ts:53-59` (logout only clears cookie) | Shorten expiry (e.g. 30 days), add token versioning tied to device-session revocation, invalidate server-side on logout |
| 1.7 | Local auth is an account-forging backdoor if flag leaks to prod | `routers.ts:31-54` (`ENABLE_LOCAL_AUTH=true` → sign in as any email, no password) | Compile-time exclusion from production bundle or hard allowlist |
| 1.8 | Storage proxy is an open presign relay | `server/_core/storageProxy.ts:5-47` — unauthenticated GET mints signed URL for any private object key (chat attachments, lesson videos) | Require auth + object-level ACL (conversation membership / enrollment) before redirecting |
| 1.9 | Upload mimeType is client-asserted, no byte validation | `server/routers/social.ts`, `server/db.ts:319-333,712-725` (videos always labeled `video/mp4`) | Magic-byte sniffing server-side; validate against declared type |
| 1.10 | Internal errors leak to clients | raw `error.message` in webhook handlers (`index.ts:70,88`); no tRPC `formatError`/`onError` (`server/_core/trpc.ts:6-8`) | tRPC error formatter + central Express error handler; sanitize 5xx |
| 1.11 | Settlement encryption key derived from JWT_SECRET | `server/db.ts:457-464` — rotating the session secret breaks settlement data | Dedicated `SETTLEMENT_ENCRYPTION_KEY` env var |

## Phase 2 — Client & PWA production fixes (~2–3 days)

| # | Item | Evidence | Fix |
|---|---|---|---|
| 2.1 | **Login is broken in production** — OAuth flow is dead code, only dev local-login is wired | `client/src/pages/LoginPage.tsx:25` calls `trpc.auth.localLogin` (FORBIDDEN in prod, `routers.ts:33`); `startOAuthLogin` in `client/src/const.ts:15` has zero callers | Wire LoginPage to `startOAuthLogin()`; hide local-login in production |
| 2.2 | PWA icons reference a `/manus-storage/` path needing external forge credentials | `client/public/manifest.webmanifest:12,18`, `client/index.html:13` | Bundle real 192/512 icons (any + maskable) in `client/public/` |
| 2.3 | Analytics script injected with unresolved `%VITE_ANALYTICS_ENDPOINT%` placeholder | `client/index.html:23-26` | Conditional inclusion + fail build when unset |
| 2.4 | No service-worker update flow; `skipWaiting()` swaps assets mid-session | `client/src/main.tsx:11-17`, `client/public/service-worker.js:6,15` | Update prompt via `registration.waiting`; `no-cache` header for `service-worker.js` |
| 2.5 | SW precache is just `["/", manifest]`; Google Fonts unavailable offline; no offline fallback route | `client/public/service-worker.js:2,22-42` | Precache app shell + entry CSS/JS, add offline fallback page, self-host or runtime-cache fonts |
| 2.6 | Zero code splitting — one ~852 KB JS bundle for 17 pages | `client/src/App.tsx:5-22` static imports | `React.lazy` + Suspense per route; vendor chunks |
| 2.7 | ~3.85 MB unoptimized banner PNGs (+ duplicate root `/public` copies) | `client/public/learn_banner.png`, `shops_banner.png` | Compress to WebP at display size; delete stray root `public/` |
| 2.8 | Error boundary renders raw stack traces; query errors invisible to users | `client/src/components/ErrorBoundary.tsx:36-39`, `main.tsx:36,44` | Friendly message in prod (stack dev-only); error-reporting hook; global QueryCache error toast |
| 2.9 | `maximum-scale=1` blocks pinch-zoom (WCAG 1.4.4) | `client/index.html:8` | Remove; formal a11y audit stays in Phase 5 |
| 2.10 | Preview bearer-token mirror forwards `sessionStorage["manus-cookie"]` on every request | `client/src/main.tsx:53-71` | Strip or env-gate |

## Phase 3 — Payments go-live readiness (~1–2 weeks, gated on business decisions)

The domain model is solid (quote → consent → intent → verify → reconcile), but **no money can actually move and the generic callback can mint paid orders**:

| # | Item | Evidence | Fix |
|---|---|---|---|
| 3.1 | Generic `/api/payments/:providerCode/callback` trusts one static shared secret and directly marks intents `succeeded` (receipts, paid orders, enrollments) | `server/_core/index.ts:73-90`, `server/db.ts:829-841` | Require per-provider server-side transaction verification (like the Flutterwave path, `server/payments/flutterwave.ts:13-25`) before `succeeded` |
| 3.2 | No checkout initiation code at all — intents are created but nothing calls a provider (no STK push / hosted checkout) | only `FLUTTERWAVE_SECRET_KEY` consumer is verification | Implement initiation flows per adapter (M-PESA Daraja, MTN MoMo, Airtel, Flutterwave hosted checkout) |
| 3.3 | Webhook dedupe is SELECT-then-INSERT — concurrent deliveries double-apply | `server/db.ts:824-825` | Unique constraint on `(providerCode, providerEventId)` + insert-on-duplicate |
| 3.4 | All providers `liveConnected: false`; only Flutterwave has a verification path | `server/payments/catalog.ts:12-18` | Implement + sandbox-certify adapters; keep `liveConnected: false` until end-to-end sandbox tests, threat model, and pilot approval (per `docs/BUILD_STATUS.md`) |

## Phase 4 — Operations & observability (~2–3 days)

| # | Item | Evidence | Fix |
|---|---|---|---|
| 4.1 | No request logging, no error tracking | scattered `console.*` only | pino + request-ID middleware; Sentry (server + client, wired to Phase 2.8) |
| 4.2 | DB pool unconfigured | `server/db.ts:50` — default drizzle pool | Explicit `mysql2.createPool` with `connectionLimit`, `connectTimeout`, `enableKeepAlive` |
| 4.3 | Migrations applied by hand via `db:push` script | `package.json:13`; 6 SQL files in `drizzle/` | Rename script (`db:migrate`), run migrations in the deploy pipeline, delete stray `drizzle/migrations/` dir |
| 4.4 | Public search loads entire tables and filters in JS, no pagination | `server/db.ts:531-561,638-666` | Push filtering into SQL with LIMIT/OFFSET before user volume grows |
| 4.5 | Health check is meaningless | `server/_core/systemRouter.ts:9-16` | Real readiness probe: DB ping + storage config check |

## Phase 5 — Deferred product features (post-launch or pre-scale, per existing docs)

- **Realtime message fan-out** — decision documented in `IMPLEMENTATION_PLAN.md` §9; current poll-based chat is acceptable for beta. Revisit with telemetry.
- **Resumable media uploads + streaming/CDN video** — 8 MB base64 upload limit is a deliberate beta constraint; direct-to-S3 presigned uploads also dissolve the 50 MB JSON body problem (Phase 1.2).
- **Formal accessibility audit** — baseline is good (focus states, aria-live, labels); needs a real AT audit before launch.
- **Business/compliance inputs for payments** — launch countries, legal entity, KYC/AML, refund policy (IMPLEMENTATION_PLAN.md §12). Blocks Phase 3 completion.

---

## Suggested execution order

1. **Now:** rotate leaked credentials (0.9) → Phase 0 → Phase 1 (security) — nothing ships publicly before 1.1–1.10.
2. **Then:** Phase 2 (client correctness, especially 2.1 login) so a real user can actually sign in and install the PWA.
3. **Then:** Phase 4 (observability) before any public beta traffic.
4. **Phase 3** in parallel with business/legal workstreams; **Phase 5** after launch.

## Verification gate (mirrors IMPLEMENTATION_PLAN.md §11)

`pnpm check` ✓ (passing today) · `pnpm test` ✗ (2 failures — fix in 0.1) · `pnpm build` (config verified sound) — plus: auth-flow E2E in production mode, PWA install/offline test on device, replayed/malicious webhook test, authorization tests per tRPC mutation (largely covered), and signed media-link tests.
