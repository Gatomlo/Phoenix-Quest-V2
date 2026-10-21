const express = require('express');
const multer = require('multer');
const path = require('path');
const QRCode = require('qrcode');
const db = require('../db');
const auth = require('../auth');
const { generateSessionCode } = require('../codes');
const sse = require('../sse');
const scenarios = require('../scenarios');
const { computeScore } = require('../scoring');

const router = express.Router();
const uploadMapImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 12 * 60 * 60 * 1000
};

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || !auth.verifyPassword(password)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const token = auth.createSession();
  res.cookie(auth.COOKIE_NAME, token, COOKIE_OPTIONS);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  auth.destroySession(req.cookies?.[auth.COOKIE_NAME]);
  res.clearCookie(auth.COOKIE_NAME);
  res.json({ ok: true });
});

router.get('/me', auth.requireAdmin, (req, res) => res.json({ ok: true }));

// Tout ce qui suit nécessite d'être connecté en admin.
router.use(auth.requireAdmin);

// Flux transverse à toutes les sessions : permet au tableau de bord de
// signaler un nouveau message même pour une session qui n'est pas celle
// actuellement affichée (gérer plusieurs sessions en simultané).
router.get('/global-stream', (req, res) => {
  sse.subscribe('admin-global', res);
});

function publicTeam(team) {
  return {
    id: team.id,
    name: team.name,
    currentStepId: team.current_step_id,
    progressPercent: team.progress_percent,
    hintsUsed: team.hints_used,
    elapsedMs: team.elapsed_ms,
    score: team.score,
    startedAt: team.started_at,
    finishedAt: team.finished_at,
    outcome: team.outcome,
    lastSeenAt: team.last_seen_at
  };
}

// Liste des scénarios disponibles (pour la liste déroulante de création de
// session).
router.get('/scenarios', (req, res) => {
  res.json({ scenarios: scenarios.listScenarios() });
});

// Détail complet d'un scénario : sert à afficher le contenu d'une étape
// (nom, image, description) quand l'admin clique sur un événement de
// l'historique, pour voir précisément où en est une équipe.
router.get('/scenarios/:code', (req, res) => {
  const data = scenarios.getScenario(req.params.code);
  if (!data) return res.status(404).json({ error: 'Scénario introuvable' });
  res.json({ scenario: data });
});

// Réglages qu'une session peut surcharger indépendamment du scénario par
// défaut (cf. publicRoutes.js, qui applique cette même liste à la lecture).
const OVERRIDABLE_SETTINGS = ['hints', 'progressBar', 'map', 'mapMedia', 'chat', 'timer', 'timerType', 'timerParam'];

function sanitizeSettingsOverride(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  OVERRIDABLE_SETTINGS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
  });
  return out;
}

router.post('/sessions', (req, res) => {
  const { scenarioCode, name, settingsOverride } = req.body || {};
  if (!scenarioCode || !scenarioCode.trim()) {
    return res.status(400).json({ error: 'scenarioCode requis' });
  }
  const exists = (code) => !!db.prepare('SELECT 1 FROM sessions WHERE code = ?').get(code);
  const code = generateSessionCode(exists);
  const override = sanitizeSettingsOverride(settingsOverride);
  const info = db.prepare('INSERT INTO sessions (code, scenario_code, name, settings_override) VALUES (?, ?, ?, ?)')
    .run(code, scenarioCode.trim(), name?.trim() || null, Object.keys(override).length ? JSON.stringify(override) : null);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ session });
});

router.get('/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, COUNT(t.id) AS team_count
    FROM sessions s
    LEFT JOIN teams t ON t.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).all();
  res.json({ sessions });
});

router.get('/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  const teams = db.prepare('SELECT * FROM teams WHERE session_id = ? ORDER BY started_at ASC').all(session.id);
  res.json({ session, teams: teams.map(publicTeam) });
});

// Modifie les réglages propres à cette session (indices, minuteur, chat...),
// indépendamment du scénario par défaut. S'applique au prochain chargement
// de l'app joueur (le scénario n'est relu qu'au démarrage), pas en direct
// pour une équipe déjà en jeu.
router.put('/sessions/:id/settings', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  const override = sanitizeSettingsOverride(req.body?.settingsOverride);
  db.prepare('UPDATE sessions SET settings_override = ? WHERE id = ?')
    .run(Object.keys(override).length ? JSON.stringify(override) : null, req.params.id);
  res.json({ ok: true });
});

