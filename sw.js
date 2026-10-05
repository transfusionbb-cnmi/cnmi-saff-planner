/* CNMI Staff Planner PWA service worker — V599 Stable Navigation + Login */
const WORKER_VERSION = '599';
const CACHE_PREFIX = 'cnmi-staff-planner-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v599`;
const EXTERNAL_CACHE_PREFIX = 'cnmi-external-deps-v';

const CORE_SHELL = [
  './', './index.html', './site.webmanifest?v=599',
  './app-styles-v569.css?v=573', './login-v599.css?v=599',
  './bootstrap-v545-dependency-failover.js?v=545',
  './app-bundle-v569-pre.js?v=569', './app-v545.js?v=591', './app-bundle-v569-01.js?v=591', './app-bundle-v569-05.js?v=599',
  './patch-v570-admin-temp-password-edge.js?v=573',
  './patch-v572-leave-overlap-guard.js?v=572',
  './patch-v574-multi-trade-hr-normalization.js?v=587',
  './patch-v577-ot-attendance-source-export-fix.js?v=585',
  './patch-v578-long-weekend-noduty-quota.js?v=578',
  './patch-v584-approved-tracking-source-of-truth.js?v=587',
  './patch-v585-ot-detail-performance.js?v=585',
  './patch-v587-staff-admin-ot-parity.js?v=587',
  './patch-v588-approval-canonical-parity.js?v=588',
  './patch-v589-trade-chain-net-hours-rate-override.js?v=589',
  './patch-v590-ot-rate-override-persistence.js?v=590',
  './patch-v591-ot-rate-core-persistence.js?v=591',
  './patch-v592-flat-admin-extra-menu.js?v=592',
  './patch-v593-admin-ot-zone-and-guard.js?v=593',
  './patch-v594-cancel-renumber-quota-release.js?v=594',
  './patch-v597-physician-quota-exclusion-safe-startup.js?v=597',
  './patch-v596-physician-leave-daytime-oncall-fix.js?v=597',
  './patch-v599-login-stability-ui.js?v=599',
  './pwa-install-v303.css', './pwa-install-v599.js',
  './patch-v542-single-sidebar-deeplink-controller.js',
  './android-chrome-192x192.png', './android-chrome-512x512.png',
  './apple-touch-icon.png', './favicon-32x32.png', './favicon-16x16.png'
];

async function fetchWithTimeout(request, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_SHELL.map(async (url) => {
      try {
        const request = new Request(url, { cache: 'reload' });
        const response = await fetchWithTimeout(request, 7000);
        if (response?.ok) await cache.put(request, response.clone());
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Never unregister or navigate open tabs during Auth startup.
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => (
      (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      || (key.startsWith(EXTERNAL_CACHE_PREFIX) && key !== 'cnmi-external-deps-v545')
    )).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_OLD_CACHES') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/config.js') || url.pathname.endsWith('config.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const helper = url.pathname.endsWith('/donor-helper.html') || url.pathname.endsWith('donor-helper.html');
      const fallback = helper ? './donor-helper.html' : './index.html';
      try {
        const networkRequest = new Request(request, { cache: 'no-store' });
        const response = await fetchWithTimeout(networkRequest, 4500);
        if (response?.ok) await cache.put(fallback, response.clone());
        return response;
      } catch (_) {
        const cached = (await cache.match(request)) || (await cache.match(fallback));
        if (cached) return cached;
        return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staff Planner</title><style>body{font-family:system-ui,sans-serif;background:#f5f8fa;color:#17324d;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:360px;padding:24px;background:#fff;border:1px solid #dfe8ee;border-radius:18px;text-align:center}button{border:0;border-radius:12px;background:#70b9e3;padding:12px 18px;font-weight:700}</style><div class="box"><h2>Staff Planner</h2><p>เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่</p><button onclick="location.reload()">ลองใหม่</button></div>`, { headers:{'Content-Type':'text/html; charset=utf-8'}, status:200 });
      }
    })());
    return;
  }

  const cacheableDestinations = new Set(['script', 'style', 'image', 'font', 'manifest']);
  if (!cacheableDestinations.has(request.destination)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetchWithTimeout(request, 7000);
      if (response?.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
