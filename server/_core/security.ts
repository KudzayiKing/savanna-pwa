import type { Express, NextFunction, Request, Response } from "express";

/**
 * Zero-dependency security middleware.
 *
 * `helmet` and `express-rate-limit` were the first choice, but installing them
 * is not possible in every environment. These cover the same ground and keep
 * the production bundle free of extra dependencies.
 *
 * Deliberate omissions / trade-offs:
 * - The rate limiter is in-memory and per-process. It is correct for a single
 *   instance, which is the current deployment model. Before running more than
 *   one instance, back it with a shared store (Redis) or the limits become
 *   per-instance multiples.
 * - CSP is served as `Content-Security-Policy-Report-Only` by default. The app
 *   currently embeds a large inline script (the manus runtime, see P2-1) and
 *   uses inline styles, so an enforcing policy would break it. Set
 *   `CSP_ENFORCE=true` once that inline script is gone and reports are clean.
 */

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // 'unsafe-inline' is required while the manus runtime is inlined into
  // index.html. Remove it together with that script (P2-1).
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss: ws:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  // Only meaningful over HTTPS, and must not be sent on plain HTTP during local
  // development where it would pin the host for the max-age.
  const isHttps = _req.secure || _req.headers["x-forwarded-proto"] === "https";
  if (isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }

  const enforce = process.env.CSP_ENFORCE === "true";
  res.setHeader(
    enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    CSP_DIRECTIVES,
  );

  next();
}

export function disableFingerprint(app: Express) {
  app.disable("x-powered-by");
}

type RateLimitOptions = {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests per window per key. */
  max: number;
  /** Included in the log line so you can tell which limiter tripped. */
  name: string;
};

type Bucket = { count: number; resetAt: number };

/**
 * Fixed-window limiter. Keys are client IPs; `trust proxy` must be configured
 * for `req.ip` to be meaningful behind a load balancer.
 */
export function createRateLimiter({ windowMs, max, name }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Opportunistic sweep so a long-lived process does not grow unbounded.
  const SWEEP_EVERY = 10_000;
  let requestsSinceSweep = 0;

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";

    if (++requestsSinceSweep >= SWEEP_EVERY) {
      requestsSinceSweep = 0;
      // forEach rather than for..of: the project's TS target predates
      // downlevelIteration of Map.
      buckets.forEach((bucket, bucketKey) => {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      });
    }

    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(max - 1));
      res.setHeader("RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
      next();
      return;
    }

    existing.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Reset", String(Math.ceil(existing.resetAt / 1000)));

    if (existing.count > max) {
      res.setHeader("RateLimit-Remaining", "0");
      res.setHeader("Retry-After", String(Math.ceil((existing.resetAt - now) / 1000)));
      console.warn(`[RateLimit] ${name}: ${key} exceeded ${max} requests per ${windowMs}ms`);
      res.status(429).json({ error: "Too many requests. Please slow down and try again." });
      return;
    }

    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - existing.count)));
    next();
  };
}

/** General API traffic. */
export const apiLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 600, name: "api" });

/** Credential endpoints: brute force and enumeration defence. */
export const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10, name: "auth" });

/**
 * Sign-in specifically. Slightly looser than `authLimiter` because shared egress
 * IPs (offices, mobile carriers) legitimately produce bursts, but still far
 * below the rate needed to brute-force a password.
 */
export const signInLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 25, name: "sign-in" });

/** Provider callbacks: authoritative but replayable, so keep them tight. */
export const webhookLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 120, name: "webhook" });

/** Media uploads are the most expensive endpoints on the server. */
export const uploadLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, name: "upload" });

/**
 * Picks the strictest limiter that applies to a request. tRPC batches many
 * procedures under one path, so the procedure name is matched from the URL.
 */
export function selectLimiter(req: Request): ReturnType<typeof createRateLimiter> {
  const path = req.path;

  // Auth used to live on /api/oauth/*; it is now tRPC procedures. Matching the
  // procedure name also covers batched requests, where one URL carries several.
  if (/auth\.signIn(\b|%2C|,|$)/.test(path)) return signInLimiter;
  if (/auth\.(signUp|requestPasswordReset|resetPassword)/.test(path)) return authLimiter;
  if (path.includes("sendAttachment") || path.includes("uploadLessonVideo")) return uploadLimiter;
  if (path.startsWith("/api/payments")) return webhookLimiter;
  return apiLimiter;
}
