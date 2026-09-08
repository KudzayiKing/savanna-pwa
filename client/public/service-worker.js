// Bump on every change to this file: the cache name is the only thing that
// tells a returning client its shell is stale.
const CACHE_NAME = "savanna-shell-v42";
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest?v=42",
  "/manifest-light.webmanifest?v=42",
  "/manifest-dark.webmanifest?v=42",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
];

// Runtime cache ceiling. Images are cached opportunistically as the user
// browses, so without a bound this grows without limit on a long-lived
// install. Entries are evicted oldest-first.
const MAX_RUNTIME_ENTRIES = 120;

/**
 * Hashed build output is immutable — Vite puts a content hash in the filename,
 * so a given URL can never change meaning. Serving it cache-first (rather than
 * the network-first path used elsewhere) is what makes a cold offline start
 * work: once the shell has been cached, the app can boot with no network.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/assets/");
}

// Vite's dev server serves mutable modules from these prefixes. They must
// never be served cache-first, and this worker is not registered in dev
// anyway — the guard is here so a stray registration cannot serve stale code.
function isDevModule(url) {
  return (
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/@vite/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/@fs/")
  );
}

function isCacheable(request, url) {
  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    !url.pathname.startsWith("/api/") &&
    !isDevModule(url)
  );
}

async function putSafely(cache, request, response) {
  if (!response || !response.ok) return response;
  // A response body can only be consumed once; the copy is what goes to disk.
  cache.put(request, response.clone()).catch(() => {});
  return response;
}

/**
 * Evicts the oldest runtime entries once the ceiling is passed.
 *
 * Keys are insertion-ordered for `caches` in every browser that implements the
 * spec, so the head of the list is the oldest entry. Only runtime entries are
 * touched — the precached shell is never evicted.
 */
async function trimCache(cache) {
  const keys = await cache.keys();
  const overflow = keys.length - MAX_RUNTIME_ENTRIES;
  if (overflow <= 0) return;
  for (let i = 0; i < overflow; i++) {
    cache.delete(keys[i]).catch(() => {});
  }
}

async function openCache() {
  return caches.open(CACHE_NAME);
}

/**
 * Precache the shell plus whatever hashed assets the shell currently
 * references.
 *
 * The asset list is read from the served HTML rather than hard-coded, so it
 * tracks every build automatically. `addAll` is deliberately avoided: one 404
 * would reject the whole batch and leave the worker without a shell.
 */
async function precacheShell(cache) {
  const urls = new Set(SHELL_URLS);

  try {
    const response = await fetch("/", { credentials: "same-origin" });
    if (response.ok) {
      const html = await response.text();
      for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
        urls.add(match[1]);
      }
    }
  } catch {
    // Offline during install: fall through and cache whatever we can reach.
  }

  await Promise.all(
    Array.from(urls).map(url =>
      cache
        .add(new Request(url, { credentials: "same-origin" }))
        .catch(() => {})
    )
  );
}

self.addEventListener("install", event => {
  event.waitUntil(openCache().then(precacheShell));
  // Do not activate over a running page. The page shows an update prompt once
  // React boots; if React cannot boot, index.html has a manual cache reset.
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "SW_ACTIVATED", cacheName: CACHE_NAME });
      }
    })()
  );
});

self.addEventListener("message", event => {
  // Sent by the page after the user accepts the "new version" prompt.
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (!isCacheable(request, url)) {
    return;
  }

  // Navigation: network first so a deploy is picked up immediately, falling
  // back to the cached shell when offline. The shell is the SPA entry, so the
  // router takes over from there.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await openCache();
        try {
          const response = await fetch(request);
          await putSafely(cache, "/", response);
          return response;
        } catch {
          const cached =
            (await cache.match("/")) || (await cache.match("/index.html"));
          if (cached) return cached;
          return new Response("You are offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  // Immutable hashed assets: cache first. No revalidation, because the
  // filename already encodes the content.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await openCache();
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        await putSafely(cache, request, response);
        return response;
      })()
    );
    return;
  }

  if (request.destination === "font") {
    event.respondWith(
      (async () => {
        const cache = await openCache();
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        await putSafely(cache, request, response);
        await trimCache(cache);
        return response;
      })()
    );
    return;
  }

  if (request.destination === "image") {
    // Stale-while-revalidate: paint the cached image immediately, refresh it in
    // the background so the next visit is current.
    //
    // The response must be threaded through to the end of the chain. It used to
    // end with `.then(() => trimCache(cache))`, which resolved to `undefined`
    // and threw the fetched response away — so on a cache miss the handler fell
    // through to the 504 below even though the network fetch had succeeded.
    // That surfaced as `GET /savanna_new_logo.svg 504 (Offline)` in the console on
    // every first visit, while the image still landed in cache and worked on
    // reload. `trimCache` is now awaited for its side effect only.
    event.respondWith(
      (async () => {
        const cache = await openCache();
        const cached = await cache.match(request);
        const network = fetch(request)
          .then(async response => {
            await putSafely(cache, request, response);
            await trimCache(cache);
            return response;
          })
          .catch(() => undefined);

        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        const response = await network;
        if (response) return response;
        // Genuinely unreachable: no cached copy and the network failed.
        return new Response("", { status: 504, statusText: "Offline" });
      })()
    );
    return;
  }

  // Everything else (style, script, document subresources): network first,
  // cache as the offline fallback.
  event.respondWith(
    (async () => {
      const cache = await openCache();
      try {
        const response = await fetch(request);
        await putSafely(cache, request, response);
        await trimCache(cache);
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error("Offline and no cached copy");
      }
    })()
  );
});

function readNotificationPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { notification: { title: "Savanna", body: event.data.text() } };
  }
}

function normalizeNotificationPayload(payload) {
  const notification = payload.notification || {};
  const data = payload.data || notification.data || {};
  const title = notification.title || data.title || "Savanna";
  const body = notification.body || data.body || "You have a new update.";
  const url = data.url || payload.fcmOptions?.link || payload.webpush?.fcmOptions?.link || "/messages";

  return {
    title,
    options: {
      body,
      icon: notification.icon || "/icons/icon-192.png",
      badge: notification.badge || "/icons/icon-192.png",
      tag: notification.tag || data.tag || "savanna-notification",
      renotify: notification.renotify ?? true,
      requireInteraction: notification.requireInteraction ?? false,
      data: {
        ...data,
        url,
      },
    },
  };
}

self.addEventListener("push", event => {
  const payload = readNotificationPayload(event);
  const { title, options } = normalizeNotificationPayload(payload);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/messages", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const matchingWindow = windows.find(client => {
        try {
          return new URL(client.url).pathname === new URL(targetUrl).pathname;
        } catch {
          return false;
        }
      });
      if (matchingWindow) {
        await matchingWindow.focus();
        if ("navigate" in matchingWindow) await matchingWindow.navigate(targetUrl);
        return;
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
