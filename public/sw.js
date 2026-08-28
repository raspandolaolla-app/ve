// ==============================================================================
// PULSOPLAY — SERVICE WORKER PWA (STABLE & RESILIENT)
// ==============================================================================

const CACHE_NAME = 'pulsoplay-pwa-v2';

// 1. INSTALACIÓN: Instantánea y libre de errores.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. ACTIVACIÓN: Limpieza de versiones obsoletas y toma de control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PulsoPLAY SW] Eliminando caché obsoleta:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. INTERCEPCIÓN DE PETICIONES (FETCH)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // CRÍTICO: Bypassear inmediatamente cualquier método diferente de GET
  if (req.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }

  // CRÍTICO: Bypassear completamente peticiones sensibles o de tiempo real:
  // - Supabase (Auth, Realtime, REST, RPC, Storage, WebSockets)
  // - WebSockets (ws://, wss://)
  // - Wallet, KYC, Pagos, Retiros, API
  if (
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    url.hostname.includes('supabase') ||
    url.pathname.includes('/rest/v1') ||
    url.pathname.includes('/realtime') ||
    url.pathname.includes('/auth') ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('wallet') ||
    url.pathname.includes('kyc')
  ) {
    return; // Permite el paso directo al navegador sin intervención del SW
  }

  // Estrategia Network-First con fallback a caché para recursos estáticos del mismo origen
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          (req.destination === 'document' ||
           req.destination === 'script' ||
           req.destination === 'style' ||
           req.destination === 'image' ||
           req.destination === 'font')
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) {
          return cached;
        }
        if (req.mode === 'navigate') {
          return caches.match('./') || caches.match('index.html');
        }
      })
  );
});

