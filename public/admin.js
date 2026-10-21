// Racine de l'app (pas seulement de ce dossier admin/) : déduite de l'URL
// réelle de CE fichier (import.meta.url, fiable pour un module ES — voir le
// même principe dans game/scripts/core/backendConfig.js). admin.js vit
// toujours dans <racine>/admin/, donc remonter d'un niveau donne <racine>,
// qu'elle soit servie à "/" ou montée sous "/mystere" par la passerelle
// node-gateway. Sert à préfixer l'API (hors de admin/) et les liens vers
// d'autres pages du tableau de bord.
const APP_BASE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const API = APP_BASE + '/api/admin';

async function apiFetch(path, options = {}) {
  // FormData (upload d'image) doit fixer elle-même son Content-Type (avec la
  // "boundary" multipart) : un Content-Type JSON explicite serait respecté
  // par fetch() plutôt qu'écrasé, et casserait l'upload côté serveur.
  const headers = options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(API + path, {
    credentials: 'include',
    ...options,
    headers
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Non authentifié');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// --- Dialogs génériques (natif <dialog>, même convention que l'app joueur) --
document.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-close-modal]');
  if (closer) {
    closer.closest('dialog')?.close();
    return;
  }
  if (event.target.tagName === 'DIALOG' && event.target.hasAttribute('open')) {
    event.target.close();
  }
});

// Réglages et sauvegardes vivaient dans des <details> repliables au fil de
// la page ; déplacés en modales pour ne pas allonger la rangée d'actions de
// session au-delà de ce qui tient sur une ligne en mode smartphone. Leur
// contenu est déjà chargé par openSession() — ces boutons ne font qu'ouvrir/
// fermer, aucune donnée à recharger ici.
document.getElementById('openMoreActionsButton').addEventListener('click', () => {
  document.getElementById('moreActionsMenu').showModal();
});
document.getElementById('moreActionsSettingsItem').addEventListener('click', () => {
  document.getElementById('moreActionsMenu').close();
  document.getElementById('sessionSettingsModal').showModal();
});
document.getElementById('moreActionsSavesItem').addEventListener('click', () => {
  document.getElementById('moreActionsMenu').close();
  document.getElementById('scenarioSavesModal').showModal();
});

// Remplace window.confirm() : certains navigateurs permettent de cocher
// "Empêcher cette page de créer d'autres boîtes de dialogue", ce qui rend
// confirm() muet (annule silencieusement) pour le reste de la page — une
// boîte de dialogue maison ne peut pas être désactivée de cette façon.
function confirmAction(message, { confirmLabel = 'Confirmer' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirmDialog');
    document.getElementById('confirmDialogMessage').textContent = message;
    const confirmButton = document.getElementById('confirmDialogConfirmButton');
    confirmButton.textContent = confirmLabel;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener('close', onClose);
      confirmButton.removeEventListener('click', onConfirm);
      resolve(result);
    };
    const onConfirm = () => { finish(true); dialog.close(); };
    const onClose = () => finish(false);
    confirmButton.addEventListener('click', onConfirm);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}

// Remplace window.prompt() : de plus en plus de navigateurs et de webviews
// mobiles (in-app browser d'une appli de messagerie, PWA en mode autonome...)
// le bloquent purement et simplement (silencieux ou exception) — c'est ce qui
// rendait "Sauvegarder l'état" inopérant sur certains téléphones. Même
// principe que confirmAction() ci-dessus : une boîte de dialogue maison ne
// dépend d'aucune permission navigateur.
function promptAction(message, { title = 'Saisie', confirmLabel = 'Valider', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('promptDialog');
    const form = document.getElementById('promptDialogForm');
    const input = document.getElementById('promptDialogInput');
    document.getElementById('promptDialogTitle').textContent = title;
    document.getElementById('promptDialogMessage').textContent = message;
    document.getElementById('promptDialogConfirmButton').textContent = confirmLabel;
    input.value = '';
    input.placeholder = placeholder;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener('close', onClose);
      form.removeEventListener('submit', onSubmit);
      resolve(result);
    };
    const onSubmit = (event) => { event.preventDefault(); finish(input.value.trim() || null); dialog.close(); };
    const onClose = () => finish(null);
    form.addEventListener('submit', onSubmit);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    input.focus();
  });
}

// --- Vue login -------------------------------------------------------
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  loadSessions();
  loadScenarioOptions();
  connectGlobalStream();
}

// --- Messages non lus, toutes sessions confondues -------------------------
// (en mémoire seulement : repart à zéro si la page est rechargée, ce qui est
// suffisant pour une V1 mono-admin.)
const unreadBySession = new Map(); // sessionId -> count
const sessionMeta = new Map(); // sessionId -> {code, name}
let globalEventSource = null;

function connectGlobalStream() {
  if (globalEventSource) return;
  globalEventSource = new EventSource(`${API}/global-stream`, { withCredentials: true });
  globalEventSource.addEventListener('new-message', (e) => {
    const { sessionId, teamName } = JSON.parse(e.data);
    if (sessionId === currentSessionId) return; // déjà visible en direct sur l'écran ouvert
    unreadBySession.set(sessionId, (unreadBySession.get(sessionId) || 0) + 1);
    renderUnreadBadge(sessionId);
    showOtherSessionBanner(sessionId, teamName);
  });
}

