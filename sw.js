/* CNMI Staff Planner PWA service worker — V544 PWA recovery */
const CACHE_PREFIX = 'cnmi-staff-planner-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v544`;

/* Keep install intentionally small. Previous releases attempted to download hundreds
   of files before activation, so a single slow request could leave mobile PWA on an
   old worker for a long time. Remaining assets are cached on demand. */
const CORE_SHELL = [
  './',
  './index.html',
  './site.webmanifest',
  './style.css',
  './app.js',
  './pwa-install-v303.css',
  './pwa-install-v544.js',
  './patch-v542-single-sidebar-deeplink-controller.js',
  './android-chrome-192x192.png',
  './android-chrome-512x512.png',
  './apple-touch-icon.png',
  './favicon-32x32.png',
  './favicon-16x16.png'
];

async function fetchAndCache(cache, request, options = {}) {
  const req = request instanceof Request
    ? new Request(request, { cache: options.noStore ? 'no-store' : 'reload' })
    : new Request(request, { cache: options.noStore ? 'no-store' : 'reload' });
  const response = await fetch(req);
  if (response && response.ok && response.type !== 'opaque') {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_SHELL.map(async (url) => {
      try {
        const request = new Request(url, { cache: 'reload' });
        const response = await fetch(request);
        if (response?.ok) await cache.put(url, response.clone());
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_OLD_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)));
    })());
  }
});

function isCriticalAsset(url) {
  const path = url.pathname;
  return path.endsWith('/app.js')
    || path.endsWith('/pwa-install-v544.js')
    || path.endsWith('/patch-v136-preauth.js')
    || path.endsWith('/patch-v136-auth-layout-tabs-final.js')
    || path.endsWith('/patch-v137-critical-regression-restore.js')
    || path.endsWith('/patch-v138-password-complete-redirect.js')
    || path.endsWith('/patch-v542-single-sidebar-deeplink-controller.js')
    || path.endsWith('/style.css');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Authentication config must always come from the network and must never be
     satisfied by an old PWA cache. */
  if (url.pathname.endsWith('/config.js') || url.pathname.endsWith('config.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const helper = url.pathname.endsWith('/donor-helper.html') || url.pathname.endsWith('donor-helper.html');
      const fallback = helper ? './donor-helper.html' : './index.html';
      try {
        const response = await fetch(new Request(request, { cache: 'no-store' }));
        if (response?.ok) await cache.put(fallback, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request))
          || (await cache.match(fallback))
          || Response.error();
      }
    })());
    return;
  }

  const cacheableDestinations = new Set(['script', 'style', 'image', 'font', 'manifest']);
  if (!cacheableDestinations.has(request.destination)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    /* Startup/auth assets are network-first. This prevents a new HTML page from
       running an old app.js/auth patch on installed phones. */
    if (isCriticalAsset(url)) {
      try {
        const response = await fetch(new Request(request, { cache: 'no-store' }));
        if (response?.ok && response.type === 'basic') await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request))
          || (await cache.match(url.pathname.replace(/^\//, './')))
          || Response.error();
      }
    }

    /* IMPORTANT: exact request match only. Do not ignore query strings. Older SWs
       used ignoreSearch:true, which could serve app files from another release. */
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response?.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
