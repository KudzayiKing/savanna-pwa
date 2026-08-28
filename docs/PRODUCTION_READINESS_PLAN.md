# Savanna PWA — Production Readiness Plan

**Date:** 2026-08-28
**Scope:** Everything between the current codebase and a safe public launch.
**Method:** Every finding below was verified against the source or by executing the code. Items marked *(measured)* were reproduced in this session.

---

## 0. Verification baseline

Ran the full gate today. Results:

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** — clean, no errors |
| Tests | `npx vitest run` | **18/19 pass, 1 FAIL** — `server/pwa.assets.test.ts:136` |
| Client build | `vite build` | **PASS** — 2173 modules, 32.8s |
| Server bundle | `esbuild dist/index.js` | **PASS** — 127.5 kb |
| **Production boot** | `NODE_ENV=production node dist/index.js` | **FAIL** — see P0-1 |

Build artifacts *(measured)*:

| Artifact | Size | Note |
|---|---|---|
| `dist/public/index.html` | **368.5 kB** | **99.6 % of it (367,094 B) is an inline `manus-runtime` script** |
| `dist/public/assets/index-*.js` | **852.3 kB** (230.9 kB gzip) | single chunk, no code splitting |
| `dist/public/assets/index-*.css` | 202.6 kB (29.3 kB gzip) | |
| `dist/public/learn_banner.png` | 1.8 MB | unoptimized |
| `dist/public/shops_banner.png` | 1.9 MB | unoptimized |

Build warnings *(measured)*: `%VITE_ANALYTICS_ENDPOINT%` and `%VITE_ANALYTICS_WEBSITE_ID%` are not defined — the placeholders ship verbatim into the production HTML.

**Bottom line:** the application is feature-complete for a beta and the domain model is sound, but it is **not currently deployable**. There is one hard startup crash, one broken login path, one leaked-credential incident, and several exploitable endpoints. None of these are visible from `tsc` or the test suite.

Severity legend: **P0** = blocks any public deploy · **P1** = blocks public beta · **P2** = blocks scale/quality · **P3** = gated on business decisions.

---

## P0 — Launch blockers

### P0-1 · The production server crashes on startup *(measured, reproduced)*

**This is the single most important finding, and no existing check catches it.**

With a production-only install (`pnpm install --prod` / `NODE_ENV=production npm ci --omit=dev`), the built server dies instantly:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite'
imported from /app/dist/index.js
```

**Root cause.** `server/_core/index.ts:10` statically imports `serveStatic, setupVite` from `./vite`. `server/_core/vite.ts:7` statically imports `viteConfig from "../../vite.config"`, and `vite.config.ts` imports `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `@builder.io/vite-plugin-jsx-loc` and `vite-plugin-manus-runtime`. **All five are `devDependencies`** (verified against `package.json`). esbuild bundles `vite.config.ts` into the server bundle and hoists its imports to the top level, so the entire Vite dev toolchain is a hard startup dependency of the production server.

**Fix (validated end-to-end in this session).** Two changes:

1. In `server/_core/vite.ts`, replace the static `import { createServer as createViteServer } from "vite"` with a lazy `await import("vite")` **inside** `setupVite()`.
2. Remove `import viteConfig from "../../vite.config"` from `vite.ts` and inline the minimal dev-server options, so `vite.config.ts` (and its four plugin packages) never enter the server graph.

I tested the naive alternative first — making only the `./vite` import dynamic — and **it does not work**; esbuild still hoists the external `vite` import. The version above was rebuilt and executed in a vite-less environment and booted cleanly (`BOOTED OK`), while the current `dist/index.js` failed in the same environment. `--splitting` also works but changes the build config and emits extra chunks; the two-step source fix is preferred.

**Regression guard:** add a CI job that runs `pnpm install --prod && node dist/index.js` in a clean container. Without this, the bug returns silently.

---

### P0-2 · Login is broken in production — **RESOLVED (Supabase)**

**Was:** `LoginPage.tsx` submitted `trpc.auth.localLogin`, hard-blocked in production unless `ENABLE_LOCAL_AUTH=true`; the OAuth entry point `startOAuthLogin` had zero callers and `server/_core/oauth.ts` was unreachable from any UI. No user could sign in to a production deployment.

**Now:** the Manus OAuth integration is **deleted** (`server/_core/oauth.ts`, `server/_core/types/manusTypes.ts`) and replaced with Supabase as the sole identity provider:

