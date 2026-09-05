# Savanna PWA — long-term project notes

## Chat layout: both composers are absolutely positioned over the thread

The message thread reserves room for the composer as **bottom padding driven by
a measured CSS variable**, on web and mobile alike:

- mobile: `--savanna-mobile-composer-height` (ResizeObserver on the mobile form)
- web: `--savanna-desktop-composer-height` (ResizeObserver on the desktop form)

`.savanna-desktop-message-thread` padding-bottom / scroll-padding-bottom =
`calc(var(--savanna-desktop-composer-height, 7rem) + 1.5rem)`. It must be a
variable, not a constant: opening the emoji/GIF/sticker tray grows the form by
~340px and a fixed pad lets the tray cover the newest messages.

**Known trap:** `desktopThreadRef` was declared but never attached, so
`scrollCurrentThreadToBottom()` silently returned `false` on web. A ref that is
declared but unattached fails silently — grep the ref name and count its usages
before trusting any scroll code. The desktop composer ResizeObserver effect must
be keyed on `selected?.id` (not `selectedConversationId`) and placed *after*
`const selected = ...` (TDZ otherwise).

## Stickers render bare, not in a bubble

A sticker message (single `image/webp` attachment, empty payload, filename
`sticker-*` or URL containing `/stickers/`) renders as a bare image with a small
capsule underneath carrying time + ticks, tinted with the bubble colour.
Detection lives in `stickerMessageAttachment()` in `MessagesPage.tsx`. Dark
theme: outgoing ticks use `dark:text-white/90`, incoming white + `--chat-surface`.

## R2 sticker assets (the sticker CDN)

- Stickers live in Cloudflare R2, served publicly from
  `https://pub-610daaff40ac42f18aa2de55bc3970b2.r2.dev/stickers`.
- Manage via `rclone` (binary `/opt/homebrew/bin/rclone`); config
  `~/.config/rclone/rclone.conf` defines remote **`savanna-r2`** (provider
  Cloudflare, bucket **`savanna`**). ListObjects on a prefix works; ListBuckets
  is 403 (scoped token).
- Convention: `stickers/<Country>_All_Sticker_Packs_512/<category>/<file>.webp`.
  `stickers/stickers-manifest.json` lists every sticker with
  `id`/`countryPack`/`category`/`path`/`bytes`/width/height (all 512, webp).
- The app fetches the manifest and derives the country list **dynamically**
  (ChatMediaTray.tsx builds `countryPack` set from `stickers.data`), so adding a
  country = upload files + add manifest entries + (optionally) a `COUNTRY_META`
  row for its flag/label. Update `COUNTRY_META` whenever a pack's key changes.
- **Re-upload workflow:** `rclone copy <src> savanna-r2:savanna/stickers/<Country>_All_Sticker_Packs_512 --exclude '.DS_Store'`; rebuild the manifest by
  filtering out the old `countryPack` entries and regenerating from
  `rclone lsl savanna-r2:savanna/stickers/<Country>_All_Sticker_Packs_512`
  (size per object; set dims 512/webp), then
  `rclone copyto <new.json> savanna-r2:savanna/stickers/stickers-manifest.json`.
- **Gotchas (2026-09-06):** the old Zimbabwe pack was keyed
  `Savanna_Zimbabwe_Sticker_Pack` (with `Savanna_` prefix) and its `category`
  was literally `PNG_512`. Filtering by `id` prefix missed it — always prune
  stale packs by **`countryPack`**, not by guessing the id shape. A burst of
  ~145 HEAD requests to the public URL returns transient 403 (rate-limit);
  single GETs return 200. macOS TCC blocks the shell from reading `~/Desktop`
  (even with the sandbox off), so have the user `cp -R` source folders to
  `/tmp` before any rclone upload.

## Motion library: `framer-motion`, never `motion/react`

`motion` is **not installed**; only `framer-motion@12.23.22`. Rewrite outside
imports to use `LazyMotion`, `domMin`, `m`, `useAnimation`, `useReducedMotion`,
`Variants` from `"framer-motion"`. Animated icons: `AnimatedChatIcons.tsx`
(chrome), `AnimatedNavIcons.tsx` (nav, checks, send).

## Stack

React 19 + TS + Vite 7 + Tailwind 4 + Wouter · Express 4 + tRPC 11 + Drizzle ORM
(MySQL/TiDB) + superjson · esbuild bundles the server · pnpm.

