// Minimální service worker – kvůli instalovatelnosti PWA.
const CACHE = "dms-shell-v4";
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
  // Data a navigace mezi stránkami (RSC) nechat prohlížeči. Servisní worker
  // u nich nemá co nabídnout a jeho selhání by z nich udělalo síťovou chybu
  // místo běžné odpovědi serveru.
  if (
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc") ||
    req.headers.get("RSC") === "1" ||
    req.headers.get("Next-Router-Prefetch") === "1"
  ) {
    return;
  }

  // Ostatní GET (statické soubory): network-first s tichým fallbackem do cache.
  // Vždycky se musí vrátit Response – `caches.match` při minutí vrací
  // undefined a prohlížeč pak hlásí „Failed to convert value to 'Response'“
  // a celý požadavek označí za síťovou chybu.
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch {
        const hit = await caches.match(req);
        return (
          hit ||
          new Response("", {
            status: 504,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }
    })(),
  );
});