- `server/_core/supabase.ts` — GoTrue REST client and token verification
- `server/_core/sdk.ts` — `createSessionFromSupabaseToken()` verifies the Supabase token, then mints a short-lived HttpOnly session cookie
- `server/routers.ts` — `auth.signIn` / `signUp` / `requestPasswordReset` / `completePasswordReset` / `logout` / `me`
- `client/src/pages/LoginPage.tsx` — email + password, sign-up, and recovery flows
- `users.openId` is namespaced `supabase:<uuid>`

**Two design points worth preserving:**

1. **The browser never holds the Supabase token.** It hands the access token to `auth.signIn` once; the server verifies it and returns an HttpOnly cookie. The refresh token is also HttpOnly (`savanna_refresh`), so no token is reachable from JavaScript. Server-side sign-out rotates and revokes it so it cannot outlive the session.
2. **Token verification dispatches on the `alg` header, not on configuration.** Supabase issues either legacy HS256 tokens or current asymmetric (ES256) ones verified against `/auth/v1/.well-known/jwks.json`. Projects created after the signing-keys rollout use ES256 **while still displaying the legacy secret in the dashboard**, so the dashboard is not a reliable signal. Verifying an ES256 token as HS256 rejects every user. `verifySupabaseAccessToken()` reads `alg` from the token and routes to the JWKS path or the legacy path accordingly.

**Verified end-to-end:** `/api/trpc/auth.me` returns `null` unauthenticated; `auth.signIn` with bad credentials returns the mapped `Incorrect email or password.` (proving the GoTrue call and error mapping both work against the live project).

---

### P0-3 · Live credentials are sitting in the working tree

`.project-config.json` contains a TiDB connection string **with password**, `JWT_SECRET`, `BUILT_IN_FORGE_API_KEY`, `VITE_FRONTEND_FORGE_API_KEY`, `OWNER_OPEN_ID` and a git remote token. It is gitignored today, but it is one `git add -f` or one loose archive from exposure, and `.gitignore` is the only thing protecting it.

**Status:** `JWT_SECRET` has been rotated — `.env` now holds a freshly generated value (`openssl rand -base64 48`), so the leaked secret no longer signs sessions. **The remaining values still need rotating.**

Fix: **rotate every one of these values now** — treat them as compromised regardless of whether they were ever pushed. Then move them into a real secret manager and add a pre-commit secret scanner (gitleaks/trufflehog) so this cannot recur.

---

### P0-4 · The generic payment callback can mint paid orders and course access

`server/_core/index.ts:73-90` accepts any POST to `/api/payments/:providerCode/callback` authenticated by a single static shared secret in a header, then calls `recordVerifiedProviderResult` with `state: "succeeded"`. That function (`server/db.ts:838-848`) issues a receipt, flips the order to `paid`, or activates a course enrollment. Anyone holding `PAYMENT_WEBHOOK_SECRET` can grant themselves any paid entitlement with one request.

This is deliberately *not* how the Flutterwave path works — `server/_core/index.ts:58-62` correctly re-verifies server-side against the provider API before settling. The generic path bypasses that discipline.

Fix: delete the generic callback, or gate it to `NODE_ENV !== "production"`. Every provider must verify server-side (reference, currency, amount) against its own API before `succeeded`.

---

### P0-5 · No security headers, no rate limiting, 50 MB request bodies

`server/_core/index.ts:33-40` is bare Express: no `helmet`, no `trust proxy`, no rate limiter, and a **50 MB** JSON/urlencoded limit applied to *every* route, including login.

Fix: `helmet()` with a CSP; `app.set("trust proxy", 1)` (required for correct `req.protocol` behind a TLS-terminating load balancer); `express-rate-limit` globally plus strict limits on auth, upload and webhook routes; default body limit ~100 KB with a large limit scoped to upload routes only.

---

### P0-6 · Storage proxy is an unauthenticated presign relay

`server/_core/storageProxy.ts:5-47` exposes `GET /manus-storage/*` with no authentication. Any caller who knows or guesses an object key gets a signed URL for it. Private chat attachments and paid lesson videos live under exactly those keys (`server/db.ts:326`, `server/db.ts:712-725`), so this defeats the membership and enrollment checks that gate them elsewhere.

Fix: require an authenticated session, then enforce object-level authorization (conversation membership for chat media, active enrollment for lesson assets) before redirecting.

---

## P1 — Security hardening (before public beta)

