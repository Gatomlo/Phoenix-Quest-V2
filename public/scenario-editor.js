// Voir le même principe dans admin.js : import.meta.url reste fiable même
// monté sous un sous-chemin par la passerelle node-gateway.
const APP_BASE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const API = APP_BASE + '/api/admin';

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, { credentials: 'include', ...options });
  if (res.status === 401) {
    window.location.href = `${APP_BASE}/admin/`;
    throw new Error('Non authentifié');
  }
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : null;
  if (!res.ok) throw new Error(data?.error || 'Erreur serveur');
  return data;
}

// --- Boîte de dialogue de confirmation (même convention que le tableau de bord) --
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

// --- Vérifie la session admin avant d'afficher quoi que ce soit -----------
try {
  await apiFetch('/me');
} catch {
  // apiFetch redirige déjà vers / sur 401.
}

// Servies directement par ce backend admin (pas par l'app joueur) pour ne pas
// dépendre d'un serveur statique séparé, pas toujours lancé pendant qu'on
// utilise l'admin.
function scenarioImageUrl(code, filename) {
  return `${API}/scenario-editor/scenarios/${encodeURIComponent(code)}/images/${encodeURIComponent(filename)}`;
}

// --- Vue liste des scénarios ----------------------------------------------
const scenarioListView = document.getElementById('scenarioListView');
const scenarioEditView = document.getElementById('scenarioEditView');
const scenarioList = document.getElementById('scenarioList');

async function loadScenarioList() {
  const { scenarios } = await apiFetch('/scenario-editor/scenarios');
  scenarioList.innerHTML = '';
  if (!scenarios.length) {
    scenarioList.innerHTML = '<p class="muted">Aucun scénario pour le moment.</p>';
    return;
  }
  scenarios.forEach((s) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span><strong>${s.code}</strong> — ${s.name}</span>
      <span class="session-row-meta">
        <button type="button" class="btn btn-secondary btn-sm scenario-export-btn">Télécharger</button>
        <button type="button" class="btn btn-danger btn-sm scenario-delete-btn">Supprimer</button>
      </span>
    `;
    li.addEventListener('click', () => openScenarioEditor(s.code));
    li.querySelector('.scenario-export-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = `${API}/scenario-editor/scenarios/${encodeURIComponent(s.code)}/export`;
    });
    li.querySelector('.scenario-delete-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmAction(
        `Supprimer définitivement le scénario ${s.code} (${s.name}) ?\n\nLe fichier scenario.json et toutes ses images seront perdus. Cette action est irréversible.`,
        { confirmLabel: 'Supprimer' }
      );
      if (!ok) return;
      await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(s.code)}`, { method: 'DELETE' });
      await loadScenarioList();
    });
    scenarioList.appendChild(li);
  });
}