// Dépose une carte spécifique à cette session (surcharge mapMedia du
// scénario par défaut, sans toucher à l'image partagée par les autres
// sessions du même scénario) : stockée dans le dossier images du scénario
// sous un nom propre à cette session.
router.post('/sessions/:id/map-image', uploadMapImage.single('image'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Fichier image requis' });
  const ext = require('path').extname(req.file.originalname) || '.png';
  const filename = `session-${session.id}-map${ext}`;
  try {
    scenarios.saveScenarioImage(session.scenario_code, filename, req.file.buffer);
    res.status(201).json({ ok: true, filename });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Suppression définitive : équipes, événements et messages associés partent
// en cascade (PRAGMA foreign_keys activé, voir db.js), y compris des
// statistiques et classements qui s'appuient sur ces mêmes tables.
router.delete('/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Diffuse l'état courant de la session (statut + infos de pause) à toutes
// les équipes qui en font partie, pour que leur app se (dé)verrouille et
// ajuste son chrono en conséquence.
function broadcastSessionStatus(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return;
  const payload = {
    status: session.status,
    pauseMessage: session.pause_message,
    pausedAt: session.paused_at,
    totalPausedMs: session.total_paused_ms
  };
  const teams = db.prepare('SELECT id FROM teams WHERE session_id = ?').all(sessionId);
  teams.forEach((t) => sse.publish(`team-${t.id}`, 'session-status', payload));
}

// Clôturer : bloque les nouvelles inscriptions ET la progression des
// équipes déjà présentes (verrouille leur app), sans supprimer leurs
// données. Les équipes encore en cours sont figées à leur score actuel
// (comme un temps écoulé) pour apparaître elles aussi dans le classement —
// sinon seules celles ayant fini normalement y figureraient.
router.post('/sessions/:id/close', (req, res) => {
  const unfinished = db.prepare('SELECT * FROM teams WHERE session_id = ? AND finished_at IS NULL').all(req.params.id);
  unfinished.forEach((team) => {
    const score = computeScore(team.elapsed_ms, team.hints_used, team.progress_percent);
    db.prepare(`
      UPDATE teams SET score = ?, outcome = 'closed', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ?
    `).run(score, team.id);
  });

  // paused_at démarre aussi le figement du chrono, comme pour une pause : si
  // la session est réactivée plus tard, /reopen compense la durée passée
  // fermée de la même façon que /resume compense une pause.
  db.prepare(`
    UPDATE sessions SET status = 'closed', pause_message = NULL, paused_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(req.params.id);

  // La copie détaillée de progression (transfert entre téléphones) ne sert
  // plus une fois la session close : elle n'est jamais consultée passé ce
  // point, autant ne pas la garder en base indéfiniment.
  db.prepare('UPDATE teams SET local_state = NULL WHERE session_id = ?').run(req.params.id);

  broadcastSessionStatus(req.params.id);
  res.json({ ok: true });
});

// Ajoute au cumul de la session le temps écoulé depuis le début de la pause
// ou de la clôture en cours (s'il y en a une), puis repasse la session
// active : partagé par /reopen et /resume, pour que dans les deux cas le
// temps d'arrêt ne soit jamais compté contre les équipes.
function reactivateSession(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return false;
  const pausedSince = session.paused_at ? new Date(session.paused_at.endsWith('Z') ? session.paused_at : session.paused_at + 'Z').getTime() : null;
  const additionalPausedMs = pausedSince ? Math.max(0, Date.now() - pausedSince) : 0;

  // Une équipe finalisée uniquement parce que la session avait été clôturée
  // (outcome "closed") redevient "en cours" à la réactivation : contrairement
  // à "completed"/"timeout" (une vraie fin de partie), ce n'était pas un
  // vrai résultat, juste un gel temporaire — sinon son statut resterait
  // affiché "session clôturée" indéfiniment même après réactivation.
  const revertedTeams = db.prepare("SELECT id FROM teams WHERE session_id = ? AND outcome = 'closed'").all(sessionId);
  if (revertedTeams.length) {
    db.prepare("UPDATE teams SET finished_at = NULL, outcome = NULL, score = NULL WHERE session_id = ? AND outcome = 'closed'").run(sessionId);
  }

  db.prepare(`
    UPDATE sessions SET status = 'active', pause_message = NULL, paused_at = NULL,
      total_paused_ms = total_paused_ms + ?
    WHERE id = ?
  `).run(additionalPausedMs, sessionId);

  revertedTeams.forEach(({ id }) => {
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
    sse.publish(`admin-session-${sessionId}`, 'team-update', publicTeam(team));
  });
  return true;
}

// Réactiver : redonne la main aux équipes déjà présentes (leur app se
// déverrouille toute seule) et rouvre les inscriptions.
router.post('/sessions/:id/reopen', (req, res) => {
  if (!reactivateSession(req.params.id)) return res.status(404).json({ error: 'Session introuvable' });
  broadcastSessionStatus(req.params.id);
  res.json({ ok: true });
});

// Mettre en pause : comme une clôture temporaire (bloque la progression),
// mais avec un message dédié affiché aux équipes et, surtout, un chrono qui
// ne pénalise pas le temps passé en pause (voir /resume).
router.post('/sessions/:id/pause', (req, res) => {
  const { message } = req.body || {};
  db.prepare(`
    UPDATE sessions SET status = 'paused', pause_message = ?, paused_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(message?.trim() || null, req.params.id);
  broadcastSessionStatus(req.params.id);
  res.json({ ok: true });
});

// Reprendre après une pause : voir reactivateSession ci-dessus.
router.post('/sessions/:id/resume', (req, res) => {
  if (!reactivateSession(req.params.id)) return res.status(404).json({ error: 'Session introuvable' });
  broadcastSessionStatus(req.params.id);
  res.json({ ok: true });
});

// Historique complet d'une session : chronologie de tous les événements,
// toutes équipes confondues.
router.get('/sessions/:id/history', (req, res) => {
  const events = db.prepare(`
    SELECT e.*, t.name AS team_name
    FROM events e
    JOIN teams t ON t.id = e.team_id
    WHERE t.session_id = ?
    ORDER BY e.created_at ASC
  `).all(req.params.id);
  res.json({ events });
});

// Flux SSE du tableau de bord : mises à jour de progression + messages de
// chat entrants, pour toutes les équipes de la session.
router.get('/sessions/:id/stream', (req, res) => {
  sse.subscribe(`admin-session-${req.params.id}`, res);
});

router.get('/teams/:teamId', (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  const events = db.prepare('SELECT * FROM events WHERE team_id = ? ORDER BY created_at ASC').all(team.id);
  const messages = db.prepare('SELECT * FROM messages WHERE team_id = ? ORDER BY created_at ASC').all(team.id);
  res.json({ team: publicTeam(team), events, messages });
});

// Simule côté équipe une action déclenchée depuis le backend admin, sur
// notification SSE (l'app joueur seule connaît le scenario.json) :
// - action "add" (par défaut) : simule le scan du QR code de l'étape, sans
//   résoudre un éventuel cadenas (l'équipe doit toujours le résoudre elle-même) ;
// - action "resolve" : simule la résolution du cadenas d'une étape bloquée,
//   réservée aux étapes ayant un lockType.
router.post('/teams/:teamId/unlock', (req, res) => {
  const { stepId, action } = req.body || {};
  if (stepId == null) return res.status(400).json({ error: 'stepId requis' });
  const resolvedAction = action === 'resolve' ? 'resolve' : 'add';
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });

  const info = db.prepare('INSERT INTO events (team_id, type, payload) VALUES (?, ?, ?)')
    .run(team.id, 'admin_unlock', JSON.stringify({ stepId, action: resolvedAction }));
  const eventRow = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);

  sse.publish(`team-${team.id}`, 'unlock', { stepId, action: resolvedAction });
  sse.publish(`admin-session-${team.session_id}`, 'team-unlocked', { teamId: team.id, stepId, action: resolvedAction });
  sse.publish(`admin-session-${team.session_id}`, 'team-event', { ...eventRow, team_name: team.name });

  res.json({ ok: true });
});

// Ajuste le nombre d'indices utilisés par une équipe (+1 en donne un de
// plus, -1 lui en retire un), le même mécanisme que les QR codes bonus
// "addhint"/"removehint" déjà présents dans le jeu, mais déclenché à
// distance par l'animateur. Le total n'est pas recalculé ici : l'app de
// l'équipe applique le delta localement (elle seule connaît la limite
// éventuelle du scénario) et le prochain événement remonté resynchronise
// la valeur affichée au tableau de bord.
router.post('/teams/:teamId/hints', (req, res) => {
  const { delta } = req.body || {};
  if (![1, -1].includes(delta)) return res.status(400).json({ error: 'delta doit valoir 1 ou -1' });
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });

  // Le total fait autorité côté serveur (pas un simple delta relayé) : si la
  // connexion SSE de l'équipe a été coupée (téléphone en veille, onglet en
  // arrière-plan...), elle resynchronise cette valeur dès sa reconnexion
  // (cf. l'événement "sync" envoyé à l'ouverture du flux) au lieu de perdre
  // l'ajustement.
  const newHints = Math.max(0, team.hints_used + delta);
  db.prepare('UPDATE teams SET hints_used = ? WHERE id = ?').run(newHints, team.id);

  const info = db.prepare('INSERT INTO events (team_id, type, payload) VALUES (?, ?, ?)')
    .run(team.id, 'admin_hint_adjust', JSON.stringify({ delta, newHints }));
  const eventRow = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  const updatedTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(team.id);

  sse.publish(`team-${team.id}`, 'hint-adjust', { hintsCount: newHints });
  sse.publish(`admin-session-${team.session_id}`, 'team-update', publicTeam(updatedTeam));
  sse.publish(`admin-session-${team.session_id}`, 'team-event', { ...eventRow, team_name: team.name });

  res.json({ ok: true, hintsCount: newHints });
});

