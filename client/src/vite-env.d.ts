/// <reference types="vite/client" />

/**
 * Typed view of the `VITE_*` variables this app reads.
 *
 * `vite/client` already declares `ImportMetaEnv` with a catch-all index
 * signature, so without this file every `import.meta.env.VITE_FOO` is `any` —
 * a typo in a variable name becomes a silent `undefined` at runtime instead of
 * a compile error. Declaring them here makes a misspelling fail the typecheck.
 *
 * Everything here is public: Vite inlines these values into the client bundle
 * at build time. Never add a secret to this list.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;

  /** Optional. While unset, App Check is off — see `lib/firebase.ts`. */
  readonly VITE_FIREBASE_APP_CHECK_SITE_KEY?: string;
  /** Set to "1" in local development only. */
  readonly VITE_FIREBASE_APP_CHECK_DEBUG?: string;

  /** Prepended to locally-typed phone numbers. Defaults to +263 (Zimbabwe). */
  readonly VITE_DEFAULT_COUNTRY_CODE?: string;
}
