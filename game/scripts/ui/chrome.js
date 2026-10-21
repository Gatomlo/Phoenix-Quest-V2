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

// Plein écran : masque la barre d'adresse du navigateur. L'API exige un geste de
// l'utilisateur : on l'active au clic sur « Rejoindre » (par défaut, téléphones et
// tablettes), puis au premier appui après un rechargement une fois la partie
// démarrée. Une courte notification explique, une seule fois, comment le couper. Sortir du plein écran (geste système) vaut refus : on
// ne le réimpose plus tant que l'interrupteur du menu n'est pas rallumé.
// Indisponible sur iPhone (Safari) : l'interrupteur reste alors caché, et
// l'installation sur l'écran d'accueil (manifest) donne le même résultat.
const FULLSCREEN_KEY = 'phoenixGameFullscreen';
const FULLSCREEN_HINT_KEY = 'phoenixGameFullscreenHinted';

function fullscreenWanted() {
  try { return localStorage.getItem(FULLSCREEN_KEY) !== 'off'; } catch (e) { return true; }
}

function setFullscreenWanted(on) {
  try { localStorage.setItem(FULLSCREEN_KEY, on ? 'on' : 'off'); } catch (e) { /* choix valable pour cette visite seulement */ }
}

function enterFullscreen() {
  if (document.fullscreenElement) return;
  const request = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  request?.catch(() => { /* refusé par le navigateur : on n'insiste pas */ });
}

function showFullscreenHint() {
  try {
    if (localStorage.getItem(FULLSCREEN_HINT_KEY)) return;
    localStorage.setItem(FULLSCREEN_HINT_KEY, '1');
  } catch (e) { /* sans stockage, la notification peut revenir : sans gravité */ }
  const hint = document.createElement('div');
  hint.className = 'fs-hint';
  hint.setAttribute('role', 'status');
  hint.innerHTML = '<span>Plein écran activé. Vous pouvez le désactiver dans le menu <b>⋯</b>, option « Plein écran ».</span>' +
    '<button type="button" class="fs-hint-close" aria-label="Fermer">&times;</button>';
  const close = () => hint.remove();
  hint.querySelector('.fs-hint-close').addEventListener('click', close);
  document.body.appendChild(hint);
  setTimeout(close, 9000);
}

function gameStarted() {
  return !document.getElementById('sessionModal')?.open;
}

function initFullscreen() {
  if (!document.fullscreenEnabled || !window.matchMedia('(pointer: coarse)').matches) return; // téléphones et tablettes seulement
  const toggle = document.getElementById('fullscreenToggle');
  const sync = () => toggle?.setAttribute('aria-checked', String(!!document.fullscreenElement));
  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      if (document.fullscreenElement) {
        setFullscreenWanted(false);
        document.exitFullscreen();
      } else {
        setFullscreenWanted(true);
        enterFullscreen();
      }
    });
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.visibilityState === 'visible') setFullscreenWanted(false);
    sync();
  });
  document.getElementById('sessionJoinButton')?.addEventListener('click', () => {
    setFullscreenWanted(true);
    enterFullscreen();
  });
  // Fenêtre de connexion fermée = code accepté : la partie démarre, on prévient.
  document.getElementById('sessionModal')?.addEventListener('close', () => {
    if (document.fullscreenElement) showFullscreenHint();
  });
  // Reprise après rechargement : le premier appui, une fois en jeu, remet le plein écran.
  const resume = () => {
    if (!gameStarted()) return;
    document.removeEventListener('pointerup', resume);
    if (fullscreenWanted()) enterFullscreen();
  };
  document.addEventListener('pointerup', resume);
  sync();
}

export function initChrome() {
  initFullscreen();
  initNightMode();
  initCollapsibleDescription();
  initResetConfirm();
}
