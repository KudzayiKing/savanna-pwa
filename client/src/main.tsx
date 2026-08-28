import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

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

    navigator.serviceWorker.register("/service-worker.js?v=4").catch(error => {
      console.warn("[PWA] Service worker registration failed", error);
    });
  });
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
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
