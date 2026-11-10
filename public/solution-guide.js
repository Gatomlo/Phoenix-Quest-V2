const API = '/api/admin';

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, { credentials: 'include', ...options });
  if (res.status === 401) {
    window.location.href = '/admin/';
    throw new Error('Non authentifié');
  }
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : null;
  if (!res.ok) throw new Error(data?.error || 'Erreur serveur');
  return data;
}

document.addEventListener('click', (event) => {
  const closer = event.target.closest('[data-close-modal]');
  if (closer) closer.closest('dialog')?.close();
});

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

// Cette page sert deux usages distincts : la conception du guide (depuis
// l'éditeur de scénarios, tous les contrôles actifs) et sa simple consultation
// pendant une session (depuis la gestion de session, lecture seule — pour
// qu'un animateur ne puisse pas le modifier par mégarde en cours de partie).
const params = new URLSearchParams(window.location.search);
const scenarioCode = params.get('scenario');
const isViewMode = params.get('mode') === 'view';
document.body.dataset.mode = isViewMode ? 'view' : 'edit';

if (!scenarioCode) {
  document.body.innerHTML = '<p class="error-text">Aucun scénario indiqué (paramètre ?scenario= manquant).</p>';
  throw new Error('scenario manquant');
}

try {
  await apiFetch('/me');
} catch {
  // apiFetch redirige déjà vers / sur 401.
}

const { scenario } = await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(scenarioCode)}`);
document.getElementById('scenarioNameTitle').textContent = scenario.nameStory || scenarioCode;
document.title = `${isViewMode ? 'Guide de solution (lecture)' : 'Guide de solution'} — ${scenario.nameStory || scenarioCode}`;

let guide = { entries: [] };
try {
  guide = await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(scenarioCode)}/guide`);
} catch {
  // Pas encore de guide.json pour ce scénario : on part d'un guide vide.
}
if (!Array.isArray(guide.entries)) guide.entries = [];

function findStep(id) {
  return scenario.steps.find((s) => s.id === id);
}

function stepImageSrc(step) {
  return step?.media
    ? `${API}/scenario-editor/scenarios/${encodeURIComponent(scenarioCode)}/images/${encodeURIComponent(step.media)}`
    : '';
}

// `onerror` masque l'image plutôt que de laisser l'icône "image cassée" du
// navigateur si le serveur de l'app joueur (qui héberge les images) n'est
// pas joignable ou n'a pas encore fini de démarrer.
function imgTag(src, extraClass = '') {
  return src ? `<img class="${extraClass}" src="${src}" alt="" onerror="this.remove()">` : '';
}