## Auth & backend: Firebase (Supabase was replaced)

Direct-to-Firebase from the browser: Firebase Auth (phone + Google), Firestore,
Firebase Storage. Supabase was evaluated and dropped — its OAuth vars
(`OAUTH_SERVER_URL`, `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`,
`ENABLE_LOCAL_AUTH`) are dead; do not reintroduce. Firebase project
`savanna-2caf0`, hosting `https://savanna-2caf0.web.app`, CLI logged in as
`kibaliailabs@gmail.com`.

- **Only MVP pages use Firestore — never tRPC** (Firebase Hosting is static-only;
  tRPC calls get SPA-fallback HTML → `Unexpected token '<'`). tRPC/Express/MySQL
  are only for deferred Learn (`CoursePage`, `LearnPage`, `CreatorStudioPage`)
  and payments (`PaymentsPage`, `PaymentDetailPage`), and are not deployed.

## Verification commands

`npx tsc --noEmit` · `npx vitest run` · `npm run build` · `node scripts/check-prod-bundle.mjs`

## Deploying

```
firebase deploy --only firestore:rules,firestore:indexes,hosting
firebase deploy --only storage        # needs Storage enabled in console first
```

Build first (`npx vite build` → `dist/public`). Use the **global** `firebase`
binary at `/usr/local/bin/firebase` (`npx firebase-tools` wedges the shell,
exit 127). Firebase Storage is **not yet initialised**, so `storage` fails until
someone clicks 'Get Started' in the console.

## Standing constraints

- **Do not modify the nav or bottom nav** (`SavannaShell.tsx` + nav CSS in
  `index.css` are off-limits). If `server/pwa.assets.test.ts` fails on nav
  strings, update the test, never the nav.
- `server/pwa.assets.test.ts` uses ~200 brittle `toContain()` assertions against
  raw source text; converting them to render tests is plan item P2-13.

## Styling: the `!important` trap

`client/src/index.css` pins mobile layout on semantic classes with `!important`
(e.g. `.savanna-mobile-bottom-nav` sets width/height/border-radius/padding).
`!important` on a **longhand** beats a non-important **shorthand**, so Tailwind's
`px-*` (`padding-inline`) loses silently. Diagnostic order: (1) did the built CSS
hash change? (2) grep `index.css` for the semantic class + `!important`; (3) fix
the CSS rule, not the JSX.

## Environment quirks

- No `timeout` binary (macOS) — use background tasks.
- `pnpm add` fails with `ERR_PNPM_CODEBUDDY_BROKER_DENY` even with the sandbox
  off, so new deps generally can't be installed (hence hand-rolled
  `server/_core/security.ts` instead of helmet; its in-memory rate limiter won't
  scale — swap for Redis).
- Backgrounding a server with `&` kills it on return — use `run_in_background: true`.
- **Ports 3000/3001 belong to OTHER projects**; Savanna dev server is **3002**.
- Ignore `contentscript.js` / `contentScript.js` / `evmAsk.js` console noise —
  Phantom wallet extension, not app bugs.

## Firestore rules: never put a bare type test in a rule a query must satisfy

Security rules are **not filters**: for a `list` query Firestore validates the
rule against the query's _constraints_, not the documents. It can prove
`uid in memberIds` from `where("memberIds","array-contains",uid)` but **cannot**
prove a standalone `memberIds is list` type test, so the query is denied. This
shipped as a real bug on 2026-08-30 (messages wrote but never rendered); fixed
by dropping `is list` from the **read** rule only. `server/pwa.assets.test.ts`
pins the read rule to contain `request.auth.uid in resource.data.memberIds` and
**not** `is list`. `npm run test:rules` runs `scripts/firestore-rules-smoke.mjs`
in the emulators (needs Java).

## Known unfinished work

- Chat is realtime via Firestore (`useFirebaseConversations`/`useFirebaseMessages`
  drive `onSnapshot` alongside `useQuery`). Missing: pagination past the 80/120
  caps, unread counts, typing/presence. Messages are stored **plaintext** despite
  `IMPLEMENTATION_PLAN.md` claiming E2EE.
- Video/voice calling and voice-message recording are toast placeholders
  ("arrives with the next release") — animated icons are real, features are not.
- P0-3: rotate remaining leaked credentials in `.project-config.json` (JWT_SECRET
  already rotated).
