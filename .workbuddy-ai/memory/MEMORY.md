# Savanna PWA — long-term project notes

## Stack
React 19 + TS + Vite 7 + Tailwind 4 + Wouter · Express 4 + tRPC 11 + Drizzle ORM
(MySQL/TiDB) + superjson · esbuild bundles the server · pnpm.

## Static assets live in `client/public/`, NOT the project root
Vite's `publicDir` is `client/public/` (see `vite.shared.ts:18` → `clientPublicDir`).
Firebase Hosting serves from `dist/public` (the Vite build output). **There is
also a `/public` folder at the project root — ignore it**, it's not wired to
either pipeline. When the user drops banner images / favicons / similar into
`/public` thinking that's the right place, they'll show up as broken-image
icons. Copy them to `client/public/` instead. (Happened 2026-09-06 with
`shops_banner_black.png` / `shops_banner_arabic.png` — the old
`shops_banner.png` existed in *both* folders, which is what made the confusion
easy.)

## Standing constraints
- **Never modify the nav or bottom nav** (`SavannaShell.tsx` + nav CSS in
  `index.css`). If `server/pwa.assets.test.ts` fails on nav strings, update the
  test, not the nav.
- `server/pwa.assets.test.ts` = ~200 brittle `toContain()` assertions against raw
  source text. Changing a pinned string means updating the test too.
- Only MVP pages use Firestore — never tRPC (Firebase Hosting is static-only →
  SPA-fallback HTML → `Unexpected token '<'`). tRPC/Express/MySQL only for
  deferred Learn + payments pages; not deployed.

## Backend: Firebase (Supabase dropped)
Direct-to-Firebase from the browser (Auth phone+Google, Firestore, Storage).
Supabase OAuth vars are dead; do not reintroduce. Project `savanna-2caf0`,
hosting `https://savanna-2caf0.web.app`, CLI user `kibaliailabs@gmail.com`.

## Verification / deploy
`npx tsc --noEmit` · `npx vitest run` · `npm run build` ·
`node scripts/check-prod-bundle.mjs`.
`firebase deploy --only firestore:rules,firestore:indexes,hosting` (build first:
`npx vite build` → `dist/public`). Use the **global** `/usr/local/bin/firebase`
(`npx firebase-tools` wedges the shell, exit 127). Storage not initialised yet,
so `--only storage` fails until 'Get Started' is clicked in the console.

## Chat layout: composers sit absolutely over the thread
The thread reserves room via a **measured CSS variable**, never a constant (the
emoji/GIF/sticker tray grows the form ~340px):
- mobile `--savanna-mobile-composer-height`, web
  `--savanna-desktop-composer-height` (ResizeObserver on each form).
- `.savanna-desktop-message-thread` padding-bottom =
  `calc(var(--savanna-desktop-composer-height, 7rem) + 1.5rem)`.
- Trap: a ref declared but never attached fails silently (was
  `desktopThreadRef`). The desktop composer RO effect must be keyed on
  `selected?.id` and sit *after* `const selected =` (TDZ).

## Stickers
Sticker = single `image/webp` attachment + empty payload + filename `sticker-*`
or `/stickers/` URL → renders **bare**, not in a bubble, with a capsule (time +
ticks) beneath. Detector: `stickerMessageAttachment()` in `MessagesPage.tsx`.
CDN `https://pub-610daaff40ac42f18aa2de55bc3970b2.r2.dev/stickers`, managed with
`rclone` remote **`savanna-r2`** (bucket `savanna`, config
`~/.config/rclone/rclone.conf`; ListBuckets 403, prefix ListObjects OK).
Layout `stickers/<Country>_All_Sticker_Packs_512/<category>/<file>.webp`;
`stickers-manifest.json` (id/countryPack/category/path/bytes, all 512 webp).
The country list is derived **dynamically** from the manifest in
`ChatMediaTray.tsx` — new country = upload + manifest entries + optional
`COUNTRY_META` row. Re-upload: `rclone copy <src>
savanna-r2:savanna/stickers/<Pack> --exclude '.DS_Store'`, prune stale entries
**by `countryPack`** (never by id shape — old Zimbabwe pack was
`Savanna_Zimbabwe_Sticker_Pack`, category `PNG_512`), rebuild the manifest from
`rclone lsl`, `rclone copyto` it up. Gotchas: ~145 rapid HEADs → transient 403;
macOS TCC blocks shell reads of `~/Desktop` — have the user `cp -R` to `/tmp`.

## Motion: `framer-motion`, never `motion/react`
Only `framer-motion@12.23.22` is installed. Import from `"framer-motion"`:
`LazyMotion`/`domMin`/`m` for icons (`AnimatedChatIcons.tsx`,
`AnimatedNavIcons.tsx`), plain `motion` + `AnimatePresence` elsewhere
(`MessagesPage.tsx`, `StoriesPanel.tsx`). Always honour `useReducedMotion`.

## Styling: the `!important` trap
`client/src/index.css` pins mobile layout on semantic classes with `!important`
(e.g. `.savanna-mobile-bottom-nav`). `!important` on a longhand beats a
non-important shorthand, so Tailwind `px-*` loses silently. Diagnose: (1) did
the built CSS hash change? (2) grep `index.css` for the class + `!important`;
(3) fix the CSS, not the JSX.

## Firestore rules: no bare type test in a rule a query must satisfy
Rules are not filters — a `list` query is validated against the *query
constraints*. `uid in memberIds` is provable from
`where("memberIds","array-contains",uid)`; a standalone `memberIds is list` is
**not**, so the query is denied. Shipped as a real bug 2026-08-30.
`server/pwa.assets.test.ts` pins the read rule to contain
`request.auth.uid in resource.data.memberIds` and not `is list`.
`npm run test:rules` runs `scripts/firestore-rules-smoke.mjs` in emulators
(needs Java).

## Environment quirks
No `timeout` binary (use background tasks) · `pnpm add` fails with
`ERR_PNPM_CODEBUDDY_BROKER_DENY` (hence hand-rolled `server/_core/security.ts`;
its in-memory rate limiter won't scale — swap for Redis) · backgrounding with
`&` kills it — use `run_in_background: true` · **ports 3000/3001 are other
projects; Savanna dev is 3002** · ignore `contentscript.js`/`evmAsk.js` console
noise (Phantom wallet extension).

## Known unfinished work
- Chat is realtime via Firestore (`useFirebaseConversations` /
  `useFirebaseMessages` `onSnapshot`). Missing: pagination past the 80/120 caps,
  unread counts, typing/presence. Messages stored **plaintext** despite
  `IMPLEMENTATION_PLAN.md` claiming E2EE.
- Video/voice calling and voice-message recording are toast placeholders.
- P0-3: rotate remaining leaked credentials in `.project-config.json`
  (JWT_SECRET already rotated).
