import { startApp } from './game.js';
import { registerServiceWorker } from './core/serviceWorkerManager.js';

registerServiceWorker();
document.addEventListener('DOMContentLoaded', startApp);
