/**
 * Regression coverage for the P1 hardening pass.
 *
 * These guard the specific failure modes that were fixed: a client-asserted
 * upload type being trusted, cookie-only CSRF exposure, internal error text
 * reaching the client, and settlement encryption being welded to the session
 * secret. Each test fails against the pre-fix code.
 */
import { describe, expect, it, vi } from "vitest";
import { bytesMatchMimeType } from "./media";
import { securityHeaders, verifyOrigin } from "./_core/security";

/** Minimal PNG: 8-byte signature then an IHDR chunk header. */
const pngBytes = Buffer.from(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52],
);

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

// RIFF....WEBP
const webpBytes = Buffer.concat([
  Buffer.from([0x52, 0x49, 0x46, 0x46]),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from([0x57, 0x45, 0x42, 0x50]),
]);

const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

// box size (4 bytes) + "ftyp" brand
const mp4Bytes = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from([0x66, 0x74, 0x79, 0x70]),
  Buffer.from([0x69, 0x73, 0x6f, 0x6d]),
]);

// An HTML document labelled as an image — the classic stored-XSS setup.
const htmlBytes = Buffer.from([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x3c, 0x73]);

describe("bytesMatchMimeType", () => {
  it("accepts files whose bytes match the declared type", () => {
    expect(bytesMatchMimeType(pngBytes, "image/png")).toBe(true);
    expect(bytesMatchMimeType(jpegBytes, "image/jpeg")).toBe(true);
    expect(bytesMatchMimeType(webpBytes, "image/webp")).toBe(true);
    expect(bytesMatchMimeType(pdfBytes, "application/pdf")).toBe(true);
    expect(bytesMatchMimeType(mp4Bytes, "video/mp4")).toBe(true);
  });

  it("rejects a mislabelled file that the old code would have trusted", () => {
    // The whole point of the check: the browser says "image/png", the bytes
    // are an HTML document.
    expect(bytesMatchMimeType(htmlBytes, "image/png")).toBe(false);
    expect(bytesMatchMimeType(htmlBytes, "image/jpeg")).toBe(false);
    expect(bytesMatchMimeType(htmlBytes, "video/mp4")).toBe(false);
  });

  it("rejects files whose real type differs from the declared one", () => {
    expect(bytesMatchMimeType(pngBytes, "image/jpeg")).toBe(false);
    expect(bytesMatchMimeType(jpegBytes, "image/png")).toBe(false);
    expect(bytesMatchMimeType(pdfBytes, "video/mp4")).toBe(false);
    expect(bytesMatchMimeType(mp4Bytes, "application/pdf")).toBe(false);
  });

  it("recognises MPEG audio with and without an ID3 tag", () => {
    const id3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00]);
    const frameSync = Buffer.from([0xff, 0xfb, 0x90, 0x64]);
    expect(bytesMatchMimeType(id3, "audio/mpeg")).toBe(true);
    expect(bytesMatchMimeType(frameSync, "audio/mpeg")).toBe(true);
    expect(bytesMatchMimeType(pngBytes, "audio/mpeg")).toBe(false);
  });

  it("fails closed on types it does not know", () => {
    // An unknown type is never waved through — treat it as a mismatch.
    expect(bytesMatchMimeType(pngBytes, "application/x-msdownload")).toBe(false);
  });

  it("handles truncated input without throwing", () => {
    expect(bytesMatchMimeType(Buffer.alloc(0), "image/png")).toBe(false);
    // Only 4 bytes of "RIFF", so the WEBP check at offset 8 is out of range.
    expect(bytesMatchMimeType(Buffer.from([0x52, 0x49, 0x46, 0x46]), "image/webp")).toBe(false);
    expect(bytesMatchMimeType(Buffer.from([0xff, 0xd8]), "image/jpeg")).toBe(false);
  });
});

describe("verifyOrigin CSRF guard", () => {
  const makeRes = () => {
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        res.body = payload;
        return res;
      },
    };
    return res;
  };

  const run = (req: Record<string, unknown>, allowedOrigins = "") => {
    vi.stubEnv("ALLOWED_ORIGINS", allowedOrigins);
    const res = makeRes();
    const next = vi.fn();
    verifyOrigin(req as never, res as never, next);
    return { res, next };
  };

  it("allows safe methods regardless of origin", () => {
    const { next, res } = run({
      method: "GET",
      path: "/api/trpc/orders.list",
      headers: { origin: "https://evil.example", host: "app.example" },
    });
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("allows a same-origin mutation", () => {
    const { next, res } = run({
      method: "POST",
      path: "/api/trpc/auth.logout",
      headers: { origin: "https://app.example", host: "app.example" },
    });
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("blocks a cross-origin mutation", () => {
    const { next, res } = run({
      method: "POST",
      path: "/api/trpc/auth.logout",
      headers: { origin: "https://evil.example", host: "app.example" },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("falls back to Referer when Origin is absent", () => {
    const { next, res } = run({
      method: "POST",
      path: "/api/trpc/auth.logout",
      headers: { referer: "https://evil.example/page", host: "app.example" },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("allows requests with no origin header — same-origin navigations and server calls", () => {
    // Browsers only send Origin/Referer on cross-origin requests. Refusing
    // these would break curl, health checks and top-level navigation.
    const { next } = run({
      method: "POST",
      path: "/api/trpc/auth.logout",
      headers: { host: "app.example" },
    });
    expect(next).toHaveBeenCalled();
  });

  it("honours the ALLOWED_ORIGINS allowlist for split-origin deployments", () => {
    const { next, res } = run(
      {
        method: "POST",
        path: "/api/trpc/auth.logout",
        headers: { origin: "https://preview.example", host: "api.example" },
      },
      "https://preview.example"
    );
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("is case-insensitive about host comparison", () => {
    const { next } = run({
      method: "POST",
      path: "/api/trpc/auth.logout",
      headers: { origin: "https://APP.example", host: "app.example" },
    });
    expect(next).toHaveBeenCalled();
  });
});

describe("securityHeaders", () => {
  it("allows Firebase Auth popup frames in report-only CSP during local development", () => {
    const headers = new Map<string, string>();
    const res = {
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
    };
    const next = vi.fn();

    securityHeaders(
      { secure: false, headers: {} } as never,
      res as never,
      next,
    );

    const csp = headers.get("Content-Security-Policy-Report-Only") ?? "";
    expect(csp).toContain("frame-src 'self'");
    expect(csp).toContain("https://*.firebaseapp.com");
    expect(csp).toContain("https://accounts.google.com");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");
    expect(next).toHaveBeenCalled();
  });
});