function renderUnreadBadge(sessionId) {
  const li = sessionList.querySelector(`li[data-session-id="${sessionId}"]`);
  const badge = li?.querySelector('.unread-badge');
  if (!badge) return;
  const count = unreadBySession.get(sessionId) || 0;
  badge.textContent = count;
  badge.hidden = count === 0;
}

function showOtherSessionBanner(sessionId, teamName) {
  const meta = sessionMeta.get(sessionId);
  const banner = document.getElementById('otherSessionBanner');
  document.getElementById('otherSessionBannerText').textContent =
    `Nouveau message de l'équipe « ${teamName} » — session ${meta ? meta.code : sessionId}${meta?.name ? ' (' + meta.name + ')' : ''}.`;
  banner.hidden = false;
  document.getElementById('otherSessionBannerButton').onclick = () => {
    banner.hidden = true;
    openSession(sessionId);
  };
}

document.getElementById('otherSessionBannerClose').addEventListener('click', () => {
  document.getElementById('otherSessionBanner').hidden = true;
});

// --- Scénarios disponibles (liste déroulante + cache pour l'aperçu d'étape) -
const scenarioCache = new Map(); // code -> scenario.json parsé

// Servies directement par ce backend admin (pas par l'app joueur) pour ne pas
// dépendre d'un serveur statique séparé, pas toujours lancé pendant qu'on
// utilise l'admin.
function scenarioImageUrl(code, filename) {
  return `${API}/scenario-editor/scenarios/${encodeURIComponent(code)}/images/${encodeURIComponent(filename)}`;
}

function updateGlobalLeaderboardLink() {
  const select = document.getElementById('scenarioCodeInput');
  const link = document.getElementById('globalLeaderboardLink');
  if (select.value) link.href = `${APP_BASE}/admin/leaderboard-global.html?scenario=${encodeURIComponent(select.value)}`;
}

async function loadScenarioOptions() {
  const select = document.getElementById('scenarioCodeInput');
  try {
    const { scenarios } = await apiFetch('/scenarios');
    select.innerHTML = scenarios.length
      ? scenarios.map((s) => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')
      : '<option value="" disabled selected>Aucun scénario trouvé</option>';
    updateGlobalLeaderboardLink();
    select.addEventListener('change', updateGlobalLeaderboardLink);
  } catch {
    select.innerHTML = '<option value="" disabled selected>Impossible de charger les scénarios</option>';
  }
}

async function getScenarioData(code) {
  if (scenarioCache.has(code)) return scenarioCache.get(code);
  const { scenario } = await apiFetch(`/scenarios/${encodeURIComponent(code)}`);
  scenarioCache.set(code, scenario);
  return scenario;
}

// Options du sélecteur "Ajouter" : les étapes du scénario triées par nom,
// pour choisir sans avoir à connaître les identifiants numériques. Les
// étapes déjà scannées/résolues par l'équipe (admin ou app joueur) sont
// barrées mais restent sélectionnables, pour pouvoir les réactiver au besoin.
let sortedSteps = [];
// teamId (number) -> Set de stepId (string) déjà scannés/résolus.
const visitedStepsByTeam = new Map();

async function loadStepOptions(scenarioCode) {
  try {
    const scenario = await getScenarioData(scenarioCode);
    sortedSteps = [...scenario.steps].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })
    );
  } catch {
    sortedSteps = [];
  }
  teamCardById.forEach((_, teamId) => renderStepOptionsForTeam(teamId));
}

function buildStepOptionsHtml(teamId) {
  if (!sortedSteps.length) return '<option value="" disabled selected>Scénario indisponible</option>';
  const visited = visitedStepsByTeam.get(teamId) || new Set();
  const renderOption = (s) => {
    const label = s.name || 'Étape ' + s.id;
    const lockIcon = s.lockType != null ? '🔒 ' : '';
    const visitedStyle = visited.has(String(s.id)) ? ' style="text-decoration: line-through;"' : '';
    return `<option value="${s.id}"${visitedStyle}>${lockIcon}${label}${s.code ? ` (${s.code})` : ''}</option>`;
  };
  // Non vues d'abord (ce qui reste à faire, le plus utile pour suivre une
  // équipe en direct), étapes déjà vues barrées et reléguées à la fin.
  const notVisited = sortedSteps.filter((s) => !visited.has(String(s.id)));
  const alreadyVisited = sortedSteps.filter((s) => visited.has(String(s.id)));
  return '<option value="" disabled selected>Choisir une étape…</option>' +
    notVisited.map(renderOption).join('') +
    (alreadyVisited.length ? '<option disabled>──────────</option>' + alreadyVisited.map(renderOption).join('') : '');
}

function renderStepOptionsForTeam(teamId) {
  const card = teamCardById.get(teamId);
  if (!card) return;
  const select = card.querySelector('.unlock-step-input');
  const previousValue = select.value;
  select.innerHTML = buildStepOptionsHtml(teamId);
  if (previousValue) select.value = previousValue;
}

