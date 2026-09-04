import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider, type Query } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { captureError, installErrorCapture } from "./lib/observability";
import "./index.css";

/**
 * Goes first, before anything else in this module runs.
 *
 * Errors thrown during app boot are the ones most worth capturing and the ones
 * a late-registered handler would miss entirely — a component that throws
 * during the initial render takes the tree down before any effect has had a
 * chance to install a listener.
 */
installErrorCapture();

/**
 * Fades out the pre-React splash overlay declared in index.html.
 *
 * The mark should be on screen long enough to register (min 1.2s from
 * navigation start) but never trap the user behind it (hard cap at 3s, and
 * ErrorBoundary removes it outright on a render failure). The fade transition
 * lives in index.css-adjacent inline styles in index.html; we only add the
 * class and then detach the node once the transition has finished.
 */
function retireSplash() {
  const el = document.getElementById("splash");
  if (!el) return;

  const MIN_DISPLAY_MS = 1200;
  const MAX_DISPLAY_MS = 3000;
  const started = performance.now();

  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    el.classList.add("hide");
    window.setTimeout(() => el.remove(), 600);
  };

  const hideAfterMin = () => {
    window.setTimeout(hide, Math.max(0, MIN_DISPLAY_MS - (performance.now() - started)));
  };
  if (document.readyState === "complete") {
    hideAfterMin();
  } else {
    window.addEventListener("load", hideAfterMin, { once: true });
  }
  window.setTimeout(hide, MAX_DISPLAY_MS);
}

retireSplash();

/**
 * Registers the offline shell, and surfaces updates as a prompt rather than
 * silently swapping the app out from under the running tab.
 *
 * The worker no longer calls skipWaiting() during install. Activating
 * immediately would replace the cached shell while the previous bundle is still
 * executing, so any chunk loaded afterwards would 404 against the new cache.
 * Instead the worker waits, we offer a reload, and the swap happens only once
 * the user accepts.
 */
function registerServiceWorker() {
  // Keep in step with CACHE_NAME in client/public/service-worker.js. The query
  // string is what forces the browser to refetch the worker script rather than
  // serving a cached copy of it.
  const WORKER_URL = "/service-worker.js?v=10";

  // True when this page is already controlled, i.e. this is an update rather
  // than a first install. `controllerchange` fires in both cases, but only the
  // update case should reload — reloading right after a first install would
  // throw away the page the user is already looking at.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(WORKER_URL)
    .then(registration => {
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state !== "installed") return;
          // No controller means this was the first install, not an update.
          if (!navigator.serviceWorker.controller) return;

          toast.message("A new version of Savanna is ready.", {
            action: {
              label: "Reload",
              onClick: () => installing.postMessage({ type: "SKIP_WAITING" }),
            },
            // Stays until the user acts: auto-dismissing would hide the only
            // signal that the app is running an outdated shell.
            duration: Infinity,
          });
        });
      });
    })
    .catch(error => console.warn("[PWA] Service worker registration failed", error));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const isLocalDevHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const isHostedDevPreview = Boolean((window as Window & { __MANUS_HOST_DEV__?: boolean }).__MANUS_HOST_DEV__);

    if (isLocalDevHost || isHostedDevPreview) {
      navigator.serviceWorker.getRegistrations()
        .then(registrations => registrations.forEach(registration => registration.unregister()))
        .catch(error => console.warn("[PWA] Service worker cleanup failed", error));
      if ("caches" in window) {
        caches.keys()
          .then(keys => Promise.all(keys.filter(key => key.startsWith("savanna-shell-")).map(key => caches.delete(key))))
          .catch(error => console.warn("[PWA] Cache cleanup failed", error));
      }
      return;
    }

    registerServiceWorker();
  });
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
  return true;
};

/**
 * Turns a thrown value into something safe to show a user.
 *
 * tRPC `errorFormatter` already redacts 5xx bodies server-side, so a
 * `TRPCClientError` message is safe by construction. A plain `Error` is not:
 * it can carry internal text from client code. Those are replaced with a
 * generic message, and the real one stays in the console.
 */
function userFacingMessage(error: unknown): string {
  if (error instanceof TRPCClientError) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * A query that fails emits an `error` action once per attempt, and the default
 * retry policy is three attempts. Without this, one dead endpoint produces four
 * toasts. Recording the terminal `errorUpdateCount` per query means we surface
 * the failure once, after the last retry has settled.
 */
const reportedQueryFailures = new WeakMap<Query, number>();

function reportQueryError(query: Query, error: unknown) {
  console.error("[API Query Error]", error);
  // Mirrored to Firestore so an admin can see a broken endpoint without having
  // to be the user who hit it. Keyed on the serialised query key, which is the
  // only stable identity a query has across renders.
  captureError("admin.query", error, { queryKey: JSON.stringify(query.queryKey).slice(0, 200) });

  // `fetchStatus === "idle"` means no fetch and no retry are still in flight,
  // i.e. this is the final failure rather than an intermediate attempt.
  if (query.state.fetchStatus !== "idle") return;

  const updateCount = query.state.errorUpdateCount;
  if (reportedQueryFailures.get(query) === updateCount) return;
  reportedQueryFailures.set(query, updateCount);

  if (redirectToLoginIfUnauthorized(error)) return;
  toast.error(userFacingMessage(error));
}

function reportMutationError(error: unknown) {
  console.error("[API Mutation Error]", error);
  captureError("firestore.write", error, {});

  // Mutations do not retry by default, so every error is terminal.
  if (redirectToLoginIfUnauthorized(error)) return;
  toast.error(userFacingMessage(error));
}

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    reportQueryError(event.query, event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    reportMutationError(event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