document.getElementById('createScenarioForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('createScenarioError');
  errorEl.hidden = true;
  const code = document.getElementById('newScenarioCode').value.trim();
  const name = document.getElementById('newScenarioName').value.trim();
  const skeleton = {
    nameStory: name,
    storyIntroduction: '',
    map: false,
    mapMedia: '',
    locationList: true,
    locationListTitle: 'Lieux',
    itemList: true,
    itemListTitle: 'Inventaire',
    qrCodeReader: true,
    rules: '',
    hints: true,
    hintsCount: true,
    timer: false,
    timerType: '',
    timerParam: 0,
    lastStepId: null,
    chat: true,
    progressBar: false,
    steps: []
  };
  try {
    await apiFetch('/scenario-editor/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, scenario: skeleton })
    });
    document.getElementById('createScenarioForm').reset();
    await loadScenarioList();
    openScenarioEditor(code);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById('importScenarioForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById('importScenarioError');
  errorEl.hidden = true;
  const code = document.getElementById('importScenarioCode').value.trim();
  const file = document.getElementById('importScenarioFile').files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('code', code);
  formData.append('package', file);
  try {
    await apiFetch('/scenario-editor/import', { method: 'POST', body: formData });
    document.getElementById('importScenarioForm').reset();
    await loadScenarioList();
    openScenarioEditor(code);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

// --- Vue édition d'un scénario ---------------------------------------------
// Champs couverts par le formulaire structuré : tout le reste du JSON passe
// par le textarea "JSON brut" pour ne pas avoir à modéliser chaque variante
// exotique (thème, couleurs...) apparue au fil des scénarios existants.
const TOP_LEVEL_FORM_KEYS = [
  'nameStory', 'storyIntroduction', 'map', 'mapMedia', 'timer', 'timerType',
  'timerParam', 'lastStepId', 'chat', 'hints', 'progressBar', 'sendMail', 'SendMail',
  'qrCodeReader', 'hintsCount', 'hintsLimit'
];

let currentScenarioCode = null;
let currentScenario = null;
let currentImages = [];
let editingStepIndex = null; // null = pas d'étape sélectionnée, -1 = nouvelle étape

async function openScenarioEditor(code) {
  const { scenario, images } = await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(code)}`);
  currentScenarioCode = code;
  currentScenario = scenario;
  currentScenario.steps = currentScenario.steps || [];
  currentImages = images;
  editingStepIndex = null;

  scenarioListView.hidden = true;
  scenarioEditView.hidden = false;
  document.getElementById('scenarioEditTitle').textContent = `${scenario.nameStory || code} — ${code}`;
  document.getElementById('scenarioSaveStatus').textContent = '';
  document.getElementById('solutionGuideEditLink').href = `${APP_BASE}/admin/solution-guide.html?scenario=${encodeURIComponent(code)}`;

  renderTopLevelFields();
  renderStepList();
  hideStepForm();
}

document.getElementById('backToScenarioListButton').addEventListener('click', () => {
  scenarioEditView.hidden = true;
  scenarioListView.hidden = false;
  currentScenarioCode = null;
  currentScenario = null;
});

function renderTopLevelFields() {
  const s = currentScenario;
  document.getElementById('fieldNameStory').value = s.nameStory || '';
  document.getElementById('fieldStoryIntroduction').value = s.storyIntroduction || '';
  document.getElementById('fieldMap').checked = !!s.map;
  document.getElementById('fieldMapMedia').value = s.mapMedia || '';
  renderFieldImagePreview('fieldMapImagePreview', s.mapMedia);
  document.getElementById('fieldTimer').checked = !!s.timer;
  document.getElementById('fieldTimerType').value = s.timerType || '';
  document.getElementById('fieldTimerParam').value = s.timerParam ?? '';
  renderLastStepSelect();
  document.getElementById('fieldChat').checked = s.chat !== false;
  document.getElementById('fieldHints').checked = !!s.hints;
  document.getElementById('fieldHintsCount').checked = !!s.hintsCount;
  document.getElementById('fieldHintsLimit').value = s.hintsLimit ?? '';
  document.getElementById('fieldProgressBar').checked = !!s.progressBar;
  document.getElementById('fieldSendMail').checked = !!(s.sendMail ?? s.SendMail);
  document.getElementById('fieldQrCodeReader').checked = s.qrCodeReader !== false;

  const extra = {};
  Object.keys(s).forEach((key) => {
    if (key === 'steps' || TOP_LEVEL_FORM_KEYS.includes(key)) return;
    extra[key] = s[key];
  });
  document.getElementById('fieldRawExtra').value = JSON.stringify(extra, null, 2);
}

// Liste déroulante "Dernière étape" : évite de devoir connaître l'id par
// cœur pour désigner l'étape qui termine le scénario.
function renderLastStepSelect() {
  const select = document.getElementById('fieldLastStepId');
  const sorted = [...currentScenario.steps].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));
  select.innerHTML = '<option value="">Aucune</option>' +
    sorted.map((s) => `<option value="${s.id}">${s.name || '(sans nom)'} #${s.id}</option>`).join('');
  select.value = currentScenario.lastStepId ?? '';
}

document.getElementById('addLastStepButton').addEventListener('click', () => {
  pendingLink = { forStepId: 'TOP_LEVEL', field: 'lastStepId' };
  startNewStep();
});

// Reconstruit currentScenario à partir des champs structurés + du JSON brut,
// juste avant l'enregistrement.
function collectTopLevelFields() {
  let extra = {};
  const rawText = document.getElementById('fieldRawExtra').value.trim();
  if (rawText) {
    try {
      extra = JSON.parse(rawText);
    } catch {
      throw new Error('Le JSON brut des "autres champs" est invalide.');
    }
  }
  const timerParamRaw = document.getElementById('fieldTimerParam').value;
  const timerParam = timerParamRaw === '' ? 0 : (Number.isNaN(Number(timerParamRaw)) ? timerParamRaw : Number(timerParamRaw));

  currentScenario = {
    ...extra,
    nameStory: document.getElementById('fieldNameStory').value,
    storyIntroduction: document.getElementById('fieldStoryIntroduction').value,
    map: document.getElementById('fieldMap').checked,
    mapMedia: document.getElementById('fieldMapMedia').value,
    timer: document.getElementById('fieldTimer').checked,
    timerType: document.getElementById('fieldTimerType').value,
    timerParam,
    lastStepId: document.getElementById('fieldLastStepId').value === '' ? null : Number(document.getElementById('fieldLastStepId').value),
    chat: document.getElementById('fieldChat').checked,
    hints: document.getElementById('fieldHints').checked,
    hintsCount: document.getElementById('fieldHintsCount').checked,
    hintsLimit: document.getElementById('fieldHintsLimit').value === '' ? null : Number(document.getElementById('fieldHintsLimit').value),
    progressBar: document.getElementById('fieldProgressBar').checked,
    sendMail: document.getElementById('fieldSendMail').checked,
    qrCodeReader: document.getElementById('fieldQrCodeReader').checked,
    steps: currentScenario.steps
  };
}

// --- Liste des étapes -------------------------------------------------------
const stepList = document.getElementById('stepList');
const stepSearchInput = document.getElementById('stepSearchInput');

function renderStepList() {
  document.getElementById('stepCount').textContent = currentScenario.steps.length;
  const filter = stepSearchInput.value.trim().toLowerCase();
  stepList.innerHTML = '';
  currentScenario.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => !filter
      || String(step.id).includes(filter)
      || (step.name || '').toLowerCase().includes(filter)
      || (step.code || '').toLowerCase().includes(filter))
    .forEach(({ step, index }) => {
      const li = document.createElement('li');
      li.className = 'step-list-item';
      if (index === editingStepIndex) li.classList.add('active');
      const lockIcon = step.lockType ? '🔒 ' : '';
      li.innerHTML = `<span>${lockIcon}${step.name || '(sans nom)'} <span class="muted">#${step.id}</span></span>`;
      li.addEventListener('click', () => selectStep(index));
      stepList.appendChild(li);
    });
}

stepSearchInput.addEventListener('input', renderStepList);

// --- Formulaire d'étape ------------------------------------------------------
const stepForm = document.getElementById('stepForm');
const stepFormEmpty = document.getElementById('stepFormEmpty');

function hideStepForm() {
  editingStepIndex = null;
  stepForm.hidden = true;
  stepFormEmpty.hidden = false;
  renderStepList();
}

function nextFreeStepId() {
  const ids = currentScenario.steps.map((s) => Number(s.id) || 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

// Étape en attente de liaison : quand on clique "+ Nouvelle" à côté de
// needBefore/toAssociate/replaceBy, on retient ici quelle étape et quel
// champ, pour revenir les remplir automatiquement une fois la nouvelle
// étape créée et validée.
let pendingLink = null;

// Remplit les listes déroulantes needBefore / toAssociate / replaceBy avec
// les étapes existantes (triées par nom), pour choisir une référence sans
// avoir à connaître les ids/codes par cœur. `excludeId` retire l'étape en
// cours d'édition de ses propres listes (une étape ne se référence pas
// elle-même).
function renderReferenceSelects(excludeId) {
  const sorted = [...currentScenario.steps]
    .filter((s) => s.id !== excludeId)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }));

  const byIdOptions = sorted.map((s) => `<option value="${s.id}">${s.name || '(sans nom)'} #${s.id}</option>`).join('');

  document.getElementById('stepNeedBefore').innerHTML = '<option value="">Aucune</option>' + byIdOptions;
  document.getElementById('stepToAdd').innerHTML = byIdOptions;
  document.getElementById('stepToRemove').innerHTML = byIdOptions;

  const toAssociate = document.getElementById('stepToAssociate');
  const objects = sorted.filter((s) => s.type === 'object');
  toAssociate.innerHTML = '<option value="">Aucun</option>' +
    objects.map((s) => `<option value="${s.id}">${s.name || '(sans nom)'} #${s.id}</option>`).join('');

  const replaceBy = document.getElementById('stepReplaceBy');
  replaceBy.innerHTML = sorted.map((s) => `<option value="${s.code || ''}">${s.name || '(sans nom)'} #${s.id}${s.code ? ` (${s.code})` : ''}</option>`).join('');
}