// Types d'événements qui traduisent le passage réel par une étape (scan ou
// résolution, admin ou joueur) : servent à construire la liste des étapes
// déjà vues par l'équipe.
const STEP_VISITED_EVENT_TYPES = ['qr_scan', 'lock_solved', 'admin_unlock'];

function trackVisitedStep(teamId, event) {
  if (!STEP_VISITED_EVENT_TYPES.includes(event.type)) return;
  const payload = typeof event.payload === 'string' ? JSON.parse(event.payload || '{}') : (event.payload || {});
  if (payload.stepId == null) return;
  if (!visitedStepsByTeam.has(teamId)) visitedStepsByTeam.set(teamId, new Set());
  visitedStepsByTeam.get(teamId).add(String(payload.stepId));
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const password = document.getElementById('passwordInput').value;
  try {
    await apiFetch('/login', { method: 'POST', body: JSON.stringify({ password }) });
    showDashboard();
  } catch (err) {
    loginError.textContent = 'Mot de passe incorrect.';
    loginError.hidden = false;
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  await apiFetch('/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

// --- Liste des sessions ------------------------------------------------
const sessionListView = document.getElementById('sessionListView');
const sessionDetailView = document.getElementById('sessionDetailView');
const sessionList = document.getElementById('sessionList');
const createSessionForm = document.getElementById('createSessionForm');

const SESSION_STATUS_LABELS = { active: 'active', paused: 'en pause', closed: 'clôturée' };

function sessionRow(session) {
  const li = document.createElement('li');
  li.dataset.sessionId = session.id;
  li.innerHTML = `
    <span><strong>${session.code}</strong> — ${session.scenario_code}${session.name ? ' · ' + session.name : ''}
      <span class="badge ${session.status}">${SESSION_STATUS_LABELS[session.status] || session.status}</span>
      <span class="unread-badge" hidden></span>
    </span>
    <span class="muted session-row-meta">
      Créée le ${toDate(session.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
      · ${session.team_count} équipe(s)
      <button type="button" class="btn btn-danger btn-sm session-delete-btn" title="Supprimer définitivement cette session">Supprimer</button>
    </span>
  `;
  li.addEventListener('click', () => openSession(session.id));
  li.querySelector('.session-delete-btn').addEventListener('click', async (event) => {
    event.stopPropagation();
    const label = `${session.code}${session.name ? ' · ' + session.name : ''}`;
    const ok = await confirmAction(
      `Supprimer définitivement la session ${label} ?\n\nToutes les équipes, l'historique et les messages associés seront perdus, y compris des statistiques et classements. Cette action est irréversible.`,
      { confirmLabel: 'Supprimer' }
    );
    if (!ok) return;
    await apiFetch(`/sessions/${session.id}`, { method: 'DELETE' });
    await loadSessions();
  });
  return li;
}

// Repliées par défaut seulement pour les clôturées (celles qui s'accumulent
// au fil du temps) ; on retient ensuite le choix de l'admin d'un
// rafraîchissement à l'autre (création/suppression de session).
const sessionGroupOpenState = { active: true, paused: true, closed: false };

async function loadSessions() {
  const { sessions } = await apiFetch('/sessions');
  sessionList.innerHTML = '';
  sessions.forEach((session) => sessionMeta.set(session.id, { code: session.code, name: session.name }));

  // Le serveur renvoie déjà les sessions triées par date de création
  // décroissante ; on se contente de les répartir par statut.
  const active = sessions.filter((s) => s.status === 'active');
  const paused = sessions.filter((s) => s.status === 'paused');
  const closed = sessions.filter((s) => s.status === 'closed');

  const renderGroup = (key, title, list) => {
    if (!list.length) return;
    const details = document.createElement('details');
    details.className = 'session-group';
    details.open = sessionGroupOpenState[key];
    details.addEventListener('toggle', () => { sessionGroupOpenState[key] = details.open; });
    const summary = document.createElement('summary');
    summary.className = 'session-group-title';
    summary.textContent = `${title} (${list.length})`;
    details.appendChild(summary);
    const ul = document.createElement('ul');
    ul.className = 'session-list';
    list.forEach((session) => ul.appendChild(sessionRow(session)));
    details.appendChild(ul);
    sessionList.appendChild(details);
    list.forEach((session) => renderUnreadBadge(session.id));
  };

  renderGroup('active', 'Sessions actives', active);
  renderGroup('paused', 'Sessions en pause', paused);
  renderGroup('closed', 'Sessions clôturées', closed);

  if (!sessions.length) {
    sessionList.innerHTML = '<p class="muted">Aucune session pour le moment.</p>';
  }
}

createSessionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const scenarioCode = document.getElementById('scenarioCodeInput').value.trim();
  const name = document.getElementById('sessionNameInput').value.trim();
  const { session } = await apiFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({ scenarioCode, name })
  });
  createSessionForm.reset();
  await loadSessions();
  openSession(session.id);
});

// --- Détail d'une session ------------------------------------------------
const teamsGrid = document.getElementById('teamsGrid');
const teamCardTemplate = document.getElementById('teamCardTemplate');
let currentSessionId = null;
let currentScenarioCode = null;
let currentEventSource = null;
const teamCardById = new Map();

