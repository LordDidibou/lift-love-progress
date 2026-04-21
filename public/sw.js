// FORGE service worker — offline shell + cache des assets et images d'exos
const CACHE = "forge-v1";
const APP_SHELL = ["/", "/app", "/manifest.webmanifest", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Ne jamais cacher les appels Supabase / API (besoin du réseau pour données fraiches)
  if (
    url.hostname.endsWith(".supabase.co") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_serverFn/")
  ) {
    return;
  }

  // Stratégie : network-first pour HTML (toujours récupérer la dernière version si en ligne),
  // cache-first pour assets statiques + images
  const isHTML = req.mode === "navigate" || req.headers.get("accept")?.includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/app"))),
    );
    return;
  }

  // Cache-first pour le reste (JS, CSS, fonts, images)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok && (res.type === "basic" || res.type === "cors")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
    }),
  );
});