// Miniature + début de la description de la (ou des) étape(s) sélectionnée
// dans un champ de référence, pour voir de quoi il s'agit sans avoir à
// l'ouvrir séparément. `byCode` sert pour replaceBy, dont les valeurs sont
// des codes d'étape plutôt que des ids.
function renderReferencePreview(selectId, previewId, { byCode = false } = {}) {
  const select = document.getElementById(selectId);
  const preview = document.getElementById(previewId);
  const selected = Array.from(select.selectedOptions).filter((o) => o.value !== '');
  if (!selected.length) {
    preview.innerHTML = '';
    return;
  }
  preview.innerHTML = selected.map((opt) => {
    const step = byCode
      ? currentScenario.steps.find((s) => s.code === opt.value)
      : currentScenario.steps.find((s) => String(s.id) === opt.value);
    if (!step) return '';
    const imgSrc = step.media ? scenarioImageUrl(currentScenarioCode, step.media) : '';
    const description = (step.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    return `<div class="reference-preview-item">
      ${imgSrc ? `<img src="${imgSrc}" alt="" onerror="this.remove()">` : ''}
      <div><strong>${step.name || '(sans nom)'}</strong>${description ? `<p>${description}${description.length >= 90 ? '…' : ''}</p>` : ''}</div>
    </div>`;
  }).join('');
}

function renderAllReferencePreviews() {
  renderReferencePreview('stepToAdd', 'stepToAddPreview');
  renderReferencePreview('stepToRemove', 'stepToRemovePreview');
  renderReferencePreview('stepNeedBefore', 'stepNeedBeforePreview');
  renderReferencePreview('stepToAssociate', 'stepToAssociatePreview');
}

['stepToAdd', 'stepToRemove', 'stepNeedBefore', 'stepToAssociate'].forEach((id) => {
  document.getElementById(id).addEventListener('change', renderAllReferencePreviews);
});

function renderFieldImagePreview(previewId, mediaName) {
  const preview = document.getElementById(previewId);
  if (!mediaName) {
    preview.innerHTML = '';
    return;
  }
  const src = scenarioImageUrl(currentScenarioCode, mediaName);
  preview.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = mediaName;
  img.addEventListener('error', () => {
    preview.textContent = `${mediaName} (aperçu indisponible)`;
  }, { once: true });
  preview.appendChild(img);
}

function renderStepImagePreview(mediaName) {
  renderFieldImagePreview('stepImagePreview', mediaName);
}

// withObject se résout en associant un objet (champ toAssociate) : le champ
// lockCode ne sert à rien pour ce type-là, on l'efface pour ne pas induire
// en erreur et on affiche un message pointant vers toAssociate à la place.
// ---------------------------------------------------------------------------
// Éditeurs visuels de cadenas : un widget par lockType, qui construit et
// écrit le lockCode au format exact attendu par scripts/locks/*.js côté
// jeu (vérifié directement dans ce code), pour ne jamais avoir à écrire le
// JSON à la main. Le textarea JSON brut reste la source de vérité lue à
// l'enregistrement — chaque widget se contente d'y écrire sa valeur.
function setLockCode(value) {
  document.getElementById('stepLockCode').value = JSON.stringify(value);
}
function getLockCode(fallback) {
  try {
    const parsed = JSON.parse(document.getElementById('stepLockCode').value || 'null');
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

// color/digit/directionnal partagent la même idée : une séquence construite
// en cliquant des boutons, comparée telle quelle côté jeu (.join() des deux
// tableaux). "options" liste les boutons disponibles.
function renderSequenceWidget(container, options, initial, { cols = 3, chipLabel } = {}) {
  let sequence = Array.isArray(initial) ? [...initial] : [];
  setLockCode(sequence);

  const display = document.createElement('div');
  display.className = 'lock-sequence-display';
  const grid = document.createElement('div');
  grid.className = `lock-grid cols-${cols}`;
  const actions = document.createElement('div');
  actions.className = 'lock-widget-actions';
  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'btn btn-secondary btn-sm';
  undoBtn.textContent = '← Effacer le dernier';
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-secondary btn-sm';
  clearBtn.textContent = 'Tout effacer';
  actions.append(undoBtn, clearBtn);

  function renderDisplay() {
    display.innerHTML = '';
    if (!sequence.length) {
      display.innerHTML = '<span class="lock-sequence-empty">Cliquez les boutons ci-dessous pour composer le code…</span>';
    } else {
      sequence.forEach((value) => {
        const chip = document.createElement('span');
        chip.className = 'lock-sequence-chip';
        const opt = options.find((o) => o.value === value);
        chip.style.background = opt?.swatch || '';
        chip.textContent = chipLabel ? chipLabel(value, opt) : (opt?.label ?? value);
        display.appendChild(chip);
      });
    }
    setLockCode(sequence);
  }

  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lock-grid-btn' + (opt.swatch ? ' lock-color-swatch' : '');
    if (opt.swatch) btn.style.background = opt.swatch;
    btn.textContent = opt.swatch ? '' : opt.label;
    btn.title = opt.label;
    btn.addEventListener('click', () => {
      sequence.push(opt.value);
      renderDisplay();
    });
    grid.appendChild(btn);
  });

  undoBtn.addEventListener('click', () => { sequence.pop(); renderDisplay(); });
  clearBtn.addEventListener('click', () => { sequence = []; renderDisplay(); });

  renderDisplay();
  container.append(display, grid, actions);
}

function renderColorLockWidget(container, initial) {
  const palette = [
    ['Rose', 'F06292'], ['Bleu', '0b30d9'], ['Vert', '0c9411'],
    ['Jaune', 'fafa1e'], ['Orange', 'ff8d0d'], ['Rouge', 'ff0000'],
    ['Violet', '7B1FA2'], ['Marron', '582900'], ['Gris', '878787'], ['Noir', '000000']
  ];
  const options = palette.map(([label, hex]) => ({ value: hex, label, swatch: `#${hex}` }));
  renderSequenceWidget(container, options, initial, { cols: 3 });
}

function renderDigitLockWidget(container, initial) {
  const options = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => ({ value: d, label: d }));
  renderSequenceWidget(container, options, initial, { cols: 3 });
}

