// Reuse this worker for offline navigation and FCM; no competing root scope.
try { importScripts('/firebase-messaging-sw.js'); } catch {}
const CACHE='sheharmitra-offline-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add('/offline.html')));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sheharmitra-offline-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
// Only cache the generic offline explanation. Never cache accounts, API calls, or order data.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
