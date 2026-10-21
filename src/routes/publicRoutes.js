const express = require('express');
const db = require('../db');
const { generateTeamToken } = require('../codes');
const { computeScore } = require('../scoring');
const sse = require('../sse');

// Un scenario.json peut être surchargé par certains réglages propres à une
// session (ex : deux sessions du même scénario, l'une avec minuteur, l'autre
// sans) ; voir OVERRIDABLE_SETTINGS dans adminRoutes.js pour la liste des
// clés autorisées à l'écriture. Ici on se contente de relire ce qui a été
// stocké, déjà filtré.
function parseSettingsOverride(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const router = express.Router();

function requireTeam(req, res, next) {
  // EventSource (natif navigateur) ne permet pas d'en-têtes personnalisés :
  // le flux SSE passe donc le jeton en query string, tous les autres appels
  // (fetch) utilisent l'en-tête.
  const token = req.get('X-Team-Token') || req.query.token;
  if (!token) return res.status(401).json({ error: 'Jeton d\'équipe manquant' });
  const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
  if (!team) return res.status(401).json({ error: 'Jeton d\'équipe invalide' });
  req.team = team;
  next();
}

// Bloque les écritures de progression (scan, indice, fin de partie) une fois
// la session clôturée par l'admin ; laisse passer les lectures et le chat.
function requireActiveSession(req, res, next) {
  const session = db.prepare('SELECT status FROM sessions WHERE id = ?').get(req.team.session_id);
  if (session && session.status !== 'active') {
    const message = session.status === 'paused'
      ? 'Cette session de jeu est en pause.'
      : 'Cette session de jeu est terminée.';
    return res.status(409).json({ error: message });
  }
  next();
}

function publicSession(session) {
  return {
    code: session.code,
    scenarioCode: session.scenario_code,
    name: session.name,
    status: session.status,
    settingsOverride: parseSettingsOverride(session.settings_override)
  };
}

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

// Rejoindre une session avec le code communiqué par l'admin. Si une équipe
// du même nom (insensible à la casse) existe déjà dans cette session et n'a
// pas terminé, on la reprend au lieu d'en créer une nouvelle — sert de repli
// au transfert par QR code (voir /teams/resume) quand celui-ci n'est pas
// accessible (animateur non disponible, appareil sans caméra...).
router.post('/sessions/:code/join', (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const { teamName } = req.body || {};
  if (!teamName || !teamName.trim()) {
    return res.status(400).json({ error: 'Nom d\'équipe requis' });
  }
  const session = db.prepare('SELECT * FROM sessions WHERE code = ?').get(code);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });
  if (session.status !== 'active') return res.status(409).json({ error: 'Cette session est terminée' });

  const trimmedName = teamName.trim();
  const existing = db.prepare(
    'SELECT * FROM teams WHERE session_id = ? AND finished_at IS NULL AND LOWER(name) = LOWER(?)'
  ).get(session.id, trimmedName);

  let team;
  if (existing) {
    team = existing;
  } else {
    const token = generateTeamToken();
    const info = db.prepare(
      'INSERT INTO teams (session_id, name, token) VALUES (?, ?, ?)'
    ).run(session.id, trimmedName, token);
    team = db.prepare('SELECT * FROM teams WHERE id = ?').get(info.lastInsertRowid);
    sse.publish(`admin-session-${session.id}`, 'team-joined', publicTeam(team));
  }

  res.status(201).json({
    teamId: team.id,
    teamToken: team.token,
    resumed: !!existing,
    localState: team.local_state ? JSON.parse(team.local_state) : null,
    session: publicSession(session)
  });
});

// Reprendre une équipe existante à partir de son jeton (transfert vers un
// autre téléphone, typiquement via le QR code généré par l'admin — voir
// GET /admin/teams/:teamId/resume-qrcode). Même forme de réponse que /join
// pour que le client applique le même traitement dans les deux cas.
router.get('/teams/resume', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(400).json({ error: 'Jeton requis' });
  const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  if (team.finished_at) return res.status(409).json({ error: 'Cette équipe a déjà terminé la partie' });
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(team.session_id);
  if (!session || session.status === 'closed') {
    return res.status(409).json({ error: 'Cette session est terminée' });
  }
  res.json({
    teamId: team.id,
    teamToken: team.token,
    teamName: team.name,
    resumed: true,
    localState: team.local_state ? JSON.parse(team.local_state) : null,
    session: publicSession(session)
  });
});