function renderDirectionalLockWidget(container, initial) {
  const arrows = { no: '↖', n: '↑', ne: '↗', o: '←', e: '→', so: '↙', s: '↓', se: '↘' };
  const grid = [['no', 'n', 'ne'], ['o', null, 'e'], ['so', 's', 'se']];
  const options = grid.flat().filter(Boolean).map((dir) => ({ value: dir, label: arrows[dir] }));
  // Ordonne les boutons dans la grille comme dans le jeu (avec le trou au centre) :
  // on construit donc la grille nous-même plutôt que via renderSequenceWidget.
  let sequence = Array.isArray(initial) ? [...initial] : [];
  setLockCode(sequence);
  const display = document.createElement('div');
  display.className = 'lock-sequence-display';
  const gridEl = document.createElement('div');
  gridEl.className = 'lock-grid cols-3';
  function renderDisplay() {
    display.innerHTML = sequence.length
      ? sequence.map((v) => `<span class="lock-sequence-chip">${arrows[v] || v}</span>`).join('')
      : '<span class="lock-sequence-empty">Cliquez les flèches pour composer le code…</span>';
    setLockCode(sequence);
  }
  grid.flat().forEach((dir) => {
    if (!dir) { gridEl.appendChild(document.createElement('div')); return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lock-grid-btn';
    btn.textContent = arrows[dir];
    btn.title = dir;
    btn.addEventListener('click', () => { sequence.push(dir); renderDisplay(); });
    gridEl.appendChild(btn);
  });
  const actions = document.createElement('div');
  actions.className = 'lock-widget-actions';
  actions.innerHTML = '<button type="button" class="btn btn-secondary btn-sm" data-act="undo">← Effacer le dernier</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="clear">Tout effacer</button>';
  actions.querySelector('[data-act="undo"]').addEventListener('click', () => { sequence.pop(); renderDisplay(); });
  actions.querySelector('[data-act="clear"]').addEventListener('click', () => { sequence = []; renderDisplay(); });
  renderDisplay();
  container.append(display, gridEl, actions);
  void options; // options non utilisé directement (grille construite à la main ci-dessus)
}

function renderFuseLockWidget(container, initial) {
  const state = Array.isArray(initial) && initial.length === 16 ? [...initial] : new Array(16).fill(false);
  setLockCode(state);
  const help = document.createElement('p');
  help.className = 'field-help';
  help.textContent = 'Cliquez les interrupteurs à activer (grille 4×4, comme les boutons du cadenas côté joueur).';
  const gridEl = document.createElement('div');
  gridEl.className = 'lock-grid cols-4';
  state.forEach((on, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lock-grid-btn lock-fuse-btn' + (on ? ' on' : '');
    btn.textContent = on ? '●' : '○';
    btn.addEventListener('click', () => {
      state[index] = !state[index];
      btn.classList.toggle('on', state[index]);
      btn.textContent = state[index] ? '●' : '○';
      setLockCode(state);
    });
    gridEl.appendChild(btn);
  });
  container.append(help, gridEl);
}

function renderDiagramLockWidget(container, initial) {
  const positions = [[20, 20], [50, 20], [80, 20], [20, 50], [50, 50], [80, 50], [20, 80], [50, 80], [80, 80]];
  let sequence = typeof initial === 'number' ? String(initial).split('').map(Number) : [];
  setLockCode(sequence.length ? Number(sequence.join('')) : null);

  const help = document.createElement('p');
  help.className = 'field-help';
  help.textContent = 'Cliquez les points dans l\'ordre pour composer le schéma (comme le cadenas "diagram" côté joueur).';
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'lock-diagram-svg');
  const linesGroup = document.createElementNS(svgNS, 'g');
  const dotsGroup = document.createElementNS(svgNS, 'g');
  svg.append(linesGroup, dotsGroup);

  function render() {
    linesGroup.innerHTML = '';
    for (let i = 1; i < sequence.length; i++) {
      const [x1, y1] = positions[sequence[i - 1] - 1];
      const [x2, y2] = positions[sequence[i] - 1];
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      linesGroup.appendChild(line);
    }
    dotsGroup.querySelectorAll('circle').forEach((c, i) => {
      c.classList.toggle('active', sequence.includes(i + 1));
    });
    setLockCode(sequence.length ? Number(sequence.join('')) : null);
  }

  positions.forEach(([x, y], i) => {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', '5');
    circle.setAttribute('class', 'dot');
    circle.addEventListener('click', () => {
      const point = i + 1;
      if (sequence.includes(point)) return;
      sequence.push(point);
      render();
    });
    dotsGroup.appendChild(circle);
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', x); label.setAttribute('y', y - 7);
    label.setAttribute('text-anchor', 'middle');
    label.textContent = String(i + 1);
    dotsGroup.appendChild(label);
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-secondary btn-sm';
  clearBtn.textContent = 'Recommencer';
  clearBtn.addEventListener('click', () => { sequence = []; render(); });

  render();
  container.append(help, svg, document.createElement('br'), clearBtn);
}

function renderDateLockWidget(container, initial) {
  const help = document.createElement('p');
  help.className = 'field-help';
  help.textContent = 'Date au format jj/mm/aaaa attendue par le cadenas côté joueur — convertie automatiquement.';
  const input = document.createElement('input');
  input.type = 'date';
  if (typeof initial === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(initial)) {
    const [d, m, y] = initial.split('/');
    input.value = `${y}-${m}-${d}`;
  }
  setLockCode(input.value ? frenchDateFromInput(input.value) : '');
  input.addEventListener('change', () => setLockCode(frenchDateFromInput(input.value)));
  container.append(help, input);
}
function frenchDateFromInput(isoValue) {
  if (!isoValue) return '';
  const [y, m, d] = isoValue.split('-');
  return `${d}/${m}/${y}`;
}

function renderPasswordLockWidget(container, initial) {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Mot de passe attendu';
  input.value = typeof initial === 'string' ? initial : '';
  setLockCode(input.value);
  input.addEventListener('input', () => setLockCode(input.value));
  container.appendChild(input);
}

function renderLoginLockWidget(container, initial) {
  const [initLogin, initPassword] = Array.isArray(initial) ? initial : ['', ''];
  const loginInput = document.createElement('input');
  loginInput.type = 'text';
  loginInput.placeholder = 'Identifiant attendu';
  loginInput.value = initLogin || '';
  loginInput.style.marginBottom = '.4rem';
  const passwordInput = document.createElement('input');
  passwordInput.type = 'text';
  passwordInput.placeholder = 'Mot de passe attendu';
  passwordInput.value = initPassword || '';
  const update = () => setLockCode([loginInput.value, passwordInput.value]);
  update();
  loginInput.addEventListener('input', update);
  passwordInput.addEventListener('input', update);
  container.append(loginInput, document.createElement('br'), passwordInput);
}

function renderSlidersLockWidget(container, initial) {
  let rows = Array.isArray(initial) ? initial.map(([label, value]) => ({ label, value })) : [];
  const rowsEl = document.createElement('div');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-secondary btn-sm';
  addBtn.textContent = '+ Ajouter un curseur';

  function serialize() {
    setLockCode(rows.map((r) => [r.label, r.value]));
  }
  function renderRows() {
    rowsEl.innerHTML = '';
    rows.forEach((row, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'lock-sliders-row';
      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.placeholder = 'Étiquette (ex: mhz)';
      labelInput.value = row.label || '';
      labelInput.addEventListener('input', () => { row.label = labelInput.value; serialize(); });
      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0'; range.max = '200';
      range.value = String(row.value ?? 0);
      const valueSpan = document.createElement('span');
      valueSpan.className = 'lock-sliders-value';
      valueSpan.textContent = range.value;
      range.addEventListener('input', () => { row.value = Number(range.value); valueSpan.textContent = range.value; serialize(); });
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-danger btn-sm';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => { rows.splice(index, 1); renderRows(); serialize(); });
      rowEl.append(labelInput, range, valueSpan, removeBtn);
      rowsEl.appendChild(rowEl);
    });
    serialize();
  }
  addBtn.addEventListener('click', () => { rows.push({ label: '', value: 0 }); renderRows(); });
  renderRows();
  container.append(rowsEl, addBtn);
}

function renderSelectorLockWidget(container, initial) {
  const stepId = editingStepIndex === -1 ? null : currentScenario.steps[editingStepIndex]?.id;
  const step = stepId !== null ? currentScenario.steps.find((s) => s.id === stepId) : null;
  if (!step?.media) {
    container.innerHTML = '<p class="field-help">Ajoutez d\'abord une image à cette étape pour placer les zones cliquables dessus.</p>';
    return;
  }
  let hotspots = Array.isArray(initial) ? initial.map(([style, targetId, color, size]) => ({ style, targetId, color: color || '#ff934f', size: size || 32 })) : [];

  const help = document.createElement('p');
  help.className = 'field-help';
  help.textContent = 'Cliquez sur l\'image pour placer une zone, puis choisissez l\'étape déclenchée par un clic dessus.';
  const wrap = document.createElement('div');
  wrap.className = 'lock-selector-image-wrap';
  const img = document.createElement('img');
  img.src = scenarioImageUrl(currentScenarioCode, step.media);
  wrap.appendChild(img);
  const rowsEl = document.createElement('div');

  const stepOptions = () => [...currentScenario.steps]
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }))
    .map((s) => `<option value="${s.id}">${s.name || '(sans nom)'} #${s.id}</option>`).join('');

  function serialize() {
    setLockCode(hotspots.map((h) => [h.style, h.targetId, h.color, h.size]));
  }
  function renderHotspots() {
    wrap.querySelectorAll('.lock-selector-hotspot').forEach((el) => el.remove());
    hotspots.forEach((h, index) => {
      const topMatch = h.style.match(/top:\s*(\d+)px/);
      const leftMatch = h.style.match(/left:\s*(\d+)px/);
      if (!topMatch || !leftMatch || !img.naturalWidth) return;
      const marker = document.createElement('div');
      marker.className = 'lock-selector-hotspot';
      marker.style.background = h.color;
      marker.style.left = `${(Number(leftMatch[1]) / img.naturalWidth) * 100}%`;
      marker.style.top = `${(Number(topMatch[1]) / img.naturalHeight) * 100}%`;
      marker.textContent = String(index + 1);
      wrap.appendChild(marker);
    });
  }
  function renderRows() {
    rowsEl.innerHTML = '';
    hotspots.forEach((h, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'lock-selector-row';
      rowEl.innerHTML = `<strong>#${index + 1}</strong>
        <select>${stepOptions()}</select>
        <input type="color" value="${h.color}">
        <button type="button" class="btn btn-danger btn-sm">✕</button>`;
      rowEl.querySelector('select').value = String(h.targetId ?? '');
      rowEl.querySelector('select').addEventListener('change', (e) => { h.targetId = Number(e.target.value); serialize(); });
      rowEl.querySelector('input[type="color"]').addEventListener('input', (e) => { h.color = e.target.value; serialize(); renderHotspots(); });
      rowEl.querySelector('button').addEventListener('click', () => { hotspots.splice(index, 1); renderRows(); renderHotspots(); serialize(); });
      rowsEl.appendChild(rowEl);
    });
    serialize();
  }

  img.addEventListener('click', (event) => {
    const rect = img.getBoundingClientRect();
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    const leftPx = Math.round(xRatio * img.naturalWidth);
    const topPx = Math.round(yRatio * img.naturalHeight);
    hotspots.push({ style: `top:${topPx}px; left:${leftPx}px`, targetId: currentScenario.steps[0]?.id ?? null, color: '#ff934f', size: 32 });
    renderRows();
    renderHotspots();
  });

  if (img.complete) renderHotspots();
  else img.addEventListener('load', renderHotspots, { once: true });
  renderRows();
  container.append(help, wrap, rowsEl);
}

