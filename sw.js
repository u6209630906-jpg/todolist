/* MyniApp â€” service worker.
   Rende le mini app disponibili anche offline: la "shell" (pagine, icone,
   manifest) viene salvata all'installazione, le librerie caricate da CDN e le
   pagine visitate vengono messe in cache al primo uso. Le richieste di rete
   verso i relay (presenza, segnalazione P2P) non vengono mai messe in cache. */

const VERSION = 'myniapp-v7';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

const SHELL_ASSETS = [
  './',
  './index.html',
  './todolist app.html',
  './wishlismini.html',
  './gestore_giornata_gantt.html',
  './filetransfer.html',
  './manifest.webmanifest',
  './pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

// Librerie esterne indispensabili per l'aspetto e per il collegamento diretto:
// le salvo subito cosÃ¬ le app restano utilizzabili anche senza rete.
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/index.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Host che rispondono con dati live (presenza, segnalazione, database): mai in cache.
const NO_CACHE_HOSTS = [
  'ntfy.sh',
  'peerjs.com',
  'firestore.googleapis.com',
  'firebaseio.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com'
];

async function precache(cache, url) {
  try {
    await cache.add(new Request(url, { cache: 'reload' }));
    return;
  } catch (e) { /* niente CORS: provo una richiesta opaca */ }
  try {
    const response = await fetch(new Request(url, { cache: 'reload', mode: 'no-cors' }));
    if (response) await cache.put(url, response);
  } catch (e) { /* risorsa non raggiungibile: la pagina funziona comunque */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Salvo uno per uno: un singolo file mancante non deve annullare l'installazione.
    await Promise.all(SHELL_ASSETS.map((url) => precache(cache, url)));
    await Promise.all(CDN_ASSETS.map((url) => precache(cache, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isCacheable(request, url) {
  if (request.method !== 'GET') return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (NO_CACHE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith('.' + host))) return false;
  if (url.pathname.endsWith('/sse')) return false;
  return true;
}

async function matchCached(cache, request) {
  var hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  // Le risorse esterne possono essere salvate con una modalità diversa da
  // quella usata dalla pagina: riprovo per URL.
  if (typeof request === 'string') return cache.match(request, { ignoreVary: true });
  return cache.match(request.url, { ignoreVary: true });
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await matchCached(cache, request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.open(SHELL_CACHE);
      return (await shell.match('./index.html')) || Response.error();
    }
    throw e;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await matchCached(cache, request);
  const network = fetch(request).then((response) => {
    if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!isCacheable(request, url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});