| # | Issue | Evidence | Fix |
|---|---|---|---|
| 1.1 | Cookie is `SameSite=None` in production, and no Origin check on mutations — CSRF exposure | `server/_core/cookies.ts:47`; `:11-22` trusts `x-forwarded-proto` without `trust proxy` | `SameSite=Lax` in production + Origin/Referer verification on tRPC mutations |
| 1.2 | JWT falls back to a known dev secret in any non-`production` NODE_ENV (e.g. staging) | `server/_core/sdk.ts:158-166` | Require a real secret whenever not a local dev build; fail closed |
| 1.3 | Local auth is an account-forging backdoor if the flag leaks to prod | `server/routers.ts:31-54` — sign in as any email, no password | Compile-time exclusion from the production bundle |
| 1.4 | Sessions last 1 year, never rotate, and the JWT survives logout | `shared/const.ts:2`; `routers.ts:60-64` clears the cookie only | Shorten to ~30 days, add token versioning tied to device-session revocation, invalidate server-side on logout |
| 1.5 | Database fails silently; server boots happily with no `DATABASE_URL` | `server/db.ts:47-62`; `upsertUser` no-ops when DB is null | Startup validation for `DATABASE_URL`/`JWT_SECRET`; make `upsertUser` throw |
| 1.6 | Upload `mimeType` is client-asserted, never checked against bytes | `server/routers/social.ts:30-32`; `server/db.ts:319-333` | Sniff magic bytes server-side and validate against the declared type |
| 1.7 | Internal errors leak to clients | raw `error.message` at `server/_core/index.ts:70,88`; no `formatError`/`onError` in `server/_core/trpc.ts:6-8` | tRPC error formatter + central Express error handler; sanitise 5xx |
| 1.8 | Settlement encryption key is derived from `JWT_SECRET` — rotating the session key destroys settlement data | `server/db.ts:459-464` | Dedicated `SETTLEMENT_ENCRYPTION_KEY` |
| 1.9 | Webhook dedupe is SELECT-then-INSERT; concurrent deliveries double-apply | `server/db.ts:824-825` | Unique constraint on `(providerCode, providerEventId)` + insert-on-duplicate |
| 1.10 | `Bearer` token fallback lets a leaked token bypass the cookie | `server/_core/sdk.ts:276-281`, fed by `client/src/main.tsx:53-71` | Strip the preview token mirror in production |

---

## P2 — Client, PWA and performance

| # | Issue | Evidence | Fix |
|---|---|---|---|
| 2.1 | **367 kB inline `manus-runtime` script dominates the HTML** — 99.6 % of `index.html`, evaluated on every page load before the app | *(measured)* `dist/public/index.html` | Gate `vitePluginManusRuntime` behind `import.meta.env.DEV` in `vite.config.ts:153`. Single largest perf win available |
| 2.2 | No code splitting — one 852 kB JS bundle for 17 pages | *(measured)*; `client/src/App.tsx:5-22` static imports | `React.lazy` + Suspense per route; vendor chunks |
| 2.3 | Analytics script ships with an unresolved placeholder | *(measured)* `src="%VITE_ANALYTICS_ENDPOINT%/umami"` in built HTML | Conditional inclusion; fail the build when unset |
| 2.4 | PWA icons point at `/manus-storage/…`, which needs external forge credentials | `client/public/manifest.webmanifest:12,18`; `client/index.html:13` | Bundle real 192/512 icons (any + maskable) into `client/public/` |
| 2.5 | Service worker: precache is only `["/", manifest]`, `skipWaiting()` swaps assets mid-session, no update prompt, fonts unavailable offline | `client/public/service-worker.js:2,6,22-42`; `client/src/main.tsx:11-17` | Precache app shell + entry assets, `no-cache` header on the SW, update prompt via `registration.waiting`, offline fallback page |
| 2.6 | `maximum-scale=1` blocks pinch-zoom (WCAG 1.4.4) | `client/index.html:8` | Remove |
| 2.7 | 3.7 MB of unoptimized PNG banners | *(measured)* 1.8 MB + 1.9 MB | Convert to WebP at display size; delete the stray root `/public` copies |
| 2.8 | Error boundary renders raw stack traces; query failures are invisible to users | `client/src/components/ErrorBoundary.tsx:36-39`; `main.tsx:36,44` | Friendly message in prod (stack dev-only); global QueryCache error toast |
| 2.9 | Template/dev leftovers ship or linger | `dist/public/__manus__/debug-collector.js` (25 kB, file ships though the script tag is correctly gated); `template.json`; `vite.config.ts.bak`; `.manus/`; `.DS_Store` | Remove from `client/public` and git; extend `.gitignore` |
| 2.10 | Stray dev dependencies | `package.json:91` accidental `add`; `:95` redundant `pnpm` | Remove both |
| 2.11 | Manus-only Vite plugins run in production builds | `vite.config.ts:153` (`jsxLocPlugin`, manus runtime); `:173-181` `.manuspre.computer` host allowlist | Gate behind `import.meta.env.DEV`; drop the host allowlist |
| 2.12 | Unrouted dead code in the bundle | `client/src/pages/ComponentShowcase.tsx` (1437 lines, unreferenced), `Map.tsx`, `AIChatBox.tsx`, `ManusDialog.tsx` | Delete unreferenced files |
| 2.13 | 1 failing test breaks any CI gate | `server/pwa.assets.test.ts:136` asserts a stale CSS string | Replace brittle string assertions with structural assertions (or delete) |

