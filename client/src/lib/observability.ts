import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getFirestoreDb, isFirebaseConfigured } from "./firebase";

/**
 * Client-side error capture.
 *
 * The console is useless for a PWA installed on someone's phone: by the time a
 * user reports that "stories won't upload", the tab is long gone and the stack
 * trace with it. This module copies the failures worth investigating into a
 * Firestore collection an admin can read.
 *
 * Three rules this file must never break, because breaking any one of them
 * turns a diagnostic into an outage:
 *
 *  1. It must never throw. Every path is wrapped; a failure to *record* a
 *     failure must not become a failure itself.
 *  2. It must never recurse. Writing the log is itself a Firestore call, so a
 *     write error has to be swallowed rather than reported — otherwise one
 *     permission-denied becomes an infinite loop of trying to log it.
 *  3. It must never block the caller. Capture is fire-and-forget; nothing in
 *     the product awaits it.
 *
 * The ring buffer is kept in memory so tests and the admin console can inspect
 * recent events without a round trip, and so the app still has a record when
 * Firebase is not configured (local dev, offline).
 */

export type ErrorSeverity = "error" | "warning" | "info";

export type ErrorScope =
  | "admin.mutation"
  | "admin.query"
  | "firestore.permission"
  | "firestore.read"
  | "firestore.write"
  | "storage.upload"
  | "model.load"
  | "model.inference"
  | "auth"
  | "react.render"
  | "app.unhandled"
  | "app.rejection"
  | "worker";

export type CapturedError = {
  id: string;
  scope: string;
  severity: ErrorSeverity;
  message: string;
  /** Present for real Errors. Truncated — a minified React stack is huge. */
  stack: string | null;
  /** Small, flat, JSON-safe details: ids, counts, route. Never PII. */
  context: Record<string, string | number | boolean | null>;
  route: string | null;
  sessionId: string;
  /** Null when nothing is signed in; filled in by setErrorIdentity(). */
  userId: string | null;
  userAgent: string | null;
  createdAt: Date;
  /** True once the entry has been flushed to Firestore. */
  persisted: boolean;
};

const RING_BUFFER_SIZE = 50;

/** Hard cap on writes per session. A render loop must not bill us per frame. */
const MAX_WRITES_PER_SESSION = 20;

/** Identical scope+message inside this window is treated as the same event. */
const DEDUPE_WINDOW_MS = 60_000;

const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;

const buffer: CapturedError[] = [];
const listeners = new Set<(errors: CapturedError[]) => void>();

let sessionId = "";
let currentUserId: string | null = null;
let writesThisSession = 0;
let installed = false;