document.getElementById('backToListButton').addEventListener('click', () => {
  closeSessionStream();
  sessionDetailView.hidden = true;
  sessionListView.hidden = false;
  loadSessions();
});

document.getElementById('closeSessionButton').addEventListener('click', async () => {
  if (!currentSessionId) return;
  const ok = await confirmAction('Clôturer cette session ? Les équipes déjà inscrites verront leur app se verrouiller.', { confirmLabel: 'Clôturer' });
  if (!ok) return;
  await apiFetch(`/sessions/${currentSessionId}/close`, { method: 'POST' });
  openSession(currentSessionId);
});

document.getElementById('reopenSessionButton').addEventListener('click', async () => {
  if (!currentSessionId) return;
  await apiFetch(`/sessions/${currentSessionId}/reopen`, { method: 'POST' });
  openSession(currentSessionId);
});

document.getElementById('pauseSessionButton').addEventListener('click', () => {
  if (!currentSessionId) return;
  document.getElementById('pauseMessageInput').value = '';
  document.getElementById('pauseSessionModal').showModal();
});

document.getElementById('pauseSessionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentSessionId) return;
  const message = document.getElementById('pauseMessageInput').value.trim();
  await apiFetch(`/sessions/${currentSessionId}/pause`, { method: 'POST', body: JSON.stringify({ message }) });
  document.getElementById('pauseSessionModal').close();
  openSession(currentSessionId);
});

document.getElementById('resumeSessionButton').addEventListener('click', async () => {
  if (!currentSessionId) return;
  await apiFetch(`/sessions/${currentSessionId}/resume`, { method: 'POST' });
  openSession(currentSessionId);
});

function closeSessionStream() {
  if (currentEventSource) {
    currentEventSource.close();
    currentEventSource = null;
  }
}

async function openSession(sessionId) {
  closeSessionStream();
  currentSessionId = sessionId;
  sessionListView.hidden = true;
  sessionDetailView.hidden = false;
  teamsGrid.innerHTML = '';
  teamCardById.clear();

  unreadBySession.delete(sessionId);
  const banner = document.getElementById('otherSessionBanner');
  if (!banner.hidden && document.getElementById('otherSessionBannerText').textContent.includes(sessionMeta.get(sessionId)?.code)) {
    banner.hidden = true;
  }

  const { session, teams } = await apiFetch(`/sessions/${sessionId}`);
  currentScenarioCode = session.scenario_code;
  document.getElementById('sessionTitle').textContent = `${session.name || 'Session'} — ${session.code}`;
  document.getElementById('sessionMeta').textContent = `Scénario : ${session.scenario_code}`;
  document.getElementById('leaderboardLink').href = `${APP_BASE}/admin/leaderboard.html?code=${session.code}`;
  document.getElementById('solutionGuideLink').href = `${APP_BASE}/admin/solution-guide.html?scenario=${encodeURIComponent(session.scenario_code)}&mode=view`;
  document.getElementById('pauseSessionButton').hidden = session.status !== 'active';
  document.getElementById('resumeSessionButton').hidden = session.status !== 'paused';
  document.getElementById('closeSessionButton').hidden = session.status === 'closed';
  document.getElementById('reopenSessionButton').hidden = session.status !== 'closed';
  await renderSessionSettingsForm(session);

  await loadStepOptions(currentScenarioCode);
  teams.forEach(renderTeamCard);
  teams.forEach(loadTeamDetail);
  await loadScenarioSaves();

  currentEventSource = new EventSource(`${API}/sessions/${sessionId}/stream`, { withCredentials: true });
  currentEventSource.addEventListener('team-joined', (e) => renderTeamCard(JSON.parse(e.data)));
  currentEventSource.addEventListener('team-update', (e) => updateTeamCard(JSON.parse(e.data)));
  currentEventSource.addEventListener('message', (e) => appendMessageToCard(JSON.parse(e.data)));
  currentEventSource.addEventListener('team-event', (e) => prependHistoryEntry(JSON.parse(e.data)));
  currentEventSource.addEventListener('team-unlocked', (e) => {
    const { teamId, stepId } = JSON.parse(e.data);
    const card = teamCardById.get(teamId);
    if (card) flashUnlockConfirmation(card, stepId);
  });
}

