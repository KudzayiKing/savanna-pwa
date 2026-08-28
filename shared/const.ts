export const COOKIE_NAME = "app_session_id";

/**
 * Lifetime of the Supabase refresh-token cookie.
 *
 * Supabase refresh tokens are long-lived by default, but a year is far longer
 * than the window in which a stolen cookie is likely to be noticed. 30 days
 * means a user who signs in at least monthly is never interrupted, while a
 * leaked cookie stops working on its own.
 *
 * The local session JWT is separate and much shorter (7 days, see
 * `SESSION_TTL_MS` in `server/_core/sdk.ts`).
 */
export const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * HttpOnly cookie holding the Supabase refresh token. It is never readable by
 * JavaScript; the server uses it to revoke the session at sign-out so a refresh
 * token cannot outlive the browser session that created it.
 */
export const REFRESH_COOKIE_NAME = "savanna_refresh";

export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
