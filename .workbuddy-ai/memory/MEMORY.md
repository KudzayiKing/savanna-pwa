# Savanna PWA — long-term project notes

## Stack

React 19 + TS + Vite 7 + Tailwind 4 + Wouter · Express 4 + tRPC 11 + Drizzle ORM
(MySQL/TiDB) + superjson · esbuild bundles the server · pnpm.

## Auth & backend: Firebase (Supabase was replaced)

As of 2026-08-29 the app runs **direct-to-Firebase from the browser**: Firebase
Auth (phone + Google), Firestore, and Firebase Storage. Supabase was evaluated
and dropped — do not reintroduce it.

- Firebase project **`savanna-2caf0`**, hosting **https://savanna-2caf0.web.app**
  (also `savanna-2caf0.firebaseapp.com`).
- Firebase CLI is logged in as **kibaliailabs@gmail.com**.
- **Only MVP-reachable pages may use Firestore — never tRPC.** Firebase Hosting
  serves static files only, so any tRPC call gets the SPA fallback HTML back and
  dies with `Unexpected token '<' ... is not valid JSON`. `server/pwa.assets.test.ts`
  enforces this by parsing routes out of `App.tsx`.
- tRPC/Express/MySQL still exist but are only reachable from the deliberately
  deferred surfaces: Learn (`CoursePage`, `LearnPage`, `CreatorStudioPage`) and
  payments (`PaymentsPage`, `PaymentDetailPage`). They are not deployed.

Superseded (kept for history — Manus OAuth was **removed** on 2026-08-28; do not
reintroduce `OAUTH_SERVER_URL`,
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

## Deploying

```
firebase deploy --only firestore:rules,firestore:indexes,hosting
firebase deploy --only storage        # needs Storage enabled in console first
```

Build first (`npx vite build` writes `dist/public`, which hosting serves).
Use the **global** `firebase` binary at `/usr/local/bin/firebase` — invoking
`npx firebase-tools` wedges the shell (exit 127, empty output).
Firebase Storage is **not yet initialised** on the project, so `storage` fails
until someone clicks 'Get Started' in the console.

## Standing constraints

- **Do not modify the nav or bottom nav.** The user redesigned them deliberately.
  `client/src/components/SavannaShell.tsx` and nav/bottom-nav CSS in
  `client/src/index.css` are off-limits — if `server/pwa.assets.test.ts` fails on
  nav strings, update the test, never the nav.
- `server/pwa.assets.test.ts` uses ~200 brittle `toContain()` assertions against raw
  source text. They break on any refactor; converting them to render tests is
  plan item P2-13.

## Styling: the `!important` trap (cost 4 wasted rounds once)

`client/src/index.css` has a **mobile media-query block** that pins layout on
semantic classes with `!important` — e.g. `.savanna-app .savanna-mobile-bottom-nav`
sets `width`, `height`, `border-radius`, and `padding-left/right`.

`!important` on a **longhand** beats a **non-important shorthand** regardless of
specificity, so Tailwind's `px-*` (which emits `padding-inline`) loses silently.
Symptom: the class is in the DOM, the build is clean, nothing moves.

**Diagnostic order when a style tweak does nothing:**

1. Check whether the built CSS hash changed. No delta = the edit changed nothing.
2. Grep `client/src/index.css` for the element's _semantic_ class + `!important`.
3. Fix the value in that CSS rule, not in the JSX.

The bottom-nav inset now lives in `index.css` as `0.5rem !important` (8px,
matching `py-2`); the `px-2` on the element is decorative and the test comment
says so. `server/pwa.assets.test.ts` guards the CSS rule directly.

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

## Firestore rules: never put a bare type test in a rule that a query must satisfy

Security rules are **not filters**: for a `list` query Firestore validates the
rule against the _query's constraints_, not the documents. It can prove
`uid in memberIds` from `where("memberIds", "array-contains", uid)` — but it
**cannot prove a standalone `memberIds is list` type test** from that same
constraint. The unprovable clause is false, so the query is denied.

This shipped as a real bug on 2026-08-30: chat messages sent fine (writes are
single-document, where rules _do_ see the real payload) but never rendered.
Fixed by dropping `is list` from the messages **read** rule only — safe, because
`in` against a non-list field is a type error and denies anyway. `is list` stays
on the **create** rule, where it is provable and useful.

**When you get `Missing or insufficient permissions` on a query:** suspect a
clause the analyser cannot prove from the filters, not the membership logic.
Bisect in the emulator — strip clauses one at a time; if the bare
`signedIn()` variant passes, the query shape is fine and a specific clause is
the culprit.

Verify before theorising: `GET https://firebaserules.googleapis.com/v1/projects/
{project}/releases/cloud.firestore` then fetch the named ruleset, and diff
against the local file. gcloud has no account on this machine; the Firebase
CLI's token is in `~/.config/configstore/firebase-tools.json`.

**Regression guards:** `npm run test:rules` runs `scripts/firestore-rules-smoke.mjs`
against the real rules in the Firestore + Auth emulators (needs Java; jar is
now cached). `server/pwa.assets.test.ts` pins the read rule to contain
`request.auth.uid in resource.data.memberIds` and **not** `is list`.

## Known unfinished work

- Chat runs on Firestore via `client/src/lib/firebaseChat.ts` and **is** realtime
  for the conversation list and the open thread (`useFirebaseConversations` and
  `useFirebaseMessages` both drive `onSnapshot` alongside `useQuery`). Still
  missing: pagination beyond the `limit(80)`/`limit(120)` caps, unread counts,
  and typing/presence.
  Messages are stored **plaintext** despite `IMPLEMENTATION_PLAN.md` claiming E2EE.
- Video/voice calling and voice-message recording are intentional toast
  placeholders ("arrives with the next release") — the animated icons are real,
  the features are not. Do not mistake them for working features.
- P0-3: rotate remaining leaked credentials in `.project-config.json` (JWT_SECRET
  already rotated).