// Sauvegardes réutilisables du scénario courant (indépendantes de la
// session) : chaque ligne propose de l'appliquer à l'une des équipes de la
// session actuellement affichée (elle doit ensuite rouvrir son QR de
// transfert pour recharger cet état sur son téléphone).
async function loadScenarioSaves() {
  const list = document.getElementById('scenarioSavesList');
  const empty = document.getElementById('scenarioSavesEmpty');
  const { saves } = await apiFetch(`/scenario-saves?scenarioCode=${encodeURIComponent(currentScenarioCode)}`);
  list.innerHTML = '';
  empty.hidden = saves.length > 0;
  saves.forEach((save) => {
    const li = document.createElement('li');
    const teamOptions = [...teamCardById.keys()]
      .map((teamId) => `<option value="${teamId}">${teamCardById.get(teamId).querySelector('.team-name').textContent}</option>`)
      .join('');
    li.innerHTML = `
      <span class="save-name">${save.name}</span>
      <span class="save-date">${new Date(save.created_at).toLocaleString('fr-FR')}</span>
      <select class="save-target-team">${teamOptions || '<option value="">Aucune équipe</option>'}</select>
      <button type="button" class="btn btn-sm btn-secondary save-load-btn">Charger</button>
      <button type="button" class="btn btn-sm btn-danger save-delete-btn">Supprimer</button>
    `;
    li.querySelector('.save-load-btn').addEventListener('click', async () => {
      const teamId = li.querySelector('.save-target-team').value;
      if (!teamId) return;
      try {
        await apiFetch(`/teams/${teamId}/load-state`, { method: 'POST', body: JSON.stringify({ saveId: save.id }) });
        alert('Sauvegarde chargée : l\'équipe doit rouvrir son QR de transfert (ou le rescanner) pour la récupérer sur son téléphone.');
      } catch (err) {
        alert(err.message);
      }
    });
    li.querySelector('.save-delete-btn').addEventListener('click', async () => {
      if (!(await confirmAction(`Supprimer la sauvegarde "${save.name}" ?`, { confirmLabel: 'Supprimer' }))) return;
      await apiFetch(`/scenario-saves/${save.id}`, { method: 'DELETE' });
      await loadScenarioSaves();
    });
    list.appendChild(li);
  });
}

// Réglages de session (indices, minuteur...) qui surchargent le scénario par
// défaut : "" dans un <select> signifie "pas de surcharge, valeur du
// scénario", toute autre valeur écrase le champ correspondant pour cette
// session uniquement.
async function renderSessionSettingsForm(session) {
  let override = {};
  try { override = JSON.parse(session.settings_override || '{}'); } catch { override = {}; }

  let scenarioData = {};
  try { scenarioData = await getScenarioData(session.scenario_code); } catch { scenarioData = {}; }

  // La première option de chaque liste affiche la valeur réelle du scénario
  // (pas un vague "par défaut") pour que l'admin sache ce qu'elle applique
  // en la laissant sélectionnée.
  const setBoolField = (id, key, activeLabel, inactiveLabel) => {
    const select = document.getElementById(id);
    select.options[0].textContent = `${scenarioData[key] ? activeLabel : inactiveLabel} (valeur du scénario)`;
    select.value = override[key] === undefined ? '' : String(override[key]);
  };
  setBoolField('settingHints', 'hints', 'Activés', 'Désactivés');
  setBoolField('settingProgressBar', 'progressBar', 'Activée', 'Désactivée');
  setBoolField('settingMap', 'map', 'Activée', 'Désactivée');
  setBoolField('settingChat', 'chat', 'Activée', 'Désactivée');
  setBoolField('settingTimer', 'timer', 'Activé', 'Désactivé');

  document.getElementById('settingMapMedia').value = override.mapMedia || '';
  document.getElementById('settingMapImageUpload').value = '';
  renderSessionMapPreview(session, override.mapMedia);

  // "chrono" (minuteur simple) est représenté par une chaîne vide dans le
  // scenario.json ; on le distingue ici de "" = "pas de surcharge".
  const TIMER_TYPE_LABELS = { countdown: 'Décompte', endHour: 'Heure de fin fixe', '': 'Chrono simple' };
  const timerTypeSelect = document.getElementById('settingTimerType');
  timerTypeSelect.options[0].textContent = `${TIMER_TYPE_LABELS[scenarioData.timerType || ''] || scenarioData.timerType} (valeur du scénario)`;
  timerTypeSelect.value = override.timerType === undefined ? '' : (override.timerType || 'chrono');

  const timerParamInput = document.getElementById('settingTimerParam');
  timerParamInput.placeholder = `vide = valeur du scénario (${scenarioData.timerParam ?? '—'})`;
  timerParamInput.value = override.timerParam ?? '';

  document.getElementById('sessionSettingsStatus').textContent = '';
}

function renderSessionMapPreview(session, mediaName) {
  const preview = document.getElementById('settingMapImagePreview');
  preview.innerHTML = '';
  if (!mediaName) return;
  const img = document.createElement('img');
  img.src = scenarioImageUrl(session.scenario_code, mediaName);
  img.alt = mediaName;
  img.addEventListener('error', () => { preview.textContent = `${mediaName} (aperçu indisponible)`; }, { once: true });
  preview.appendChild(img);
}

document.getElementById('settingMapImageUpload').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || !currentSessionId) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const { filename } = await apiFetch(`/sessions/${currentSessionId}/map-image`, { method: 'POST', body: formData });
    document.getElementById('settingMapMedia').value = filename;
    const { session } = await apiFetch(`/sessions/${currentSessionId}`);
    renderSessionMapPreview(session, filename);
  } catch (err) {
    alert(`Échec de l'envoi de l'image : ${err.message}`);
  }
});