const LOCK_WIDGET_BUILDERS = {
  color: renderColorLockWidget,
  digit: renderDigitLockWidget,
  directionnal: renderDirectionalLockWidget,
  fuse: renderFuseLockWidget,
  date: renderDateLockWidget,
  password: renderPasswordLockWidget,
  login: renderLoginLockWidget,
  diagram: renderDiagramLockWidget,
  sliders: renderSlidersLockWidget,
  selector: renderSelectorLockWidget
};

function renderLockEditor() {
  const lockType = document.getElementById('stepLockType').value;
  const isWithObject = lockType === 'withObject';
  document.getElementById('lockWithObjectHint').hidden = !isWithObject;
  document.getElementById('stepLockCodeLabel').hidden = isWithObject;

  const container = document.getElementById('lockEditorContainer');
  container.innerHTML = '';
  container.hidden = isWithObject || !lockType;
  if (isWithObject || !lockType) return;

  const builder = LOCK_WIDGET_BUILDERS[lockType];
  if (!builder) {
    container.innerHTML = '<p class="field-help">Pas d\'éditeur visuel pour ce type de cadenas — utilisez le JSON brut ci-dessous.</p>';
    return;
  }
  builder(container, getLockCode(null));
}

// Un changement de type (au lieu d'un chargement d'étape) repart d'un
// lockCode vierge : l'ancienne valeur n'aurait de toute façon aucun sens
// pour un type de cadenas différent.
document.getElementById('stepLockType').addEventListener('change', () => {
  document.getElementById('stepLockCode').value = '';
  renderLockEditor();
});

