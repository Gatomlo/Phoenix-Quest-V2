// Stratégie de cache (documentée ici pour ne pas avoir à la redéviner) :
//
// - App shell (HTML/CSS/JS/medias génériques) : précaché à l'install, servi
//   en stale-while-revalidate (réponse immédiate depuis le cache + mise à
//   jour silencieuse en arrière-plan pour la prochaine visite). La page
//   d'accueil ("/") est en network-first pour repérer une nouvelle version
//   dès que possible tout en gardant un repli hors-ligne.
// - Assets de scénario (scenarios/**) : jamais précachés en bloc pour tous
//   les scénarios (ça téléchargerait des dizaines de Mo inutiles dès la
//   première visite). Ils sont mis en cache à la demande, dès qu'un
//   scénario est effectivement choisi (voir scripts/core/scenario.js,
//   cacheScenarioAssets), puis servis cache-first. Un scénario une fois
//   chargé reste donc jouable hors-ligne, sans jamais télécharger les
//   scénarios non joués. Ces caches ne sont jamais purgés par une mise à
//   jour de l'app (voir activate ci-dessous).
// - Tout le reste (CDN externes : emailjs, Google Fonts...) : laissé passer
//   au navigateur sans intervention (network-only) : ce ne sont pas des
//   ressources qu'on peut garantir hors-ligne, et les gérer nous-mêmes
//   n'apporterait rien de plus fiable qu'un cache HTTP navigateur standard.
//
// Mise à jour : pas de skipWaiting() automatique. Le nouveau SW reste en
// attente jusqu'à ce que l'utilisateur clique sur "Recharger" dans le
// bandeau (scripts/core/serviceWorkerManager.js), pour ne jamais changer
// de version de code sous les pieds d'une équipe en pleine partie.

const APP_VERSION = 'v6-ui5';
const APP_SHELL_CACHE = 'phoenix-app-shell-' + APP_VERSION;
// Pas de suffixe de version ici : ces caches ne doivent JAMAIS être purgés
// par une mise à jour de l'app (une équipe qui a téléchargé un scénario
// pour le jouer hors-ligne ne doit pas avoir à le retélécharger parce que
// le code de l'appli a changé). Une seule entrée par scénario, nommée
// dynamiquement à partir de l'URL (voir scenarioCacheName ci-dessous).
const SCENARIO_CACHE_PREFIX = 'phoenix-scenario-';

const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/medias/addhint.png',
  '/medias/favicon.png',
  '/medias/logo.png',
  '/medias/logoComplet.png',
  '/medias/noway.png',
  '/medias/removehint.png',
  '/medias/timeout.png',
  '/medias/icon-192.png',
  '/medias/icon-512.png',
  '/medias/icon-maskable-192.png',
  '/medias/icon-maskable-512.png',
  '/medias/apple-touch-icon.png',
  '/scripts/main.js',
  '/scripts/game.js',
  '/scripts/patternlock.js',
  '/scripts/qrCodeReader.js',
  '/scripts/core/state.js',
  '/scripts/core/storage.js',
  '/scripts/core/scenario.js',
  '/scripts/core/timer.js',
  '/scripts/core/serviceWorkerManager.js',
  '/scripts/ui/render.js',
  '/scripts/ui/chrome.js',
  '/scripts/ui/dialogs.js',
  '/scripts/ui/icons.js',
  '/scripts/qr/qrScanner.js',
  '/scripts/locks/index.js',
  '/scripts/locks/buttonLocks.js',
  '/scripts/locks/textLocks.js',
  '/scripts/locks/slidersLock.js',
  '/scripts/locks/diagramLock.js',
  '/scripts/locks/selectorLock.js',
  '/scripts/locks/sonoMeterLock.js',
  '/css/bootstrap.min.css',
  '/css/main.css',
  '/css/patternlock.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      // cache.add() (et non addAll()) fichier par fichier : un seul fichier
      // manquant ne doit pas faire échouer toute l'installation du SW.
      Promise.all(APP_SHELL_FILES.map((url) =>
        cache.add(url).catch((err) => console.warn('[SW] précache impossible pour', url, err))
      ))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name !== APP_SHELL_CACHE && !name.startsWith(SCENARIO_CACHE_PREFIX))
        .map((name) => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

// Déclenché par scripts/core/serviceWorkerManager.js quand l'utilisateur
// confirme la mise à jour depuis le bandeau.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const networkUpdate = fetch(request).then((response) => {
    if (response && response.ok) {
      caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => undefined);
  return cached || (await networkUpdate) || Response.error();
}

// scenarios/<code>/... -> un cache par scénario, jamais versionné/purgé.
function scenarioCacheName(pathname) {
  const match = pathname.match(/^\/scenarios\/([^/]+)\//);
  return SCENARIO_CACHE_PREFIX + (match ? match[1] : 'divers');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // CDN externes : network-only, non géré ici

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE));
    return;
  }

  if (url.pathname.startsWith('/scenarios/')) {
    event.respondWith(cacheFirst(request, scenarioCacheName(url.pathname)));
    return;
  }

  if (url.pathname.startsWith('/scripts/') || url.pathname.startsWith('/css/') || url.pathname.startsWith('/medias/')) {
    event.respondWith(staleWhileRevalidate(request, APP_SHELL_CACHE));
    return;
  }

  // /api/* (données toujours à jour requises) et /admin/* (tableau de bord,
  // pas une ressource du jeu) : laissés passer au réseau sans interception.
  // Avant ce garde-fou, le repli cache-first ci-dessous s'appliquait à TOUTE
  // requête GET non reconnue par manque de portée — un admin ayant aussi
  // ouvert le jeu une fois dans le même navigateur pouvait se retrouver avec
  // un tableau de bord figé sur des données périmées, le cache-first ne
  // revalidant jamais.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) {
    return;
  }

  event.respondWith(cacheFirst(request, APP_SHELL_CACHE));
});