document.getElementById('saveSessionSettingsButton').addEventListener('click', async () => {
  if (!currentSessionId) return;
  const statusEl = document.getElementById('sessionSettingsStatus');

  const parseBoolField = (id) => {
    const value = document.getElementById(id).value;
    return value === '' ? undefined : value === 'true';
  };
  const settingsOverride = {};
  ['Hints:hints', 'ProgressBar:progressBar', 'Map:map', 'Chat:chat', 'Timer:timer'].forEach((pair) => {
    const [suffix, key] = pair.split(':');
    const value = parseBoolField(`setting${suffix}`);
    if (value !== undefined) settingsOverride[key] = value;
  });
  const timerTypeRaw = document.getElementById('settingTimerType').value;
  if (timerTypeRaw !== '') settingsOverride.timerType = timerTypeRaw === 'chrono' ? '' : timerTypeRaw;
  const timerParamRaw = document.getElementById('settingTimerParam').value.trim();
  if (timerParamRaw !== '') settingsOverride.timerParam = Number.isNaN(Number(timerParamRaw)) ? timerParamRaw : Number(timerParamRaw);
  const mapMediaRaw = document.getElementById('settingMapMedia').value.trim();
  if (mapMediaRaw !== '') settingsOverride.mapMedia = mapMediaRaw;

  try {
    await apiFetch(`/sessions/${currentSessionId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ settingsOverride })
    });
    statusEl.textContent = 'Enregistré ✓';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  } catch (err) {
    statusEl.textContent = `Erreur : ${err.message}`;
  }
});

// SQLite (strftime %fZ) renvoie déjà un "Z" final ; ne pas en rajouter un
// second sous peine d'Invalid Date.
function toDate(isoString) {
  return new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
}

function formatDuration(ms) {
  if (!ms) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const seconds = Math.floor((Date.now() - toDate(isoString).getTime()) / 1000);
  if (seconds < 5) return 'à l\'instant';
  if (seconds < 60) return `il y a ${seconds}s`;
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  return `il y a ${Math.floor(seconds / 3600)} h`;
}

function renderTeamCard(team) {
  let card = teamCardById.get(team.id);
  if (!card) {
    card = teamCardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.teamId = team.id;
    teamsGrid.appendChild(card);
    teamCardById.set(team.id, card);
    renderStepOptionsForTeam(team.id);

    const renderUnlockStepPreview = () => {
      const preview = card.querySelector('.unlock-step-preview');
      const input = card.querySelector('.unlock-step-input');
      const step = input.value ? getStepSync(Number(input.value)) : null;
      if (!step) {
        preview.innerHTML = '';
        return;
      }
      const imgSrc = step.media ? scenarioImageUrl(currentScenarioCode, step.media) : '';
      const description = (step.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
      preview.innerHTML = `<div class="unlock-step-preview-item">
        ${imgSrc ? `<img src="${imgSrc}" alt="" onerror="this.remove()">` : ''}
        <div><strong>${step.name || '(sans nom)'}</strong>${description ? `<p>${description}${description.length >= 100 ? '…' : ''}</p>` : ''}</div>
      </div>`;
    };
    card.querySelector('.unlock-step-input').addEventListener('change', renderUnlockStepPreview);

    card.querySelector('.team-transfer-btn').addEventListener('click', () => {
      document.getElementById('transferQrTeamName').textContent = card.querySelector('.team-name').textContent;
      document.getElementById('transferQrImage').src = `${API}/teams/${team.id}/resume-qrcode`;
      document.getElementById('transferQrDialog').showModal();
    });

    card.querySelector('.team-save-btn').addEventListener('click', async () => {
      const name = await promptAction('Nom de cette sauvegarde :', {
        title: 'Sauvegarder l\'état',
        confirmLabel: 'Sauvegarder',
        placeholder: 'ex : Après énigme 3'
      });
      if (!name) return;
      try {
        await apiFetch(`/teams/${team.id}/save-state`, { method: 'POST', body: JSON.stringify({ name }) });
        await loadScenarioSaves();
      } catch (err) {
        alert(err.message);
      }
    });

    card.querySelector('.unlock-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = card.querySelector('.unlock-step-input');
      if (!input.value) return;
      await apiFetch(`/teams/${team.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ stepId: input.value.trim(), action: 'add' })
      });
      input.value = '';
      renderUnlockStepPreview();
    });

    card.querySelector('.hint-plus').addEventListener('click', () => {
      apiFetch(`/teams/${team.id}/hints`, { method: 'POST', body: JSON.stringify({ delta: 1 }) });
    });
    card.querySelector('.hint-minus').addEventListener('click', () => {
      apiFetch(`/teams/${team.id}/hints`, { method: 'POST', body: JSON.stringify({ delta: -1 }) });
    });

    card.querySelector('.chat-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = card.querySelector('.chat-input');
      if (!input.value.trim()) return;
      await apiFetch(`/teams/${team.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: input.value.trim() })
      });
      input.value = '';
    });

    // Consulter le fil de discussion (ou y répondre, ou simplement déplier
    // l'accordéon "Messagerie") marque l'équipe comme lue.
    const markTeamRead = () => {
      card.querySelector('.team-unread-dot').hidden = true;
      card.querySelector('.chat-summary-unread-dot').hidden = true;
    };
    const chatSection = card.querySelector('.chat-section');
    card.querySelector('.chat-thread').addEventListener('click', markTeamRead);
    card.querySelector('.chat-input').addEventListener('focus', markTeamRead);
    chatSection.addEventListener('toggle', () => { if (chatSection.open) markTeamRead(); });
  }
  updateTeamCard(team);
  return card;
}

function updateTeamCard(team) {
  const card = teamCardById.get(team.id);
  if (!card) return;
  card.querySelector('.team-name').textContent = team.name;
  const status = card.querySelector('.team-status');
  if (!team.finishedAt) {
    status.textContent = 'En cours';
    status.className = 'team-status badge active';
  } else if (team.outcome === 'timeout') {
    status.textContent = 'Temps écoulé';
    status.className = 'team-status badge timeout';
  } else if (team.outcome === 'closed') {
    status.textContent = 'Session clôturée';
    status.className = 'team-status badge timeout';
  } else {
    status.textContent = 'Terminé';
    status.className = 'team-status badge closed';
  }
  card.querySelector('.progress-bar-fill').style.width = `${Math.min(100, team.progressPercent || 0)}%`;
  card.querySelector('.stat-progress').textContent = `${Math.round(team.progressPercent || 0)}%`;
  card.querySelector('.stat-time').textContent = formatDuration(team.elapsedMs);
  card.querySelector('.stat-hints').textContent = team.hintsUsed ?? 0;
  card.querySelector('.stat-step').textContent = team.currentStepId ?? '—';
  card.querySelector('.stat-lastseen').textContent = formatRelativeTime(team.lastSeenAt);
  card.dataset.lastSeenAt = team.lastSeenAt || '';
  card.dataset.finished = team.finishedAt ? '1' : '';
  updatePresenceDot(card);
}

// Équipe considérée hors ligne si aucun signal (heartbeat toutes les 20s,
// voir backendSync.js côté jeu) depuis 50s — un peu plus de deux battements
// manqués, pour absorber la gigue réseau sans fausse alerte.
const PRESENCE_OFFLINE_AFTER_MS = 50000;

function updatePresenceDot(card) {
  const dot = card.querySelector('.presence-dot');
  if (!dot) return;
  if (card.dataset.finished) {
    dot.className = 'presence-dot presence-na';
    dot.title = '';
    return;
  }
  const lastSeenAt = card.dataset.lastSeenAt;
  if (!lastSeenAt) {
    dot.className = 'presence-dot presence-na';
    dot.title = 'Aucun signal reçu';
    return;
  }
  const ageMs = Date.now() - toDate(lastSeenAt).getTime();
  if (ageMs <= PRESENCE_OFFLINE_AFTER_MS) {
    dot.className = 'presence-dot presence-online';
    dot.title = 'En ligne';
  } else {
    dot.className = 'presence-dot presence-offline';
    dot.title = 'Hors ligne (dernier signal ' + formatRelativeTime(lastSeenAt) + ')';
  }
}

// Un badge peut passer "hors ligne" sans qu'aucun événement n'arrive (c'est
// justement l'absence de signal qu'on veut détecter) : un simple rafraîchissement
// périodique de tous les badges, indépendant du flux SSE, est nécessaire.
setInterval(() => {
  teamCardById.forEach((card) => updatePresenceDot(card));
}, 5000);

async function loadTeamDetail(team) {
  const card = teamCardById.get(team.id);
  if (!card) return;
  const { messages, events } = await apiFetch(`/teams/${team.id}`);
  const thread = card.querySelector('.chat-thread');
  thread.innerHTML = messages.length ? '' : '<p class="chat-empty">Aucun message pour l\'instant.</p>';
  messages.forEach((m) => appendMessageBubble(thread, m));

  visitedStepsByTeam.set(team.id, new Set());
  events.forEach((e) => trackVisitedStep(team.id, e));
  renderStepOptionsForTeam(team.id);

  const list = card.querySelector('.history-list');
  list.innerHTML = '';
  events.filter((e) => e.type !== 'heartbeat').reverse().forEach((e) => list.appendChild(historyRow(e)));
  if (!list.children.length) {
    list.innerHTML = '<li class="history-empty">Aucun événement pour le moment.</li>';
  }
}

const EVENT_LABELS = {
  qr_scan: 'QR scanné',
  lock_solved: 'Cadenas résolu',
  hint_used: 'Indice consulté',
  hint_lost: 'Indice perdu',
  admin_unlock: 'Ajout admin',
  admin_hint_adjust: 'Indice ajusté par l\'admin',
  game_finished: 'Partie terminée'
};

// Lecture synchrone d'une étape depuis le scénario déjà mis en cache (chargé
// via loadStepOptions avant l'affichage de l'historique) : sert à savoir si
// l'étape a un lockType, pour afficher un pictogramme de cadenas.
function getStepSync(stepOrCode) {
  const scenario = scenarioCache.get(currentScenarioCode);
  if (!scenario) return null;
  return scenario.steps.find((s) => s.id === stepOrCode || String(s.id) === String(stepOrCode) || s.code === stepOrCode) || null;
}

function historyRow(event) {
  const li = document.createElement('li');
  const payload = typeof event.payload === 'string' ? JSON.parse(event.payload || '{}') : (event.payload || {});
  const stepId = payload.stepId ?? payload.code;

  let label = EVENT_LABELS[event.type] || event.type;
  if (event.type === 'admin_unlock' && payload.action === 'resolve') {
    label = 'Cadenas résolu (admin)';
  }
  const details = [];
  if (payload.stepId != null) details.push(`étape ${payload.stepId}`);
  if (payload.code != null) details.push(`code « ${payload.code} »`);
  if (details.length) label += ` (${details.join(', ')})`;

  const step = stepId != null ? getStepSync(stepId) : null;
  const lockIcon = step && step.lockType != null ? '🔒 ' : '';

  li.innerHTML = `<span>${lockIcon}${label}</span><span class="history-time"></span>`;
  li.querySelector('.history-time').textContent = toDate(event.created_at).toLocaleTimeString('fr-FR');
  if (stepId != null) {
    li.addEventListener('click', () => openStepPreview(stepId, event));
  } else {
    li.style.cursor = 'default';
  }
  return li;
}

function prependHistoryEntry(event) {
  if (event.type === 'heartbeat') {
    // Sert uniquement à garder "dernier signal" à jour, pas d'entrée d'historique.
    return;
  }
  const card = teamCardById.get(event.team_id);
  if (!card) return;
  trackVisitedStep(event.team_id, event);
  renderStepOptionsForTeam(event.team_id);
  const list = card.querySelector('.history-list');
  list.querySelector('.history-empty')?.remove();
  list.insertBefore(historyRow(event), list.firstChild);
}

// --- Aperçu d'une étape (contenu vu par l'équipe à ce moment) --------------
// Même condition que côté app joueur (scripts/game.js, onUnlock) : un
// déblocage n'est simulable automatiquement que s'il y a une seule
// résolution possible (un verrou/objet -> une étape suivante précise).
function isStepUnlockable(step) {
  return step.lockType != null && step.replaceBy != null && !Array.isArray(step.replaceBy);
}

async function openStepPreview(stepId, event) {
  const title = document.getElementById('stepPreviewTitle');
  const meta = document.getElementById('stepPreviewMeta');
  const image = document.getElementById('stepPreviewImage');
  const description = document.getElementById('stepPreviewDescription');
  const unlockButton = document.getElementById('stepPreviewUnlockButton');
  title.textContent = 'Chargement…';
  meta.textContent = '';
  image.innerHTML = '';
  description.innerHTML = '';
  unlockButton.hidden = true;
  unlockButton.onclick = null;
  document.getElementById('stepPreviewModal').showModal();

  try {
    const scenario = await getScenarioData(currentScenarioCode);
    const step = scenario.steps.find((s) => s.id === stepId || String(s.id) === String(stepId));
    if (!step) {
      title.textContent = 'Étape introuvable';
      description.textContent = `Aucune étape ne correspond à l'identifiant « ${stepId} » dans ce scénario.`;
      return;
    }
    title.textContent = step.name || `Étape ${step.id}`;
    meta.textContent = event ? `Vu le ${toDate(event.created_at).toLocaleString('fr-FR')}` : '';
    if (step.media) {
      image.innerHTML = `<img src="${scenarioImageUrl(currentScenarioCode, step.media)}" alt="">`;
    }
    description.innerHTML = step.description || '<em>Pas de description.</em>';

    if (event?.team_id && isStepUnlockable(step)) {
      unlockButton.hidden = false;
      unlockButton.onclick = async () => {
        unlockButton.disabled = true;
        await apiFetch(`/teams/${event.team_id}/unlock`, {
          method: 'POST',
          body: JSON.stringify({ stepId: step.id, action: 'resolve' })
        });
        document.getElementById('stepPreviewModal').close();
      };
    }
  } catch {
    title.textContent = 'Erreur';
    description.textContent = "Impossible de charger le contenu de cette étape.";
  }
}

function appendMessageBubble(thread, message) {
  thread.querySelector('.chat-empty')?.remove();
  const bubble = document.createElement('div');
  bubble.className = 'chat-message ' + message.sender;
  bubble.textContent = message.text;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
}

function appendMessageToCard(message) {
  const card = teamCardById.get(message.team_id);
  if (!card) return;
  appendMessageBubble(card.querySelector('.chat-thread'), message);
  if (message.sender !== 'team') return;
  // Pas besoin de notifier si l'admin a déjà la messagerie ouverte sous les yeux.
  if (card.querySelector('.chat-section').open) return;
  card.querySelector('.team-unread-dot').hidden = false;
  card.querySelector('.chat-summary-unread-dot').hidden = false;
}

function flashUnlockConfirmation(card, stepId) {
  const status = card.querySelector('.team-status');
  const previous = status.textContent;
  status.textContent = `Débloqué : ${stepId}`;
  setTimeout(() => { status.textContent = previous; }, 3000);
}

// --- Démarrage : vérifie si une session admin est déjà active ------------
apiFetch('/me').then(showDashboard).catch(() => showLogin());