function selectStep(index) {
  editingStepIndex = index;
  const step = currentScenario.steps[index];
  stepFormEmpty.hidden = true;
  stepForm.hidden = false;

  document.getElementById('stepId').value = step.id;
  document.getElementById('stepName').value = step.name || '';
  document.getElementById('stepType').value = step.type || 'location';
  document.getElementById('stepCode').value = step.code || '';
  document.getElementById('stepMedia').value = step.media || '';
  document.getElementById('stepDefault').checked = !!step.default;
  document.getElementById('stepClosed').checked = !!step.closed;
  document.getElementById('stepProgressBar').checked = !!step.progressBar;
  document.getElementById('stepDefinitiveReplace').checked = !!step.definitiveReplace;
  document.getElementById('stepDescription').value = step.description || '';
  document.getElementById('stepHint').value = step.hint || '';

  renderReferenceSelects(step.id);
  const selectMulti = (id, values) => {
    const stringValues = (values || []).map(String);
    Array.from(document.getElementById(id).options).forEach((opt) => {
      opt.selected = stringValues.includes(opt.value);
    });
  };
  selectMulti('stepToAdd', step.toAdd);
  selectMulti('stepToRemove', step.toRemove);
  document.getElementById('stepNeedBefore').value = step.needBefore ?? '';
  document.getElementById('stepToAssociate').value = step.toAssociate ?? '';
  const replaceByValues = Array.isArray(step.replaceBy) ? step.replaceBy : (step.replaceBy ? [step.replaceBy] : []);
  Array.from(document.getElementById('stepReplaceBy').options).forEach((opt) => {
    opt.selected = replaceByValues.includes(opt.value);
  });
  document.getElementById('stepLockType').value = step.lockType || '';
  document.getElementById('stepLockCode').value = step.lockCode !== undefined ? JSON.stringify(step.lockCode) : '';
  renderLockEditor();
  renderAllReferencePreviews();
  document.getElementById('stepImageUpload').value = '';
  renderStepImagePreview(step.media);

  renderStepList();
}