router.post('/teams/:teamId/messages', (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message vide' });
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });

  const info = db.prepare('INSERT INTO messages (team_id, sender, text) VALUES (?, ?, ?)')
    .run(team.id, 'admin', text.trim());
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

  sse.publish(`team-${team.id}`, 'message', message);
  sse.publish(`admin-session-${team.session_id}`, 'message', { ...message, teamName: team.name });

  res.status(201).json({ ok: true });
});

// --- Transfert entre téléphones (QR) et sauvegardes de progression --------

// Génère un QR pointant vers /?resume=<jeton> : scanné par un autre
// téléphone, il reprend cette équipe à l'identique (voir GET /teams/resume
// dans publicRoutes.js et resumeWithToken côté jeu).
router.get('/teams/:teamId/resume-qrcode', async (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  // req.baseUrl vaut toujours "<racine de l'app>/api/admin" (ce routeur est
  // monté à /api/admin dans server.js) — y compris le préfixe ajouté par une
  // éventuelle passerelle node-gateway en amont (ex. "/mystere"). Retirer ce
  // suffixe fixe donne donc la racine réelle de l'app, dans les deux cas.
  const appRoot = req.baseUrl.replace(/\/api\/admin$/, '');
  const url = `${req.protocol}://${req.get('host')}${appRoot}/?resume=${encodeURIComponent(team.token)}`;
  try {
    const buffer = await QRCode.toBuffer(url, { type: 'png', width: 400, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sauvegarde nommée de la progression actuelle d'une équipe, indépendante de
// sa session et jamais effacée automatiquement (contrairement à
// teams.local_state) — pour rejouer un point précis d'un scénario en test
// sans devoir tout reparcourir à chaque essai.
router.post('/teams/:teamId/save-state', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis' });
  const team = db.prepare(`
    SELECT t.*, s.scenario_code AS scenario_code
    FROM teams t JOIN sessions s ON s.id = t.session_id
    WHERE t.id = ?
  `).get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  if (!team.local_state) {
    return res.status(400).json({ error: 'Aucune progression à sauvegarder pour cette équipe pour le moment' });
  }

  const info = db.prepare('INSERT INTO scenario_saves (scenario_code, name, local_state) VALUES (?, ?, ?)')
    .run(team.scenario_code, name.trim(), team.local_state);
  const save = db.prepare('SELECT id, scenario_code, name, created_at FROM scenario_saves WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ save });
});

// Sauvegardes disponibles pour un scénario donné.
router.get('/scenario-saves', (req, res) => {
  const scenarioCode = typeof req.query.scenarioCode === 'string' ? req.query.scenarioCode : '';
  if (!scenarioCode) return res.status(400).json({ error: 'scenarioCode requis' });
  const saves = db.prepare(
    'SELECT id, scenario_code, name, created_at FROM scenario_saves WHERE scenario_code = ? ORDER BY created_at DESC'
  ).all(scenarioCode);
  res.json({ saves });
});

// Applique une sauvegarde sur une équipe existante. Le changement reste côté
// serveur tant que le téléphone de cette équipe n'a pas rechargé sa reprise
// (même QR/lien ?resume= que pour un transfert entre appareils).
router.post('/teams/:teamId/load-state', (req, res) => {
  const { saveId } = req.body || {};
  if (!saveId) return res.status(400).json({ error: 'saveId requis' });
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  const save = db.prepare('SELECT * FROM scenario_saves WHERE id = ?').get(saveId);
  if (!save) return res.status(404).json({ error: 'Sauvegarde introuvable' });

  db.prepare('UPDATE teams SET local_state = ? WHERE id = ?').run(save.local_state, team.id);
  res.json({ ok: true });
});

router.delete('/scenario-saves/:id', (req, res) => {
  db.prepare('DELETE FROM scenario_saves WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
