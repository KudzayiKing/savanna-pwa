import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getPaymentIntentForProviderReference, recordVerifiedProviderResult } from "../db";
import { createHmac, timingSafeEqual } from "node:crypto";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb", verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: string }).rawBody = buffer.toString("utf8"); } }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/payments/flutterwave/callback", async (req, res) => {
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
    const rawBody = (req as express.Request & { rawBody?: string }).rawBody ?? "";
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
      return res.status(400).json({ error: error instanceof Error ? error.message : "Flutterwave callback could not be processed" });
    }
  });
  app.post("/api/payments/:providerCode/callback", async (req, res) => {
    const callbackSecret = process.env.PAYMENT_WEBHOOK_SECRET;
    const suppliedSecret = req.header("x-savanna-provider-secret") ?? "";
    if (!callbackSecret) return res.status(503).json({ error: "Payment callbacks are not configured" });
    const expected = Buffer.from(callbackSecret);
    const supplied = Buffer.from(suppliedSecret);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return res.status(401).json({ error: "Callback authentication failed" });
    const providerCode = req.params.providerCode;
    const payload = req.body as { providerEventId?: unknown; paymentIntentId?: unknown; providerTransactionId?: unknown; state?: unknown; redactedPayload?: unknown };
    const paymentIntentId = Number(payload.paymentIntentId);
    if (!Number.isInteger(paymentIntentId) || paymentIntentId <= 0 || typeof payload.providerEventId !== "string" || !["succeeded", "failed", "cancelled"].includes(String(payload.state))) return res.status(400).json({ error: "Invalid callback payload" });
    try {
      const result = await recordVerifiedProviderResult({ providerCode, providerEventId: payload.providerEventId, paymentIntentId, providerTransactionId: typeof payload.providerTransactionId === "string" ? payload.providerTransactionId : undefined, state: payload.state as "succeeded" | "failed" | "cancelled", redactedPayload: typeof payload.redactedPayload === "string" ? payload.redactedPayload : undefined });
      return res.status(result.replay ? 200 : 202).json({ accepted: true, replay: result.replay });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Callback could not be processed" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
