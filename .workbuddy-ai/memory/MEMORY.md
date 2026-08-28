# Savanna PWA — long-term project notes

## Stack
React 19 + TS + Vite 7 + Tailwind 4 + Wouter · Express 4 + tRPC 11 + Drizzle ORM
(MySQL/TiDB) + superjson · esbuild bundles the server · pnpm.

## Auth: Supabase (sole identity provider)
Manus OAuth was **removed** on 2026-08-28. Do not reintroduce `OAUTH_SERVER_URL`,
`VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`, or `ENABLE_LOCAL_AUTH` —
nothing reads them.

- Credentials live in `.env` (gitignored); template in `.env.example`.
- `server/_core/supabase.ts` = GoTrue REST + token verification.
- Browser never holds a Supabase token: `auth.signIn` swaps it for an HttpOnly
  session cookie (`app_session_id`); refresh token is a separate HttpOnly cookie
  (`savanna_refresh`).
- `users.openId` is namespaced `supabase:<uuid>`.
- **Token verification dispatches on the token's `alg` header** — HS256 uses the
  legacy JWT secret, ES256 uses the project JWKS. Supabase still shows the legacy
  secret in the dashboard even for ES256 projects, so never infer the scheme from
  config. Getting this wrong locks out every user.

## Verification commands
`npx tsc --noEmit` · `npx vitest run` · `npm run build` · `node scripts/check-prod-bundle.mjs`

## Standing constraints
- **Do not modify the nav or bottom nav.** The user redesigned them deliberately.
  `client/src/components/SavannaShell.tsx` and nav/bottom-nav CSS in
  `client/src/index.css` are off-limits — if `server/pwa.assets.test.ts` fails on
  nav strings, update the test, never the nav.
- `server/pwa.assets.test.ts` uses ~200 brittle `toContain()` assertions against raw
  source text. They break on any refactor; converting them to render tests is
  plan item P2-13.

## Environment quirks
- No `timeout` binary (macOS) — use background tasks.
- `pnpm add` fails with `ERR_PNPM_CODEBUDDY_BROKER_DENY` (symlink EEXIST) even with
  the sandbox disabled, so new dependencies generally cannot be installed. That is
  why `server/_core/security.ts` is hand-rolled instead of using helmet.
- Its rate limiter is in-memory and will not work across multiple instances —
  swap for Redis before scaling past one server.
- Backgrounding a server with `&` in a shell call kills it on return; use
  `run_in_background: true`.
- **Ports 3000 and 3001 belong to OTHER projects** (themaraba.ai and a Next.js app).
  Savanna's dev server lands on **3002**. Do not assume 3000 is Savanna.
- If the app "won't load", first check `lsof -nP -iTCP -sTCP:LISTEN` — the dev
  server has usually died, and the browser is pointing at a stale port.
- When diagnosing console errors, ignore `contentscript.js` / `contentScript.js` /
  `evmAsk.js` warnings and `Unchecked runtime.lastError` spam — those are browser
  extensions (Phantom wallet), not app bugs.

## Known unfinished work
- Chat is structurally complete but **not operational**: no polling/realtime of any
  kind, no pagination, no unread counts or previews, no typing/presence. Messages
  are stored **plaintext** despite `IMPLEMENTATION_PLAN.md` claiming E2EE, and the
  `messageKeyEnvelopes` / `conversationSearchTokens` tables do not exist.
- P0-3: rotate remaining leaked credentials in `.project-config.json` (JWT_SECRET
  already rotated).
