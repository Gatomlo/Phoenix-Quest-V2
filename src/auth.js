const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COOKIE_NAME = 'phoenix_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// Jetons de session admin gardés en mémoire (pas de "vrai" système
// d'utilisateurs nécessaire pour une V1 mono-admin, cf. cahier des charges).
// Un redémarrage du serveur déconnecte les admins : sans conséquence, ils
// se reconnectent avec le mot de passe.
const activeSessions = new Map(); // token -> expiresAt

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

// Au tout premier démarrage, génère un mot de passe admin aléatoire et
// l'affiche une fois en console plutôt que d'imposer un mot de passe par
// défaut connu de tous ("admin123") qui resterait souvent inchangé.
function ensureAdminPassword() {
  if (getSetting('admin_password_hash')) return;
  const generated = crypto.randomBytes(6).toString('base64url');
  setSetting('admin_password_hash', bcrypt.hashSync(generated, 10));
  console.log('========================================================');
  console.log(' Aucun mot de passe admin défini : mot de passe généré :');
  console.log(' ' + generated);
  console.log(' Changez-le avec : npm run set-password -- <nouveau_mdp>');
  console.log('========================================================');
}

function verifyPassword(password) {
  const hash = getSetting('admin_password_hash');
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

function setPassword(password) {
  setSetting('admin_password_hash', bcrypt.hashSync(password, 10));
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function destroySession(token) {
  activeSessions.delete(token);
}

function isValidSession(token) {
  const expiresAt = activeSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token && isValidSession(token)) return next();
  res.status(401).json({ error: 'Authentification admin requise' });
}

module.exports = {
  COOKIE_NAME,
  ensureAdminPassword,
  verifyPassword,
  setPassword,
  createSession,
  destroySession,
  requireAdmin
};