function startNewStep() {
  editingStepIndex = -1;
  stepFormEmpty.hidden = true;
  stepForm.hidden = false;
  stepForm.reset();
  document.getElementById('stepId').value = nextFreeStepId();
  document.getElementById('stepType').value = 'location';
  document.getElementById('stepMedia').value = '';
  renderReferenceSelects(null);
  renderStepImagePreview(null);
  document.getElementById('stepLockType').value = '';
  document.getElementById('stepLockCode').value = '';
  renderLockEditor();
  renderAllReferencePreviews();
  renderStepList();
}

document.getElementById('addStepButton').addEventListener('click', startNewStep);

function selectedIds(id) {
  return Array.from(document.getElementById(id).selectedOptions).map((o) => Number(o.value));
}

stepForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const codeValue = document.getElementById('stepCode').value.trim();
  const duplicateCode = codeValue && currentScenario.steps.some((s, i) => s.code === codeValue && i !== editingStepIndex);
  if (duplicateCode) {
    alert(`Le code QR "${codeValue}" est déjà utilisé par une autre étape (il doit être unique dans le scénario).`);
    return;
  }

  const lockTypeValue = document.getElementById('stepLockType').value || null;
  let lockCode;
  const lockCodeRaw = lockTypeValue === 'withObject' ? '' : document.getElementById('stepLockCode').value.trim();
  if (lockCodeRaw) {
    try {
      lockCode = JSON.parse(lockCodeRaw);
    } catch {
      alert('Le code du cadenas (lockCode) doit être du JSON valide, ex: ["a","b"] ou "12/25/2024".');
      return;
    }
  }

  const needBeforeRaw = document.getElementById('stepNeedBefore').value;
  const toAssociateRaw = document.getElementById('stepToAssociate').value;
  const replaceByValues = Array.from(document.getElementById('stepReplaceBy').selectedOptions).map((o) => o.value);

  const idValue = editingStepIndex === -1 ? Number(document.getElementById('stepId').value) : currentScenario.steps[editingStepIndex].id;
  const step = {
    id: idValue,
    type: document.getElementById('stepType').value,
    name: document.getElementById('stepName').value,
    code: codeValue,
    media: document.getElementById('stepMedia').value || null,
    default: document.getElementById('stepDefault').checked,
    closed: document.getElementById('stepClosed').checked,
    progressBar: document.getElementById('stepProgressBar').checked,
    definitiveReplace: document.getElementById('stepDefinitiveReplace').checked,
    description: document.getElementById('stepDescription').value,
    hint: document.getElementById('stepHint').value,
    toAdd: selectedIds('stepToAdd'),
    toRemove: selectedIds('stepToRemove'),
    needBefore: needBeforeRaw === '' ? null : Number(needBeforeRaw),
    toAssociate: toAssociateRaw === '' ? null : Number(toAssociateRaw),
    replaceBy: replaceByValues.length > 1 ? replaceByValues : (replaceByValues[0] || null),
    lockType: lockTypeValue,
    lockCode: lockCode ?? null
  };

  if (editingStepIndex === -1) {
    currentScenario.steps.push(step);
    editingStepIndex = currentScenario.steps.length - 1;
  } else {
    currentScenario.steps[editingStepIndex] = step;
  }

  // Si cette étape vient d'être créée depuis "+ Nouvelle" à côté d'un champ
  // de liaison d'une autre étape, on y retourne et on la lie automatiquement.
  if (pendingLink) {
    const { forStepId, field } = pendingLink;
    pendingLink = null;

    if (forStepId === 'TOP_LEVEL') {
      // Champ général du scénario (ex : dernière étape) : on reste sur la
      // nouvelle étape qu'on vient de créer, il n'y a pas d'étape "d'origine"
      // à laquelle revenir.
      renderLastStepSelect();
      document.getElementById('fieldLastStepId').value = step.id;
      renderStepList();
      return;
    }

    const targetIndex = currentScenario.steps.findIndex((s) => s.id === forStepId);
    if (targetIndex !== -1) {
      const targetStep = currentScenario.steps[targetIndex];
      if (field === 'replaceBy' || field === 'toAdd' || field === 'toRemove') {
        const existing = Array.isArray(targetStep[field]) ? targetStep[field] : (targetStep[field] ? [targetStep[field]] : []);
        const valueToAdd = field === 'replaceBy' ? (step.code || '') : step.id;
        existing.push(valueToAdd);
        targetStep[field] = field === 'replaceBy' && existing.length === 1 ? existing[0] : existing;
      } else {
        targetStep[field] = step.id;
      }
      selectStep(targetIndex);
      return;
    }
  }

  renderStepList();
});

