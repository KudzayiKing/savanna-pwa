export { COOKIE_NAME, REFRESH_COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";

/**
 * Sends the user to the login page, preserving where they were headed.
 *
 * `next` is validated against open redirects on use (see `getNextPath`), not
 * here, because this only builds the URL.
 */
export const startLogin = () => {
  const currentPath = `${window.location.pathname}${window.location.search}`;
  const next = window.location.pathname !== "/login" ? `?next=${encodeURIComponent(currentPath)}` : "";
  window.location.href = `/login${next}`;
};
