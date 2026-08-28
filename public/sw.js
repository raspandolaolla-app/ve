// ==============================================================================
// PULSOPLAY — SERVICE WORKER PWA (PROGRESSIVE WEB APP)
// ==============================================================================

const CACHE_NAME = 'pulsoplay-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon.ico'
];

// Instalación e inicio
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PulsoPLAY SW] Cuidado al precargar assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación y limpieza de caches obsoletos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción inteligente de peticiones
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRÍTICO: NUNCA interceptar ni almacenar en cache operaciones sensibles
  // Supabase REST/Realtime, Auth, Wallet, Pagos o endpoints API
  if (
    url.pathname.startsWith('/api') ||
    url.hostname.includes('supabase') ||
    url.pathname.includes('/rest/v1') ||
    url.pathname.includes('/realtime') ||
    url.pathname.includes('/auth') ||
    event.request.method !== 'GET'
  ) {
    return; // Permite que el navegador maneje la petición directamente por red
  }

  // Estrategia Network-First con fallback a cache para la shell PWA
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      })
  );
});
