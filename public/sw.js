// Minimální service worker – kvůli instalovatelnosti PWA.
const CACHE = "dms-shell-v3";
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  // stránka pro stav bez připojení se musí uložit dopředu
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(new Request(OFFLINE, { cache: "reload" })))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // smaž staré verze cache (jinak by mohly servírovat zastaralé stránky)
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // HTML navigace necacheovat (vždy ze sítě) – ať se data needrží zastaralá.
  // Když síť není, podstrčíme vlastní stránku místo chyby prohlížeče.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        async () =>
          (await caches.match(OFFLINE)) ||
          new Response("Bez připojení.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          }),
      ),
    );
    return;
  }
  // Ostatní GET: network-first s tichým fallbackem do cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
