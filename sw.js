// Service worker PARKX : garde une copie de l'application pour pouvoir l'ouvrir sans connexion.
// Les données partagées (api.php, dossier donnees) ne passent JAMAIS par ce cache.
const CACHE = 'parkx-v4';
const ASSETS = ['./', './index.html', './PARKX.html', './app/parkx.js', './app/parkx.css', './reglages.js', './perso.css', './logo.webp', './manifest.webmanifest', './parkx-icon-192.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('.php') || url.pathname.includes('/donnees/')) return;
  // Réseau d'abord (les fichiers modifiés sur l'hébergement sont pris en compte), copie locale si hors connexion
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok && r.type === 'basic') {
          const copy = r.clone();
          // une seule copie par fichier, même si l'adresse porte un numéro de version (?v=…)
          caches.open(CACHE).then((c) => c.put(url.search ? url.origin + url.pathname : req, copy));
        }
        return r;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./') : Response.error())))
  );
});
