export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

/**
 * HttpOnly cookie holding the Supabase refresh token. It is never readable by
 * JavaScript; the server uses it to revoke the session at sign-out so a refresh
 * token cannot outlive the browser session that created it.
 */
export const REFRESH_COOKIE_NAME = "savanna_refresh";

export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