// Remontée d'un événement de progression (scan QR, cadenas résolu, indice
// consulté...) + un instantané d'état (progression/temps/indices) pour que
// le tableau de bord admin n'ait pas besoin de connaître le scenario.json.
router.post('/teams/:teamId/events', requireTeam, requireActiveSession, (req, res) => {
  const { type, payload, progressPercent, hintsUsed, elapsedMs, currentStepId, localState } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type requis' });

  const info = db.prepare('INSERT INTO events (team_id, type, payload) VALUES (?, ?, ?)')
    .run(req.team.id, type, payload != null ? JSON.stringify(payload) : null);
  const eventRow = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  sse.publish(`admin-session-${req.team.session_id}`, 'team-event', { ...eventRow, team_name: req.team.name });

  // local_state (copie du localStorage pertinent, voir backendSync.js côté
  // jeu) : transporté par le heartbeat périodique, sert à reprendre à
  // l'identique sur un autre téléphone (QR de transfert généré par l'admin).
  db.prepare(`
    UPDATE teams SET
      progress_percent = COALESCE(?, progress_percent),
      hints_used = COALESCE(?, hints_used),
      elapsed_ms = COALESCE(?, elapsed_ms),
      current_step_id = COALESCE(?, current_step_id),
      local_state = COALESCE(?, local_state),
      last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(
    progressPercent ?? null,
    hintsUsed ?? null,
    elapsedMs ?? null,
    currentStepId ?? null,
    localState ? JSON.stringify(localState) : null,
    req.team.id
  );

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.team.id);
  sse.publish(`admin-session-${req.team.session_id}`, 'team-update', publicTeam(team));

  res.status(201).json({ ok: true });
});

// Fin de partie : verrouille le score final de l'équipe pour le classement.
router.post('/teams/:teamId/finish', requireTeam, requireActiveSession, (req, res) => {
  const { elapsedMs, hintsUsed, progressPercent, score, outcome } = req.body || {};
  const finalScore = Number.isFinite(score)
    ? score
    : computeScore(elapsedMs ?? req.team.elapsed_ms, hintsUsed ?? req.team.hints_used, progressPercent ?? req.team.progress_percent);
  // "completed" (dernière étape atteinte) ou "timeout" (temps écoulé avant
  // la fin) : toute autre valeur retombe sur "completed" par défaut.
  const finalOutcome = outcome === 'timeout' ? 'timeout' : 'completed';

  db.prepare(`
    UPDATE teams SET
      elapsed_ms = COALESCE(?, elapsed_ms),
      hints_used = COALESCE(?, hints_used),
      progress_percent = COALESCE(?, progress_percent),
      score = ?,
      outcome = ?,
      finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(elapsedMs ?? null, hintsUsed ?? null, progressPercent ?? null, finalScore, finalOutcome, req.team.id);

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.team.id);
  sse.publish(`admin-session-${req.team.session_id}`, 'team-update', publicTeam(team));

  res.json({ ok: true, score: finalScore });
});

// Chat : l'équipe envoie un message à l'admin.
router.post('/teams/:teamId/messages', requireTeam, (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message vide' });

  const info = db.prepare('INSERT INTO messages (team_id, sender, text) VALUES (?, ?, ?)')
    .run(req.team.id, 'team', text.trim());
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

  // Pas de publication sur `team-${id}` ici : c'est l'équipe elle-même qui
  // envoie ce message, elle l'affiche déjà en local (cf. wireChat côté app) ;
  // se le renvoyer créerait un doublon et un faux badge "non lu".
  sse.publish(`admin-session-${req.team.session_id}`, 'message', { ...message, teamName: req.team.name });
  // Canal transverse (toutes sessions) : permet au tableau de bord de
  // signaler un message non lu même si l'admin regarde une autre session.
  sse.publish('admin-global', 'new-message', {
    sessionId: req.team.session_id,
    teamId: req.team.id,
    teamName: req.team.name
  });

  res.status(201).json({ ok: true });
});

router.get('/teams/:teamId/messages', requireTeam, (req, res) => {
  const messages = db.prepare('SELECT * FROM messages WHERE team_id = ? ORDER BY created_at ASC').all(req.team.id);
  res.json({ messages });
});

// Flux SSE de l'équipe : messages de l'admin + déblocages manuels.
router.get('/teams/:teamId/stream', requireTeam, (req, res) => {
  sse.subscribe(`team-${req.team.id}`, res);
  // Resynchronise le nombre d'indices ET le statut de la session dès
  // l'ouverture (ou la réouverture) du flux : si un ajustement ou une
  // clôture a eu lieu pendant une coupure (téléphone en veille, réseau...),
  // rien n'est perdu.
  const session = db.prepare('SELECT status, pause_message, paused_at, total_paused_ms FROM sessions WHERE id = ?').get(req.team.session_id);
  res.write(`event: sync\ndata: ${JSON.stringify({
    hintsCount: req.team.hints_used,
    sessionStatus: session?.status,
    pauseMessage: session?.pause_message,
    pausedAt: session?.paused_at,
    totalPausedMs: session?.total_paused_ms || 0
  })}\n\n`);
});

// Classement public d'une session (URL partageable, aucune authentification).
router.get('/sessions/:code/leaderboard', (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const session = db.prepare('SELECT * FROM sessions WHERE code = ?').get(code);
  if (!session) return res.status(404).json({ error: 'Session introuvable' });

  const teams = db.prepare(`
    SELECT name, elapsed_ms, hints_used, progress_percent, score, finished_at
    FROM teams
    WHERE session_id = ? AND finished_at IS NOT NULL
    ORDER BY score DESC
  `).all(session.id);

  res.json({
    session: { name: session.name, scenarioCode: session.scenario_code },
    ranking: teams.map((t, index) => ({
      rank: index + 1,
      name: t.name,
      elapsedMs: t.elapsed_ms,
      hintsUsed: t.hints_used,
      progressPercent: t.progress_percent,
      score: t.score
    }))
  });
});

// Classement général d'un scénario, toutes sessions confondues (top 10).
router.get('/scenarios/:code/leaderboard', (req, res) => {
  const scenarioCode = req.params.code.trim();
  const teams = db.prepare(`
    SELECT t.name, t.elapsed_ms, t.hints_used, t.progress_percent, t.score, t.finished_at,
           s.name AS session_name, s.code AS session_code
    FROM teams t
    JOIN sessions s ON s.id = t.session_id
    WHERE s.scenario_code = ? AND t.finished_at IS NOT NULL
    ORDER BY t.score DESC
    LIMIT 10
  `).all(scenarioCode);

  res.json({
    scenarioCode,
    ranking: teams.map((t, index) => ({
      rank: index + 1,
      name: t.name,
      sessionName: t.session_name,
      sessionCode: t.session_code,
      elapsedMs: t.elapsed_ms,
      hintsUsed: t.hints_used,
      progressPercent: t.progress_percent,
      score: t.score,
      finishedAt: t.finished_at
    }))
  });
});

module.exports = router;
