/* Atheer Admin – Service Worker
 * Strategy:
 *   - Admin shell files → network-first (fresh code always wins), cache as fallback
 *   - Cross-origin requests (Supabase, CDN, fonts) → pass-through, never cache
 *   - Non-GET requests → pass-through
 */

const BASE = new URL("./", self.registration.scope).pathname;
const CACHE = "atheer-admin-v3";
const SHELL = [
  "", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest"
].map(file => `${BASE}${file}`);

const ORIGIN = self.location.origin;

/* ── Install: pre-cache the admin shell ─────────────────────────────── */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

/* ── Activate: delete old caches ────────────────────────────────────── */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first for local shell; skip cross-origin ─────────── */
self.addEventListener("fetch", event => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  // Never intercept cross-origin requests (Supabase, fonts, CDN)
  const url = new URL(req.url);
  if (url.origin !== ORIGIN) return;

  // Network-first for shell files; cache as fallback only
  event.respondWith(
    fetch(req)
      .then(response => {
        if (!response.ok) throw new Error("network error");
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req))
  );
});
