// Enregistrement du service worker + bandeau "nouvelle version disponible".
// Le nouveau SW reste volontairement en attente (pas de skipWaiting
// automatique) tant que l'utilisateur n'a pas cliqué sur "Recharger" :
// une équipe en pleine partie ne doit pas se faire basculer sous les pieds
// vers une nouvelle version du code.
import { BACKEND_URL as BASE } from './backendConfig.js';

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) loadingScreen.style.display = 'none';
}

let userConfirmedUpdate = false;

function showUpdateBanner(waitingWorker) {
  const banner = document.getElementById('updateBanner');
  const reloadButton = document.getElementById('updateReloadButton');
  if (!banner || !reloadButton) return;
  banner.hidden = false;
  reloadButton.addEventListener('click', () => {
    userConfirmedUpdate = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    reloadButton.disabled = true;
  }, { once: true });
}

function watchForUpdates(registration) {
  if (registration.waiting) showUpdateBanner(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;
    newWorker.addEventListener('statechange', () => {
      // "installed" + un controller déjà actif = une mise à jour est prête,
      // pas la toute première installation.
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner(newWorker);
      }
    });
  });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    hideLoadingScreen();
    return;
  }

  // Ne recharge que si l'utilisateur a explicitement confirmé la mise à
  // jour : self.clients.claim() côté SW déclenche aussi ce même événement
  // lors de la toute première installation, ce qui ne doit pas provoquer
  // un rechargement surprise pour un nouveau visiteur.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userConfirmedUpdate) return;
    window.location.reload();
  });

  // Portée explicitement limitée à BASE (plutôt que la portée par défaut,
  // dérivée du dossier du script) : sous une passerelle node-gateway, un
  // service worker sans portée précisée prendrait par défaut tout le
  // domaine, y compris les autres outils montés à côté.
  navigator.serviceWorker.register(BASE + '/service-worker.js', { scope: BASE + '/' })
    .then((registration) => {
      hideLoadingScreen();
      watchForUpdates(registration);
    })
    .catch((error) => {
      hideLoadingScreen();
      console.error('Échec du chargement du service worker:', error);
    });
}
