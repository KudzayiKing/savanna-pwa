import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Request } from "express";
import { getPaymentIntentForProviderReference, pingDatabase, recordVerifiedProviderResult } from "../db";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerAiRoutes } from "./aiRoutes";
import { disableFingerprint, errorHandler, securityHeaders, selectLimiter, verifyOrigin } from "./security";
import { registerStorageProxy } from "./storageProxy";

/**
 * Builds the Express application: middleware, payment webhooks and the tRPC
 * router. It deliberately does NOT attach any static-file or Vite middleware —
 * that is the caller's choice, so the production entry point never has the Vite
 * dev toolchain in its import graph.
 *
 * Authentication happens inside tRPC (`auth.*` procedures) rather than through
 * dedicated Express routes: sign-in is a tRPC mutation that verifies a Supabase
 * access token and sets the HttpOnly session cookie in the response.
 */
export async function createApp(): Promise<express.Express> {
  const app = express();

  // Behind a TLS-terminating load balancer, `req.protocol` and `req.ip` are only
  // correct if Express is told to trust the proxy. Without this the session
  // cookie is never marked `secure` in production and rate-limit keys collapse
  // to the proxy's address.
  if (process.env.TRUST_PROXY !== "false") {
    app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));
  }

  disableFingerprint(app);
  app.use(securityHeaders);

  // Health probes go in before the rate limiter: an orchestrator polling every
  // second from several instances would otherwise spend its time being
  // throttled, and a probe that is rate-limited reads as an outage.
  //
  // Two separate probes on purpose. Liveness (`/healthz`) must stay cheap and
  // must never depend on the database — if a slow database made liveness fail,
  // the orchestrator would restart a process that was only waiting on I/O.
  // Readiness (`/readyz`) is the one that checks dependencies.
  app.get("/healthz", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(200).json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
  });

  app.get("/readyz", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const latencyMs = await pingDatabase();
      res.status(200).json({ status: "ok", database: "up", latencyMs });
    } catch (error) {
      console.error("[Health] readiness probe failed:", error);
      // 503 rather than 200: a load balancer that sees 200 will keep sending
      // traffic to an instance that cannot reach its database.
      res.status(503).json({ status: "unavailable", database: "down" });
    }
  });

  // Must run after headers (so the 403 carries them) and before body parsing
  // and rate limiting, so a forged request is rejected before it costs work.
  app.use("/api", verifyOrigin);

  app.use((req, res, next) => selectLimiter(req)(req, res, next));

  const captureRawBody = (req: Request, _res: unknown, buffer: Buffer) => {
    (req as Request & { rawBody?: string }).rawBody = buffer.toString("utf8");
  };

  // Keep the default body limit small. Only the tRPC endpoint accepts large
  // bodies, because it carries base64-encoded media uploads. A 50 MB limit on
  // every route made every endpoint a cheap memory-exhaustion target.
  const smallBody = express.json({ limit: "100kb", verify: captureRawBody });
  const trpcBody = express.json({ limit: "15mb", verify: captureRawBody });

  app.use((req, res, next) => (req.path.startsWith("/api/trpc") ? trpcBody(req, res, next) : smallBody(req, res, next)));
  app.use(express.urlencoded({ limit: "100kb", extended: true }));

  registerStorageProxy(app);
  registerAiRoutes(app);

  // Flutterwave: verifies the raw-body HMAC signature and then re-verifies the
  // transaction server-side against Flutterwave's own API before settling. This
  // is the pattern every provider adapter must follow.
  app.post("/api/payments/flutterwave/callback", async (req, res) => {
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? "";
    const suppliedSignature = req.header("flutterwave-signature") ?? "";
    if (!secretHash) return res.status(503).json({ error: "Flutterwave callbacks are not configured" });
    const expectedSignature = createHmac("sha256", secretHash).update(rawBody).digest("base64");
    const expectedBuffer = Buffer.from(expectedSignature);
    const suppliedBuffer = Buffer.from(suppliedSignature);
    if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return res.status(401).json({ error: "Invalid Flutterwave signature" });
    const payload = req.body as { id?: unknown; data?: { id?: unknown; status?: unknown; tx_ref?: unknown } };
    const providerEventId = typeof payload.id === "string" ? payload.id : "";
    const paymentReference = typeof payload.data?.tx_ref === "string" ? payload.data.tx_ref : "";
    const providerTransactionId = typeof payload.data?.id === "string" || typeof payload.data?.id === "number" ? String(payload.data.id) : "";
    if (!providerEventId || !paymentReference || !providerTransactionId) return res.status(400).json({ error: "Invalid Flutterwave callback payload" });
    try {
      const intent = await getPaymentIntentForProviderReference(paymentReference);
      if (!intent || !intent.providerCode.startsWith("flutterwave_")) return res.status(404).json({ error: "Payment reference is unavailable for Flutterwave" });
      if (payload.data?.status === "successful") {
        const { verifyFlutterwaveTransaction } = await import("../payments/flutterwave");
        const verification = await verifyFlutterwaveTransaction({ transactionId: providerTransactionId, expectedReference: intent.paymentReference, expectedCurrency: intent.currencyCode, expectedTotalMinor: intent.totalMinor });
        if (!verification.successful) return res.status(400).json({ error: "Flutterwave transaction did not match this payment request" });
        await recordVerifiedProviderResult({ providerCode: intent.providerCode, providerEventId, paymentIntentId: intent.id, providerTransactionId: verification.transactionId, state: "succeeded", redactedPayload: JSON.stringify({ type: "flutterwave", eventId: providerEventId, status: "successful" }) });
      } else if (["failed", "cancelled"].includes(String(payload.data?.status))) {
        await recordVerifiedProviderResult({ providerCode: intent.providerCode, providerEventId, paymentIntentId: intent.id, providerTransactionId, state: payload.data?.status === "cancelled" ? "cancelled" : "failed", redactedPayload: JSON.stringify({ type: "flutterwave", eventId: providerEventId, status: payload.data?.status }) });
      } else {
        return res.status(200).json({ accepted: true, ignored: true });
      }
      return res.status(200).json({ accepted: true });
    } catch (error) {
      console.error("[Flutterwave] callback failed", error);
      return res.status(400).json({ error: "Flutterwave callback could not be processed" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Central error handler. Must be registered last so it catches faults from
  // every route above, including body-parser failures (malformed JSON) which
  // would otherwise fall through to Express's default HTML error page — one
  // that echoes the exception message and stack to the caller.
  app.use(errorHandler);

  return app;
}
