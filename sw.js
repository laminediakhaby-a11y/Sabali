/* Sabali – permet d'ouvrir le site même sans connexion internet */
var CACHE = 'sabali-v1';
var BASE = ['./', 'index.html', 'remise.js', 'groupe.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASE); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) {
    return Promise.all(k.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname.indexOf('supabase.co') > -1) return; // les données passent toujours par internet

  if (url.origin === location.origin) {
    // Nos fichiers : toujours la dernière version si internet marche, sinon la copie gardée
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(function (res) {
        if (res.ok) { var copie = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copie); }); }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (r) {
          return r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
        });
      })
    );
    return;
  }

  // Polices et bibliothèque Supabase : la copie gardée d'abord
  e.respondWith(
    caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) {
        if (res.ok || res.type === 'opaque') { var copie = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copie); }); }
        return res;
      });
    })
  );
});
