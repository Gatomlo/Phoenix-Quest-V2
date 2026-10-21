// Comportements propres au nouvel habillage : mode nuit, texte d'étape repliable
// et confirmation de réinitialisation à l'intérieur de la feuille du menu.

const THEME_KEY = 'phoenixGameTheme';

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function isDark() {
  const forced = document.documentElement.getAttribute('data-theme');
  return forced ? forced === 'dark' : systemPrefersDark();
}

function syncNightToggle() {
  document.getElementById('nightToggle')?.setAttribute('aria-checked', String(isDark()));
}

function initNightMode() {
  const toggle = document.getElementById('nightToggle');
  if (!toggle) return;
  syncNightToggle();
  toggle.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* stockage indisponible : le choix vaut pour cette visite */ }
    syncNightToggle();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncNightToggle);
}

// Le texte de l'étape est replié (quelques lignes) pour laisser la place à
// l'image ; « Lire la suite » n'apparaît que si le texte déborde réellement.
function initCollapsibleDescription() {
  const section = document.getElementById('stepFooter');
  const text = document.getElementById('stepDescription');
  const toggle = document.getElementById('descToggle');
  if (!section || !text || !toggle) return;
  const label = toggle.querySelector('span');

  const refresh = () => {
    const overflowing = text.scrollHeight > text.clientHeight + 2 || !section.classList.contains('collapsed');
    toggle.hidden = !overflowing;
    section.classList.toggle('clamped', overflowing && section.classList.contains('collapsed'));
    label.textContent = section.classList.contains('collapsed') ? 'Lire la suite' : 'Réduire';
    toggle.classList.toggle('open', !section.classList.contains('collapsed'));
  };

  toggle.addEventListener('click', () => {
    section.classList.toggle('collapsed');
    refresh();
  });

  // Chaque nouveau contenu (autre étape, indice, règles) repart replié.
  new MutationObserver(() => {
    section.classList.add('collapsed');
    requestAnimationFrame(refresh);
  }).observe(text, { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', refresh);
  refresh();
}

function initResetConfirm() {
  const ask = document.getElementById('resetAsk');
  const confirmBox = document.getElementById('resetConfirm');
  const menu = document.getElementById('menuModal');
  if (!ask || !confirmBox || !menu) return;
  ask.addEventListener('click', () => {
    confirmBox.hidden = false;
    ask.hidden = true;
  });
  // La feuille se rouvre toujours sur le menu, jamais sur la confirmation.
  menu.addEventListener('close', () => {
    confirmBox.hidden = true;
    ask.hidden = false;
  });
}

export function initChrome() {
  initNightMode();
  initCollapsibleDescription();
  initResetConfirm();
}
