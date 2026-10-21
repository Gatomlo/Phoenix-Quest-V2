// Intégration avec le backend d'administration : rejoindre une session,
// remonter les événements de progression, chat, classement.
//
// Tout ce qui part vers le serveur (événements, fin de partie, messages de
// chat) passe par une file d'attente persistée dans localStorage : si le
// réseau n'est pas disponible au moment de l'action, rien n'est perdu, la
// synchronisation reprend automatiquement au retour du réseau ou au
// prochain déclenchement (voir flushQueue). Cohérent avec le fonctionnement
// hors-ligne du reste de l'app (Phase 4).
import { state } from './state.js';
import { getItem, setItem, KEYS } from './storage.js';
import { BACKEND_URL } from './backendConfig.js';

export function hasJoinedSession() {
  return !!getItem(KEYS.BACKEND_TEAM_TOKEN, null);
}

function teamId() {
  return getItem(KEYS.BACKEND_TEAM_ID, null);
}
function teamToken() {
  return getItem(KEYS.BACKEND_TEAM_TOKEN, null);
}

export async function joinSession(sessionCode, teamName) {
  const response = await fetch(`${BACKEND_URL}/api/sessions/${encodeURIComponent(sessionCode)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Impossible de rejoindre la session');
  applyJoinResult(sessionCode, teamName, data);
  return data;
}

// Reprendre une équipe existante à partir d'un jeton (transfert vers un
// autre téléphone) : QR de transfert généré par l'admin, ou lien contenant
// ?resume=<jeton>. Même traitement que joinSession ensuite (voir game.js).
export async function resumeWithToken(token) {
  const response = await fetch(`${BACKEND_URL}/api/teams/resume?token=${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Impossible de reprendre cette équipe');
  applyJoinResult(data.session.code, data.teamName, data);
  return data;
}

function applyJoinResult(sessionCode, teamName, data) {
  setItem(KEYS.BACKEND_TEAM_ID, data.teamId);
  setItem(KEYS.BACKEND_TEAM_TOKEN, data.teamToken);
  setItem(KEYS.BACKEND_SESSION_CODE, sessionCode);
  setItem(KEYS.BACKEND_TEAM_NAME, teamName);
  setItem(KEYS.SESSION_SETTINGS_OVERRIDE, data.session?.settingsOverride || {});
  restoreLocalState(data.localState);
}

// Clés dont la valeur constitue la progression de partie à proprement
// parler (ce qu'on veut retrouver à l'identique sur un autre téléphone) —
// à l'exclusion de l'identité de connexion (gérée à part par applyJoinResult)
// et de la file d'attente réseau (propre à l'appareil d'origine : la
// rejouer sur le nouvel appareil créerait des événements en double).
const RESUMABLE_KEYS = [
  KEYS.HISTORY, KEYS.LOCATIONS_OPENED, KEYS.STEPS_REPLACED, KEYS.STEPS_REPLACED_BY,
  KEYS.CURRENT_STEP, KEYS.ACTUAL_LOCATIONS, KEYS.ACTUAL_OBJECTS, KEYS.HINTS_COUNT,
  KEYS.START_TIME, KEYS.PROGRESS_BAR_VALUE, KEYS.STEPS_IN_PROGRESS_BAR,
  KEYS.MAIL_SENDED, KEYS.GAME_FINISHED, KEYS.SCORE, KEYS.GROUP_NAME, KEYS.GROUP_MAIL
];

function collectLocalState() {
  const out = {};
  RESUMABLE_KEYS.forEach((key) => {
    const raw = localStorage.getItem(key);
    if (raw !== null) out[key] = raw;
  });
  return out;
}

function restoreLocalState(localState) {
  if (!localState || typeof localState !== 'object') return;
  Object.entries(localState).forEach(([key, raw]) => {
    if (RESUMABLE_KEYS.includes(key)) localStorage.setItem(key, raw);
  });
}

export function getTeamName() {
  return getItem(KEYS.BACKEND_TEAM_NAME, null);
}

// Réglages du scénario propres à cette session (indices, minuteur, chat...),
// à fusionner par-dessus le scenario.json par défaut. Mis en cache au moment
// de rejoindre la session (voir joinSession) : pas de round-trip réseau
// supplémentaire nécessaire pour l'appliquer au scénario déjà mis en cache
// hors-ligne.
export function getSettingsOverride() {
  return getItem(KEYS.SESSION_SETTINGS_OVERRIDE, {});
}

// ---------------------------------------------------------------------------
// File d'attente hors-ligne
// ---------------------------------------------------------------------------
function getQueue() {
  return getItem(KEYS.BACKEND_EVENT_QUEUE, []);
}
function saveQueue(queue) {
  setItem(KEYS.BACKEND_EVENT_QUEUE, queue);
}

function snapshotNow() {
  const elapsedMs = state.startTime ? Date.now() - new Date(state.startTime).getTime() : 0;
  return {
    progressPercent: state.progressBarValue,
    hintsUsed: state.hintsCount,
    elapsedMs,
    currentStepId: state.currentStep
  };
}

function enqueue(kind, body) {
  if (!hasJoinedSession()) return;
  const queue = getQueue();
  queue.push({ kind, body });
  saveQueue(queue);
  flushQueue();
}

export function enqueueEvent(type, payload, extra = {}) {
  enqueue('event', { type, payload, ...snapshotNow(), ...extra });
}

export function finishGame({ elapsedMs, hintsUsed, progressPercent, score, outcome }) {
  enqueue('finish', { elapsedMs, hintsUsed, progressPercent, score, outcome });
}

export function sendChatMessage(text) {
  enqueue('message', { text });
}

const ENDPOINT_BY_KIND = {
  event: (id) => `/api/teams/${id}/events`,
  finish: (id) => `/api/teams/${id}/finish`,
  message: (id) => `/api/teams/${id}/messages`
};

let flushing = false;
export async function flushQueue() {
  if (flushing || !hasJoinedSession()) return;
  flushing = true;
  try {
    let queue = getQueue();
    while (queue.length > 0) {
      const [item] = queue;
      try {
        const response = await fetch(`${BACKEND_URL}${ENDPOINT_BY_KIND[item.kind](teamId())}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Team-Token': teamToken() },
          body: JSON.stringify(item.body)
        });
        if (!response.ok && response.status !== 400) {
          // Erreur serveur ou jeton invalide : on retentera plus tard sans
          // perdre les éléments suivants de la file.
          break;
        }
      } catch {
        // Hors-ligne : on s'arrête ici, la file reprendra au prochain appel
        // (retour du réseau, ou déclenchement périodique).
        break;
      }
      queue = queue.slice(1);
      saveQueue(queue);
    }
  } finally {
    flushing = false;
  }
}

export function startBackgroundSync() {
  if (!hasJoinedSession()) return;
  window.addEventListener('online', flushQueue);
  setInterval(flushQueue, 15000);
  // Sans ça, la progression/temps remontés au tableau de bord admin ne
  // bougeaient qu'aux actions du joueur (scan, indice...) : une équipe
  // simplement en train de réfléchir semblait figée pendant de longues
  // minutes. Le type "heartbeat" est déjà géré par le serveur (met à jour
  // last_seen_at) et filtré de l'historique côté admin (admin.js) — il ne
  // manquait que cet envoi périodique.
  setInterval(() => enqueueEvent('heartbeat', null, { localState: collectLocalState() }), 20000);
  flushQueue();
}

// ---------------------------------------------------------------------------
// Chat + déblocage : flux SSE de l'équipe
// ---------------------------------------------------------------------------
export async function fetchChatHistory() {
  const response = await fetch(`${BACKEND_URL}/api/teams/${teamId()}/messages`, {
    headers: { 'X-Team-Token': teamToken() }
  });
  if (!response.ok) throw new Error('Historique de discussion indisponible');
  const data = await response.json();
  return data.messages;
}

export function subscribeToTeamStream({ onMessage, onUnlock, onHintsSync, onSessionStatus }) {
  if (!hasJoinedSession()) return null;
  const url = `${BACKEND_URL}/api/teams/${teamId()}/stream?token=${encodeURIComponent(teamToken())}`;
  const source = new EventSource(url);
  source.addEventListener('message', (e) => onMessage?.(JSON.parse(e.data)));
  source.addEventListener('unlock', (e) => onUnlock?.(JSON.parse(e.data)));
  // "sync" (à l'ouverture/réouverture) et "hint-adjust" (en direct) portent
  // tous les deux le total autoritaire, jamais un delta : ça absorbe les
  // ajustements manqués pendant une coupure (veille, réseau...).
  source.addEventListener('sync', (e) => {
    const data = JSON.parse(e.data);
    onHintsSync?.(data.hintsCount);
    if (data.sessionStatus) {
      onSessionStatus?.({
        status: data.sessionStatus,
        pauseMessage: data.pauseMessage,
        pausedAt: data.pausedAt,
        totalPausedMs: data.totalPausedMs
      });
    }
  });
  source.addEventListener('hint-adjust', (e) => onHintsSync?.(JSON.parse(e.data).hintsCount));
  source.addEventListener('session-status', (e) => onSessionStatus?.(JSON.parse(e.data)));
  return source;
}

// ---------------------------------------------------------------------------
// Classement public
// ---------------------------------------------------------------------------
export async function fetchLeaderboard(sessionCode) {
  const response = await fetch(`${BACKEND_URL}/api/sessions/${encodeURIComponent(sessionCode)}/leaderboard`);
  if (!response.ok) throw new Error('Classement indisponible');
  return response.json();
}

export function getSessionCode() {
  return getItem(KEYS.BACKEND_SESSION_CODE, null);
}