// "+ Nouvelle" à côté de needBefore/toAssociate/replaceBy : garde en mémoire
// l'étape et le champ à lier, puis ouvre un formulaire d'étape vierge.
document.querySelectorAll('.add-linked-step-btn').forEach((button) => {
  button.addEventListener('click', () => {
    if (editingStepIndex === null) return;
    const forStepId = editingStepIndex === -1
      ? null
      : currentScenario.steps[editingStepIndex].id;
    if (forStepId === null) {
      alert('Enregistrez d\'abord cette étape (bouton "Valider cette étape") avant d\'en créer une liée.');
      return;
    }
    pendingLink = { forStepId, field: button.dataset.field };
    startNewStep();
  });
});

document.getElementById('duplicateStepButton').addEventListener('click', () => {
  if (editingStepIndex === null || editingStepIndex === -1) return;
  const clone = { ...currentScenario.steps[editingStepIndex], id: nextFreeStepId(), name: `${currentScenario.steps[editingStepIndex].name || ''} (copie)` };
  currentScenario.steps.push(clone);
  selectStep(currentScenario.steps.length - 1);
});

document.getElementById('deleteStepButton').addEventListener('click', async () => {
  if (editingStepIndex === null) return;
  if (editingStepIndex === -1) { hideStepForm(); return; }
  const step = currentScenario.steps[editingStepIndex];
  const ok = await confirmAction(`Supprimer l'étape "${step.name || step.id}" ?`, { confirmLabel: 'Supprimer' });
  if (!ok) return;
  currentScenario.steps.splice(editingStepIndex, 1);
  hideStepForm();
});

document.getElementById('stepImageUpload').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || !currentScenarioCode) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const { filename } = await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(currentScenarioCode)}/images`, {
      method: 'POST',
      body: formData
    });
    document.getElementById('stepMedia').value = filename;
    if (!currentImages.includes(filename)) currentImages.push(filename);
    renderStepImagePreview(filename);
    // Le widget "selector" a besoin de l'image tout de suite pour y placer
    // des zones cliquables, avant même que l'étape ne soit validée.
    if (editingStepIndex !== -1 && currentScenario.steps[editingStepIndex]) {
      currentScenario.steps[editingStepIndex].media = filename;
    }
    if (document.getElementById('stepLockType').value === 'selector') renderLockEditor();
  } catch (err) {
    alert(`Échec de l'envoi de l'image : ${err.message}`);
  }
});

document.getElementById('fieldMapImageUpload').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file || !currentScenarioCode) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const { filename } = await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(currentScenarioCode)}/images`, {
      method: 'POST',
      body: formData
    });
    document.getElementById('fieldMapMedia').value = filename;
    if (!currentImages.includes(filename)) currentImages.push(filename);
    renderFieldImagePreview('fieldMapImagePreview', filename);
  } catch (err) {
    alert(`Échec de l'envoi de l'image : ${err.message}`);
  }
});

// --- Enregistrement / export / suppression du scénario ----------------------
document.getElementById('saveScenarioButton').addEventListener('click', async () => {
  const statusEl = document.getElementById('scenarioSaveStatus');
  try {
    collectTopLevelFields();
    await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(currentScenarioCode)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: currentScenario })
    });
    statusEl.textContent = 'Enregistré ✓';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  } catch (err) {
    statusEl.textContent = `Erreur : ${err.message}`;
  }
});

document.getElementById('exportScenarioButton').addEventListener('click', () => {
  window.location.href = `${API}/scenario-editor/scenarios/${encodeURIComponent(currentScenarioCode)}/export`;
});

document.getElementById('deleteScenarioButton').addEventListener('click', async () => {
  const ok = await confirmAction(
    `Supprimer définitivement le scénario ${currentScenarioCode} ?\n\nLe fichier scenario.json et toutes ses images seront perdus. Cette action est irréversible.`,
    { confirmLabel: 'Supprimer' }
  );
  if (!ok) return;
  await apiFetch(`/scenario-editor/scenarios/${encodeURIComponent(currentScenarioCode)}`, { method: 'DELETE' });
  scenarioEditView.hidden = true;
  scenarioListView.hidden = false;
  await loadScenarioList();
});

loadScenarioList();