---

## P3 — Operations and observability

| # | Issue | Evidence | Fix |
|---|---|---|---|
| 3.1 | No request logging, no error tracking | scattered `console.*` only | pino + request-ID middleware; Sentry on server and client (wire to 2.8) |
| 3.2 | Database pool entirely unconfigured | `server/db.ts:50` — default drizzle pool | Explicit `mysql2.createPool` with `connectionLimit`, `connectTimeout`, `enableKeepAlive` |
| 3.3 | Migrations applied by hand via `db:push`; stray `drizzle/migrations/` dir | `package.json:13`; 6 SQL files in `drizzle/` | Rename to `db:migrate`, run in the deploy pipeline, delete the stray dir |
| 3.4 | Health check is meaningless — always `{ ok: true }` | `server/_core/systemRouter.ts:9-16` | Real readiness probe: DB ping + storage config check |
| 3.5 | Public search loads whole tables and filters in JS | `server/db.ts:531-561, 638-666` | Push filtering into SQL with `LIMIT`/`OFFSET` |
| 3.6 | No CI, no README, no `engines`, no Dockerfile | *(measured)* — no `.github/`, no `Dockerfile`, no `README` | GitHub Actions running `pnpm check && pnpm test && pnpm build` **plus the P0-1 prod-boot check**; `engines.node >= 22`; README covering setup, env, migration, deploy |
| 3.7 | No documented environment contract | 14 env vars discoverable only by grep | `.env.example` + README section |

---

## P4 — Payments go-live (gated on business decisions)

The domain model is genuinely solid — quote → consent → intent → verify → reconcile is the right shape. What is missing is the ability to move money and the safeguards around it.

| # | Issue | Evidence | Fix |
|---|---|---|---|
| 4.1 | Generic callback trusts a static secret and settles directly | `server/_core/index.ts:73-90`, `server/db.ts:829-841` | Covered by P0-4 |
| 4.2 | **No checkout initiation exists at all** — intents are created but nothing ever calls a provider | only `FLUTTERWAVE_SECRET_KEY` consumer is the verification path | Implement initiation per adapter (M-PESA Daraja STK push, MTN MoMo, Airtel, Flutterwave hosted checkout) |
| 4.3 | All providers `liveConnected: false`; only Flutterwave has a verification path | `server/payments/catalog.ts:12-18` | Implement and sandbox-certify adapters; keep `liveConnected: false` until end-to-end sandbox tests, threat model and pilot approval |
| 4.4 | Business inputs unresolved | `IMPLEMENTATION_PLAN.md` §12 | Launch countries, legal entity, KYC/AML, refund/dispute policy, merchant-verification standard |

---

## Execution order

1. **Immediately:** rotate the leaked credentials (P0-3). This is independent of everything else and should not wait for a code change.
2. **Sprint 1 — make it deployable:** P0-1 (startup crash), P0-2 (login), P0-5 (headers/rate limits), P0-6 (storage proxy), P0-4 (payment callback). Add the prod-boot CI check.
3. **Sprint 2 — make it safe:** P1 in full. Nothing takes public traffic before 1.1–1.10 are done.
4. **Sprint 3 — make it fast and installable:** P2, especially 2.1 (the 367 kB inline runtime) and 2.2 (code splitting).
5. **Sprint 4 — make it operable:** P3 before any real beta traffic.
6. **Parallel business workstream:** P4 alongside legal/compliance.

---

## Definition of done

Current status → target:

| Gate | Now | Target |
|---|---|---|
| `tsc --noEmit` | ✅ pass | ✅ pass |
| `vitest run` | ❌ 18/19 | ✅ 19/19 |
| `vite build` | ✅ pass | ✅ pass, no unresolved env placeholders |
| `node dist/index.js` under `--omit=dev` | ❌ **crash** | ✅ boots |
| Sign-in round trip in production mode | ❌ **broken** | ✅ works |
| Security headers + rate limits | ❌ | ✅ present |
| Payment callback forgery test | ❌ **exploitable** | ✅ rejected |
| Unauthenticated private-media fetch | ❌ **succeeds** | ✅ rejected |
| `index.html` size | 368 kB | < 10 kB |
| Largest JS chunk | 852 kB | < 250 kB |
| CI | ❌ none | ✅ green on check + test + build + prod-boot |
| Live credentials in tree | ❌ present | ✅ rotated, scanned |
