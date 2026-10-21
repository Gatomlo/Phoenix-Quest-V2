// Le jeu et le backend sont servis par le même process Express (voir
// server.js : jeu à la racine, API sous /api) — même origine, donc pas de
// domaine à coder en dur ici. En revanche, ce module peut être monté par la
// passerelle node-gateway sous un sous-chemin (ex. /mystere plutôt qu'à la
// racine) : BACKEND_URL doit alors valoir ce préfixe, pas une chaîne vide,
// pour que les appels `${BACKEND_URL}/api/...` visent la bonne sous-app.
//
// Calculé depuis l'URL réelle de CE fichier (import.meta.url, fiable pour un
// module ES, contrairement à document.currentScript qui vaut null pour les
// modules) : ce fichier vit toujours à <racine>/scripts/core/, donc remonter
// de deux niveaux donne la racine de l'app, qu'elle soit servie à "/" ou
// sous "/mystere/". Aucune configuration à coder en dur, ni ici ni côté
// passerelle.
export const BACKEND_URL = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
