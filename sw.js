/* CNMI Staff Planner PWA service worker — V316 */
const CACHE_PREFIX = 'cnmi-staff-planner-pwa-';
const CACHE_NAME = `${CACHE_PREFIX}v316`;
const APP_SHELL = [
  './', './index.html', './site.webmanifest', './style.css', './app.js',
  './pwa-install-v303.css', './pwa-install-v303.js',
  './patch-v315-interaction-preload.js',
  './patch-v316-egress-preload.js',
  './patch-v316-navigation-preload.js',
  './patch-v316-route-loader.js',
  './patch-v227-manual-as-blood-bank-zone.js',
  './patch-v313-app-count-filter-pwa-trade-fix.js',
  './patch-v314-admin-ot-calendar-ch4-fix.js',
  './patch-v275-admin-manual-ui-corrections.js',
  './patch-v278-slot-stats-holiday-balance-navigation-fix.js',
  './patch-v305-mobile-app-scroll-and-position-description.js',
  './android-chrome-192x192.png', './android-chrome-512x512.png',
  './maskable-icon-192x192.png', './maskable-icon-512x512.png',
  './apple-touch-icon.png', './favicon-32x32.png', './favicon-16x16.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.endsWith('/config.js')||url.pathname.endsWith('config.js')) return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response?.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put('./index.html',copy));}
      return response;
    }).catch(async()=>await caches.match(request,{ignoreSearch:true})||await caches.match('./index.html',{ignoreSearch:true})||Response.error()));
    return;
  }
  const cacheableDestinations=new Set(['script','style','image','font','manifest']);
  if(!cacheableDestinations.has(request.destination)) return;
  event.respondWith(fetch(request).then(response=>{
    if(response?.ok&&response.type==='basic'){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}
    return response;
  }).catch(async()=>await caches.match(request)||await caches.match(request,{ignoreSearch:true})||Response.error()));
});