/** scope+message -> last time it was recorded. */
const recentKeys = new Map<string, number>();

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function enabled() {
  // Vite replaces the expression at build time, so an unset variable is
  // `undefined` rather than a crash — default is on, because the whole point
  // is to hear about failures in the build real users run.
  return import.meta.env.VITE_OBSERVABILITY_ENABLED !== "false";
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Strips anything that looks like a credential out of a message or stack.
 *
 * Logs are visible to every admin and stored indefinitely, so an error that
 * happens to quote a URL — an image upload path, a signed Storage link — must
 * not become a place where tokens leak into a broadly-readable collection.
 */
function redact(value: string) {
  return value
    .replace(/(?:[?&](?:token|access_token|alt|key|signature|sig|password|pwd)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]");
}

function currentRoute() {
  if (typeof window === "undefined") return null;
  return window.location.pathname || null;
}

function browserUserAgent() {
  if (typeof navigator === "undefined") return null;
  return truncate(navigator.userAgent ?? "unknown", 300);
}

function notify() {
  const snapshot = [...buffer];
  // forEach rather than for..of: this file is compiled with the project's
  // default (ES5) target, where iterating a Set requires --downlevelIteration.
  listeners.forEach(listener => listener(snapshot));
}

function shouldPersist(scope: string, message: string) {
  if (!isFirebaseConfigured()) return false;
  if (writesThisSession >= MAX_WRITES_PER_SESSION) return false;

  const key = `${scope}::${message}`;
  const now = Date.now();
  const last = recentKeys.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  recentKeys.set(key, now);
  return true;
}

/**
 * Writes one entry to Firestore.
 *
 * Not exported: callers go through captureError so the dedupe counters and the
 * ring buffer stay authoritative.
 */
async function persist(entry: CapturedError) {
  writesThisSession += 1;
  try {
    await addDoc(collection(getFirestoreDb(), "errorLogs"), {
      scope: entry.scope,
      severity: entry.severity,
      message: entry.message,
      stack: entry.stack,
      context: entry.context,
      route: entry.route,
      sessionId: entry.sessionId,
      userId: entry.userId,
      userAgent: entry.userAgent,
      appVersion: import.meta.env.VITE_APP_VERSION ?? null,
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: serverTimestamp(),
    });
    entry.persisted = true;
    notify();
  } catch {
    // Deliberately silent. Reporting a failed report is the recursion this
    // file exists to prevent, and the in-memory buffer still has the entry.
  }
}

/**
 * Records an error. Safe to call from anywhere, including inside a catch block
 * that is already on fire.
 *
 * `context` is for the handful of facts that make an error actionable — which
 * collection, which id, which step. It is not a general logging sink, and it is
 * deliberately typed to primitives: passing an object would smuggle in fields
 * the security rules do not model, and the write would then be rejected.
 */
export function captureError(
  scope: ErrorScope | string,
  error: unknown,
  context: Record<string, string | number | boolean | null> = {},
): CapturedError | null {
  if (!enabled()) return null;

  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = truncate(redact(raw || String((error as { code?: string })?.code ?? "unknown error")), MAX_MESSAGE_LENGTH);
  const rawStack = error instanceof Error && error.stack ? error.stack : null;

  const entry: CapturedError = {
    id: randomId(),
    scope,
    severity: "error",
    message,
    stack: rawStack ? truncate(redact(rawStack), MAX_STACK_LENGTH) : null,
    context,
    route: currentRoute(),
    sessionId,
    userId: currentUserId,
    userAgent: browserUserAgent(),
    createdAt: new Date(),
    persisted: false,
  };

  buffer.unshift(entry);
  if (buffer.length > RING_BUFFER_SIZE) buffer.length = RING_BUFFER_SIZE;
  notify();

  if (shouldPersist(entry.scope, entry.message)) void persist(entry);

  // Keep the console copy: the network log is for later, this one is for the
  // developer staring at devtools right now.
  if (typeof console !== "undefined") console.error(`[${scope}]`, message, context);

  return entry;
}

/** Same as captureError but for things that are degradations, not failures. */
export function captureWarning(scope: ErrorScope | string, message: string, context: Record<string, string | number | boolean | null> = {}) {
  if (!enabled()) return null;
  const entry = captureError(scope, new Error(message), context);
  if (entry) entry.severity = "warning";
  return entry;
}

export function errorBuffer() {
  return [...buffer];
}

export function subscribeToErrors(listener: (errors: CapturedError[]) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Associates subsequent entries with a signed-in user.
 *
 * Called from the auth hook rather than read from Firestore directly, so the
 * id is whatever the app already believes and no extra read is spent on it.
 */
export function setErrorIdentity(userId: string | null) {
  currentUserId = userId;
}

/**
 * Installs the process-wide handlers. Idempotent — React 18 StrictMode mounts
 * effects twice in development, and registering twice would double-log.
 */
export function installErrorCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  sessionId = randomId();

  window.addEventListener("error", event => {
    // Resource load failures (a missing image) fire here with no error object
    // and are almost always noise; only script errors are worth a log line.
    if (event.error) {
      captureError("app.unhandled", event.error, { source: event.filename ?? null });
    }
  });

  window.addEventListener("unhandledrejection", event => {
    captureError("app.rejection", event.reason, {});
  });
}

/**
 * True for Firestore's permission-denied failures.
 *
 * Worth its own branch because the message means something specific and
 * actionable: the rules and the client disagree. It is almost never a bug in
 * the calling code, so it gets its own scope and its own place in the admin
 * console.
 */
export function isPermissionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "permission-denied" || code === "firestore/permission-denied";
}

/**
 * Wraps a Firestore read/listen failure and rethrows it unchanged.
 *
 * The rethrow matters: callers have their own error UI, and swallowing the
 * error here would turn a visible "could not load" into silent emptiness. This
 * only observes.
 */
export function captureAndRethrow<T>(scope: ErrorScope | string, error: unknown, context: Record<string, string | number | boolean | null> = {}): never {
  captureError(isPermissionError(error) ? "firestore.permission" : scope, error, context);
  throw error;
}
