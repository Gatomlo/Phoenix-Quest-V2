// Le jeu et le backend sont servis par le même process Express (voir
// server.js : jeu à la racine, API sous /api) — même origine, donc une URL
// relative (vide) suffit, en dev comme en prod.
export const BACKEND_URL = '';
