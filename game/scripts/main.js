import { startApp } from './game.js';
import { registerServiceWorker } from './core/serviceWorkerManager.js';
import { initChrome } from './ui/chrome.js';

registerServiceWorker();
document.addEventListener('DOMContentLoaded', () => {
  initChrome();
  startApp();
});
