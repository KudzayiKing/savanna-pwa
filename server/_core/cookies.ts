import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  const secure = isSecureRequest(req);

  // Always `lax`, never `none`.
  //
  // `SameSite=None` sends the session cookie on every cross-site request, which
  // turns any third-party page into a CSRF vector — the cookie rides along with
  // a forged form post or fetch. Savanna's front end is served from the same
  // origin as its API, so there is no legitimate cross-site caller that needs
  // the cookie, and the `Authorization: Bearer` fallback that used to cover
  // embedded webviews is disabled in production (see P1.10).
  //
  // `lax` still sends the cookie on top-level GET navigations, so following a
  // link into the app keeps the user signed in.
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
  };
}
