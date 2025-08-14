const CACHE_NAME = 'inspection-app-v1';
const URLS_TO_CACHE = [
  '/', // Din startsida
  '/static/style.css',
  '/static/script.js',
  '/static/images/apab_logo.png'
];

// 1. När Service Workern installeras
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// 2. När appen gör ett nätverksanrop (fetch)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Om vi hittar filen i cachen, returnera den direkt!
        if (response) {
          return response;
        }
        // Annars, försök hämta den från nätverket
        return fetch(event.request);
      }
    )
  );
});

// 3. Hantera uppdateringar av Service Workern
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});