function plainDescription(step, max = 220) {
  return (step?.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Solution du cadenas, lisible et fidèle au vocabulaire visuel de
// l'éditeur (mêmes couleurs/flèches/grilles), plutôt que le lockCode JSON brut.
const COLOR_PALETTE = [
  ['Rose', 'F06292'], ['Bleu', '0b30d9'], ['Vert', '0c9411'],
  ['Jaune', 'fafa1e'], ['Orange', 'ff8d0d'], ['Rouge', 'ff0000'],
  ['Violet', '7B1FA2'], ['Marron', '582900'], ['Gris', '878787'], ['Noir', '000000']
];
const COLOR_LABEL_BY_HEX = Object.fromEntries(COLOR_PALETTE.map(([label, hex]) => [hex.toLowerCase(), label]));
const DIRECTION_LABELS = {
  no: '↖ haut-gauche', n: '↑ haut', ne: '↗ haut-droite', o: '← gauche',
  e: '→ droite', so: '↙ bas-gauche', s: '↓ bas', se: '↘ bas-droite'
};
const DIAGRAM_POSITIONS = [[20, 20], [50, 20], [80, 20], [20, 50], [50, 50], [80, 50], [20, 80], [50, 80], [80, 80]];

function lockSolutionBlock(title, innerHtml) {
  return `<div class="lock-solution">
    <p class="lock-solution-title">${title}</p>
    ${innerHtml}
  </div>`;
}

function renderLockSolution(step) {
  const lockType = step?.lockType;
  if (!lockType) return '';

  if (lockType === 'sonoMeter') {
    return lockSolutionBlock('Cadenas sonomètre', '<p class="muted">Résolution aléatoire en jeu (bruit ambiant + symboles) — pas de code fixe à connaître.</p>');
  }
  if (lockType === 'withObject') {
    return lockSolutionBlock('Lieu verrouillé', '<p class="muted">Se résout en fournissant l\'objet à associer indiqué ci-dessus, aucun autre code à connaître.</p>');
  }

  const code = step.lockCode;

  if (lockType === 'color' && Array.isArray(code)) {
    const chips = code.map((hex) => {
      const clean = String(hex).replace('#', '').toLowerCase();
      const label = COLOR_LABEL_BY_HEX[clean] || hex;
      return `<span class="lock-sequence-chip" style="background:#${clean}">${escapeHtml(label)}</span>`;
    }).join('');
    return lockSolutionBlock('Code couleurs', `<div class="lock-sequence-display readonly">${chips || '<span class="lock-sequence-empty">Aucun code</span>'}</div>`);
  }

  if (lockType === 'digit' && Array.isArray(code)) {
    const chips = code.map((d) => `<span class="lock-sequence-chip">${escapeHtml(d)}</span>`).join('');
    return lockSolutionBlock('Code chiffré', `<div class="lock-sequence-display readonly">${chips || '<span class="lock-sequence-empty">Aucun code</span>'}</div>`);
  }

  if (lockType === 'directionnal' && Array.isArray(code)) {
    const chips = code.map((d) => `<span class="lock-sequence-chip">${DIRECTION_LABELS[d] || d}</span>`).join('');
    return lockSolutionBlock('Code directionnel', `<div class="lock-sequence-display readonly">${chips || '<span class="lock-sequence-empty">Aucun code</span>'}</div>`);
  }

  if (lockType === 'fuse' && Array.isArray(code)) {
    const dots = code.map((on) => `<span class="lock-grid-btn lock-fuse-btn readonly${on ? ' on' : ''}">${on ? '●' : '○'}</span>`).join('');
    return lockSolutionBlock('Interrupteurs à activer (grille 4×4)', `<div class="lock-grid cols-4 readonly">${dots}</div>`);
  }

  const diagramCode = typeof code === 'number' ? code : (Array.isArray(code) && typeof code[0] === 'number' ? code[0] : null);
  if (lockType === 'diagram' && diagramCode !== null) {
    const sequence = String(diagramCode).split('').map(Number);
    const lines = [];
    for (let i = 1; i < sequence.length; i++) {
      const [x1, y1] = DIAGRAM_POSITIONS[sequence[i - 1] - 1] || [0, 0];
      const [x2, y2] = DIAGRAM_POSITIONS[sequence[i] - 1] || [0, 0];
      lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>`);
    }
    const dots = DIAGRAM_POSITIONS.map(([x, y], i) => {
      const active = sequence.includes(i + 1);
      return `<circle class="dot${active ? ' active' : ''}" cx="${x}" cy="${y}" r="5"></circle><text x="${x}" y="${y - 7}" text-anchor="middle">${i + 1}</text>`;
    }).join('');
    return lockSolutionBlock('Schéma à reproduire', `<svg viewBox="0 0 100 100" class="lock-diagram-svg readonly">${lines.join('')}${dots}</svg>`);
  }

  if (lockType === 'date' && typeof code === 'string') {
    return lockSolutionBlock('Date attendue', `<p class="lock-solution-value">${escapeHtml(code)}</p>`);
  }

  if (lockType === 'password' && typeof code === 'string') {
    return lockSolutionBlock('Mot de passe attendu', `<p class="lock-solution-value">${escapeHtml(code)}</p>`);
  }

  if (lockType === 'login' && Array.isArray(code)) {
    const [login, password] = code;
    return lockSolutionBlock('Identifiants attendus', `<p class="lock-solution-value">Identifiant : ${escapeHtml(login)}<br>Mot de passe : ${escapeHtml(password)}</p>`);
  }

  if (lockType === 'sliders' && Array.isArray(code)) {
    const rows = code.map(([label, value]) => `<li>${escapeHtml(label)} : <strong>${escapeHtml(value)}</strong></li>`).join('');
    return lockSolutionBlock('Position des curseurs', `<ul class="lock-solution-list">${rows}</ul>`);
  }

  if (lockType === 'selector' && Array.isArray(code)) {
    const rows = code.map(([, targetId], index) => {
      const target = findStep(targetId);
      return `<li>Zone ${index + 1} → mène à : <strong>${escapeHtml(target?.name || `étape #${targetId}`)}</strong></li>`;
    }).join('');
    return lockSolutionBlock('Zones cliquables', `<ul class="lock-solution-list">${rows}</ul>`);
  }

  return lockSolutionBlock(`Cadenas (${escapeHtml(lockType)})`, '<p class="muted">Format non reconnu pour un affichage détaillé.</p>');
}

function renderAutoLink(step, field, label) {
  const linkedId = step?.[field];
  if (linkedId === null || linkedId === undefined || linkedId === '') return '';
  const linked = findStep(linkedId);
  if (!linked) return '';
  return `<div class="guide-entry-link-chip">
    <span class="link-tag">${label}</span>
    ${imgTag(stepImageSrc(linked))}
    <span>${escapeHtml(linked.name || '(sans nom)')}${linked.code ? ` (${escapeHtml(linked.code)})` : ''}</span>
  </div>`;
}

const addStepSelect = document.getElementById('addStepSelect');
const guideList = document.getElementById('guideList');
const guideEmpty = document.getElementById('guideEmpty');
const saveStatus = document.getElementById('guideSaveStatus');
const guideToolbar = document.getElementById('guideToolbar');
const guideFilterGroup = document.getElementById('guideFilterGroup');
const guideFilterInfo = document.getElementById('guideFilterInfo');

// Rôle d'une étape dans l'histoire (champ `role` du scénario, informatif : le
// jeu ne lit que `progressBar`) :
//  - mecanique   : obligatoire, fait avancer le scénario ;
//  - narration   : bonus narratif, fait avancer l'histoire sans bloquer ;
//  - facultative : fausse piste.
// Un scénario sans `role` retombe sur la seule information progressBar, qui
// n'est PAS un synonyme de « facultative » (un lieu de passage peut ne pas
// compter tout en étant indispensable).
const ROLE_LABELS = { mecanique: 'Obligatoire', narration: 'Bonus narratif', facultative: 'Facultative' };
const hasRoles = scenario.steps.some((s) => ROLE_LABELS[s.role]);

function stepRole(step) {
  return step && ROLE_LABELS[step.role] ? step.role : null;
}

// Bandeau à afficher sur une étape (null = aucun).
function ribbonFor(step) {
  const role = stepRole(step);
  if (role === 'facultative') {
    return { kind: 'facultative', text: 'Facultative · fausse piste, ne compte pas dans la progression', title: 'Cette étape peut être ignorée sans bloquer la résolution (progressBar: false).' };
  }
  if (role === 'narration') {
    return step.progressBar
      ? { kind: 'narration', text: 'Bonus narratif', title: 'Ne bloque pas le scénario mais fait avancer l\'histoire ; compte dans la progression.' }
      : { kind: 'narration', text: 'Bonus narratif · ne compte pas dans la progression', title: 'Chemin alternatif : un seul de ces chemins est joué, il n\'est donc pas compté.' };
  }
  if (!role && scenario.progressBar && step && !step.progressBar) {
    return { kind: 'uncounted', text: 'Ne compte pas dans la progression', title: 'Cette étape ne fait pas avancer la barre de progression (progressBar: false). Elle peut quand même être nécessaire pour continuer.' };
  }
  return null;
}

const FILTERS = hasRoles
  ? [
      { id: 'all', label: 'Toutes', test: () => true },
      { id: 'story', label: 'Sans les facultatives', test: (step) => stepRole(step) !== 'facultative' },
      { id: 'required', label: 'Obligatoires', test: (step) => stepRole(step) === 'mecanique' }
    ]
  : [
      { id: 'all', label: 'Toutes les étapes', test: () => true },
      { id: 'counted', label: 'Étapes comptées', test: (step) => !scenario.progressBar || Boolean(step?.progressBar) }
    ];

const FILTER_STORAGE_KEY = 'phoenixGuideFilter';
let guideFilter = 'all';
try {
  const saved = localStorage.getItem(FILTER_STORAGE_KEY);
  if (FILTERS.some((f) => f.id === saved)) guideFilter = saved;
} catch { /* stockage indisponible : filtre par défaut */ }

function isEntryVisible(entry) {
  const step = findStep(entry.stepId);
  if (!step) return true; // étape introuvable : on la garde visible pour la signaler
  return FILTERS.find((f) => f.id === guideFilter).test(step);
}

// Les flèches Monter/Descendre échangent avec l'entrée VISIBLE voisine, pour
// ne pas faire « sauter » une entrée masquée par le filtre.
function adjacentVisibleIndex(index, direction) {
  for (let i = index + direction; i >= 0 && i < guide.entries.length; i += direction) {
    if (isEntryVisible(guide.entries[i])) return i;
  }
  return -1;
}

function updateToolbar() {
  const flagged = guide.entries.filter((e) => ribbonFor(findStep(e.stepId))).length;
  // Rien à filtrer : on masque la barre.
  guideToolbar.hidden = flagged === 0;
  if (guideToolbar.hidden) guideFilter = 'all';
  guideFilterGroup.innerHTML = FILTERS.map((f) => {
    const count = guide.entries.filter((e) => {
      const step = findStep(e.stepId);
      return !step || f.test(step);
    }).length;
    const on = f.id === guideFilter;
    return `<button type="button" data-filter="${f.id}" class="${on ? 'on' : ''}" aria-pressed="${on}">${f.label} <span class="count">${count}</span></button>`;
  }).join('');
  if (hasRoles) {
    const byRole = (role) => guide.entries.filter((e) => stepRole(findStep(e.stepId)) === role).length;
    guideFilterInfo.textContent = `${byRole('mecanique')} obligatoires · ${byRole('narration')} bonus narratifs · ${byRole('facultative')} facultatives`;
  } else {
    guideFilterInfo.textContent = `${flagged} étape${flagged > 1 ? 's' : ''} ne compte${flagged > 1 ? 'nt' : ''} pas dans la progression (elles peuvent rester nécessaires pour avancer)`;
  }
}

guideFilterGroup.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  guideFilter = button.dataset.filter;
  try { localStorage.setItem(FILTER_STORAGE_KEY, guideFilter); } catch { /* non bloquant */ }
  renderGuideList();
});

if (isViewMode) {
  guideEmpty.textContent = 'Aucune étape dans ce guide pour l\'instant.';
  document.querySelector('.guide-add-row').hidden = true;
  document.querySelector('.scenario-save-bar').hidden = true;
  document.getElementById('viewModeBanner').hidden = false;
}

function renderAddSelect() {
  if (isViewMode) return;
  const usedIds = new Set(guide.entries.map((e) => e.stepId));
  const available = [...scenario.steps]
    .filter((s) => !usedIds.has(s.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  addStepSelect.innerHTML = '<option value="">Ajouter une étape au parcours...</option>' +
    available.map((s) => {
      // Un <option> ne peut afficher qu'un caractère avant le texte (pas
      // d'image/icône réelle possible dans un <select> natif) — un cadenas
      // repère donc en un coup d'œil les étapes qui ont un lockType.
      const lockIcon = s.lockType ? '🔒 ' : '';
      return `<option value="${s.id}">${lockIcon}${escapeHtml(s.name || '(sans nom)')} #${s.id}${s.code ? ` — ${escapeHtml(s.code)}` : ''}</option>`;
    }).join('');
}

function noteLocationHtml(entry) {
  if (isViewMode) {
    const rows = [];
    if (entry.note) rows.push(`<p class="guide-entry-readonly-field"><strong>Information :</strong> ${escapeHtml(entry.note)}</p>`);
    if (entry.location) rows.push(`<p class="guide-entry-readonly-field"><strong>Localisation :</strong> ${escapeHtml(entry.location)}</p>`);
    return rows.join('');
  }
  return `<div class="form-grid">
    <label class="span-2">Texte informatif (aide pour l'animateur)
      <textarea class="guide-entry-note" rows="2">${escapeHtml(entry.note || '')}</textarea>
    </label>
    <label class="span-2">Localisation (où se trouve le QR code à scanner)
      <input type="text" class="guide-entry-location" value="${escapeHtml(entry.location || '')}" placeholder="ex : sous le tapis rouge, dans le tiroir de gauche...">
    </label>
  </div>`;
}

function entryActionsHtml(index, noQr) {
  const qrBtn = `<button type="button" class="btn btn-secondary btn-sm guide-show-qr" ${noQr ? 'disabled' : ''}>Afficher le QR</button>`;
  if (isViewMode) {
    return `<div class="guide-entry-actions">${qrBtn}</div>`;
  }
  return `<div class="guide-entry-actions">
    <button type="button" class="btn btn-secondary btn-sm guide-move-up" title="Monter" ${adjacentVisibleIndex(index, -1) === -1 ? 'disabled' : ''}>↑</button>
    <button type="button" class="btn btn-secondary btn-sm guide-move-down" title="Descendre" ${adjacentVisibleIndex(index, 1) === -1 ? 'disabled' : ''}>↓</button>
    ${qrBtn}
    <button type="button" class="btn btn-danger btn-sm guide-remove">Retirer</button>
  </div>`;
}

function renderGuideList() {
  updateToolbar();
  const visibleCount = guide.entries.filter(isEntryVisible).length;
  guideEmpty.hidden = visibleCount > 0;
  if (guide.entries.length > 0 && visibleCount === 0) {
    guideEmpty.textContent = 'Aucune étape à afficher avec ce filtre.';
  } else {
    guideEmpty.textContent = isViewMode
      ? 'Aucune étape dans ce guide pour l\'instant.'
      : 'Aucune étape dans ce guide pour l\'instant. Ajoutez-en une ci-dessus pour commencer le parcours.';
  }

  let rank = 0;
  guideList.innerHTML = guide.entries.map((entry, index) => {
    if (!isEntryVisible(entry)) return '';
    rank += 1;
    const step = findStep(entry.stepId);
    const noQr = !step?.code;
    const ribbon = ribbonFor(step);
    return `<li class="guide-entry card${ribbon ? ` guide-entry-${ribbon.kind}` : ''}" data-index="${index}">
      ${ribbon ? `<div class="guide-entry-ribbon" title="${escapeHtml(ribbon.title)}">${escapeHtml(ribbon.text)}</div>` : ''}
      <div class="guide-entry-header">
        <span class="guide-entry-index">${rank}</span>
        ${imgTag(stepImageSrc(step), 'guide-entry-thumb')}
        <div class="guide-entry-title">
          <strong class="guide-entry-name">${step ? escapeHtml(step.name || '(sans nom)') : '(étape introuvable — supprimée du scénario ?)'}</strong>
          <span class="guide-entry-code muted">${step?.code ? `Code QR : ${escapeHtml(step.code)}` : ''}</span>
        </div>
        ${entryActionsHtml(index, noQr)}
      </div>
      <p class="guide-entry-description muted">${escapeHtml(plainDescription(step))}</p>
      <div class="guide-entry-links">${renderAutoLink(step, 'needBefore', 'Requiert avant')}${renderAutoLink(step, 'toAssociate', 'Objet à associer')}</div>
      ${renderLockSolution(step)}
      ${noteLocationHtml(entry)}
    </li>`;
  }).join('');
}

guideList.addEventListener('input', (event) => {
  if (isViewMode) return;
  const li = event.target.closest('.guide-entry');
  if (!li) return;
  const index = Number(li.dataset.index);
  if (event.target.classList.contains('guide-entry-note')) guide.entries[index].note = event.target.value;
  if (event.target.classList.contains('guide-entry-location')) guide.entries[index].location = event.target.value;
});

guideList.addEventListener('click', async (event) => {
  const li = event.target.closest('.guide-entry');
  if (!li) return;
  const index = Number(li.dataset.index);

  if (event.target.classList.contains('guide-show-qr')) {
    const step = findStep(guide.entries[index].stepId);
    if (!step?.code) return;
    document.getElementById('qrDialogStepName').textContent = step.name || '';
    document.getElementById('qrDialogCode').textContent = step.code;
    document.getElementById('qrDialogImage').src = `${API}/scenario-editor/qrcode?text=${encodeURIComponent(step.code)}`;
    document.getElementById('qrDialog').showModal();
    return;
  }

  if (isViewMode) return;

  if (event.target.classList.contains('guide-move-up')) {
    const other = adjacentVisibleIndex(index, -1);
    if (other === -1) return;
    [guide.entries[other], guide.entries[index]] = [guide.entries[index], guide.entries[other]];
    renderGuideList();
    return;
  }
  if (event.target.classList.contains('guide-move-down')) {
    const other = adjacentVisibleIndex(index, 1);
    if (other === -1) return;
    [guide.entries[other], guide.entries[index]] = [guide.entries[index], guide.entries[other]];
    renderGuideList();
    return;
  }
  if (event.target.classList.contains('guide-remove')) {
    const step = findStep(guide.entries[index].stepId);
    const ok = await confirmAction(`Retirer "${step?.name || 'cette étape'}" du guide ?`, { confirmLabel: 'Retirer' });
    if (!ok) return;
    guide.entries.splice(index, 1);
    renderAddSelect();
    renderGuideList();
  }
});

if (!isViewMode) {
  document.getElementById('addStepToGuideButton').addEventListener('click', () => {
    const stepId = Number(addStepSelect.value);
    if (!addStepSelect.value) return;
    guide.entries.push({ stepId, note: '', location: '' });
    renderAddSelect();
    renderGuideList();
    if (!isEntryVisible(guide.entries[guide.entries.length - 1])) {
      saveStatus.textContent = 'Étape ajoutée (masquée par le filtre actuel).';
      setTimeout(() => { saveStatus.textContent = ''; }, 4000);
    }
  });

  document.getElementById('saveGuideButton').addEventListener('click', async () => {
    saveStatus.textContent = 'Enregistrement...';
    try {
      await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(scenarioCode)}/guide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: guide.entries })
      });
      saveStatus.textContent = 'Guide enregistré.';
    } catch (err) {
      saveStatus.textContent = `Erreur : ${err.message}`;
    }
    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
  });
}

renderAddSelect();
renderGuideList();
