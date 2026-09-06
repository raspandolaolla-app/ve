// ==============================================================================
// RASPANDO LA OLLA — SERVICE WORKER PWA (RESILIENTE Y SEGURO)
// ==============================================================================

const CACHE_NAME = 'raspando-la-olla-pwa-v3';

// 1. INSTALACIÓN: Activación inmediata del Service Worker.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 2. ACTIVACIÓN: Limpieza de versiones obsoletas y toma de control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[RaspandoLaOlla SW] Eliminando caché obsoleta:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. INTERCEPCIÓN DE PETICIONES (FETCH)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Bypassear inmediatamente cualquier método diferente de GET
  if (req.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }

  // Bypassear peticiones no HTTP/HTTPS o extensiones
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // CRÍTICO: Bypassear completamente peticiones dinámicas, sensibles o de Supabase:
  // - Supabase (Auth, Realtime, REST, RPC, Storage, WebSockets)
  // - Endpoints API (/api)
  // - Encabezados de autorización (Authorization)
  // - Módulos de billetera, KYC, saldo y estado de tablas
  if (
    url.hostname.includes('supabase') ||
    url.pathname.includes('/rest/v1') ||
    url.pathname.includes('/realtime/v1') ||
    url.pathname.includes('/auth/v1') ||
    url.pathname.includes('/storage/v1') ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('wallet') ||
    url.pathname.includes('kyc') ||
    url.pathname.includes('balance') ||
    url.pathname.includes('game_tables') ||
    req.headers.has('Authorization') ||
    req.destination === 'video' ||
    req.headers.has('range') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.webm')
  ) {
    return; // Pasa directo al navegador sin intervención del SW (evita errores 206 en videos)
  }

  // Estrategia Network-First con fallback seguro a Caché
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors') &&
          (req.destination === 'document' ||
            req.destination === 'script' ||
            req.destination === 'style' ||
            req.destination === 'image' ||
            req.destination === 'font')
        ) {
          const responseClone = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => {
              cache.put(req, responseClone).catch(() => {});
            })
            .catch(() => {});
        }
        return networkResponse;
      })
      .catch(async () => {
        // Buscar en caché la petición exacta
        const cached = await caches.match(req);
        if (cached) {
          return cached;
        }

        // Si es navegación HTML, intentar retornar la página principal
        if (req.mode === 'navigate') {
          const mainCached = (await caches.match('./')) || (await caches.match('index.html'));
          if (mainCached) return mainCached;
        }

        // Si es una imagen y no está en caché, intentar retornar logo.svg o favicon.svg
        if (req.destination === 'image') {
          const fallbackLogo = (await caches.match('logo.svg')) || (await caches.match('favicon.svg'));
          if (fallbackLogo) return fallbackLogo;
        }

        // Garantizar SIEMPRE una respuesta válida en lugar de undefined
        return new Response('', {
          status: 404,
          statusText: 'Not Found',
        });
      })
  );
});
