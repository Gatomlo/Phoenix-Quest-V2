// Coque commune du back-office : thème (auto / clair / sombre), son des alertes
// et barre latérale. Script classique (pas un module) chargé dans le <head> pour
// appliquer le thème avant le premier affichage et éviter un flash clair.
(function () {
  var THEME_KEY = 'phoenixAdminTheme';
  var SOUND_KEY = 'phoenixAdminSound';

  function read(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* stockage indisponible : on garde la valeur en mémoire */ }
  }

  var state = { theme: read(THEME_KEY, 'auto'), sound: read(SOUND_KEY, 'off') === 'on' };

  function applyTheme() {
    var root = document.documentElement;
    if (state.theme === 'light' || state.theme === 'dark') root.setAttribute('data-theme', state.theme);
    else root.removeAttribute('data-theme');
  }
  applyTheme();

  // --- Son : deux petits bips synthétisés (aucun fichier audio à servir) ----
  var audioCtx = null;
  function unlockAudio() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* audio indisponible */ }
  }
  function tone(freq, start, duration) {
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + start + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + start);
    osc.stop(audioCtx.currentTime + start + duration + 0.05);
  }
  // 'message' : deux notes montantes ; 'offline' : deux notes descendantes.
  function notify(kind) {
    if (!state.sound) return;
    unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    if (kind === 'offline') { tone(520, 0, 0.16); tone(390, 0.18, 0.22); }
    else { tone(660, 0, 0.12); tone(880, 0.14, 0.18); }
  }

  window.PhoenixShell = { notify: notify };

  // --- Barre latérale ------------------------------------------------------
  var ICONS = {
    play: '<path d="M7 5l12 7-12 7V5z"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    bell: '<path d="M6 17V11a6 6 0 0112 0v6l2 2H4l2-2zM10 21h4"/>',
    logout: '<path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9"/>',
    expand: '<path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4"/>'
  };
  function icon(name) {
    return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
  }
  var FLAME = '<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">' +
    '<path fill="#FF934F" d="M33 4c3 10 15 15 15 31a16 16 0 01-32 0c0-8 5-12 8-17 1 5 3 8 6 9 0-9-1-16 3-23z"/>' +
    '<path fill="#4B967D" d="M10 52c10-1 18-6 22-14-2 12-10 20-22 14z"/>' +
    '<path fill="#F1E4C8" d="M32 30c2 5 7 7 7 13a7 7 0 01-14 0c0-4 3-6 4-9 1 2 2 3 3 3 0-2 0-4 0-7z"/></svg>';

  function buildSidebar() {
    var side = document.getElementById('appSide');
    if (!side) return;
    var active = side.getAttribute('data-active') || 'parties';
    var nav = [
      ['parties', 'index.html', 'play', 'Parties'],
      ['scenarios', 'scenario-editor.html', 'map', 'Scénarios']
    ];
    side.innerHTML =
      '<div class="brand">' + FLAME + '<div><b>Phoenix</b><small>Animateur</small></div></div>' +
      nav.map(function (n) {
        return '<a class="nv' + (n[0] === active ? ' on' : '') + '" href="' + n[1] + '">' + icon(n[2]) + '<span class="nv-label">' + n[3] + '</span></a>';
      }).join('') +
      '<div class="side-spacer"></div>' +
      '<div class="pref"><small>Apparence</small>' +
        '<div class="seg" role="group" aria-label="Apparence">' +
          [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(function (t) {
            return '<button type="button" data-theme-choice="' + t[0] + '">' + t[1] + '</button>';
          }).join('') +
        '</div>' +
        '<button type="button" class="snd" data-sound-toggle>' + icon('bell') + '<span class="nv-label">Son des alertes</span><span class="sw"></span></button>' +
        '<button type="button" class="snd" data-fullscreen-toggle hidden>' + icon('expand') + '<span class="nv-label">Plein écran</span><span class="sw"></span></button>' +
      '</div>' +
      '<button type="button" id="logoutButton" class="nv dim">' + icon('logout') + '<span class="nv-label">Déconnexion</span></button>';
    syncPrefs();
  }

  function syncPrefs() {
    var buttons = document.querySelectorAll('[data-theme-choice]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('on', buttons[i].getAttribute('data-theme-choice') === state.theme);
    }
    var snd = document.querySelectorAll('[data-sound-toggle]');
    for (var j = 0; j < snd.length; j++) snd[j].classList.toggle('on', state.sound);
    var fs = document.querySelectorAll('[data-fullscreen-toggle]');
    for (var k = 0; k < fs.length; k++) {
      fs[k].hidden = !document.fullscreenEnabled;
      fs[k].classList.toggle('on', !!document.fullscreenElement);
    }
  }

  document.addEventListener('click', function (event) {
    var themeBtn = event.target.closest('[data-theme-choice]');
    if (themeBtn) {
      state.theme = themeBtn.getAttribute('data-theme-choice');
      write(THEME_KEY, state.theme);
      applyTheme();
      syncPrefs();
      return;
    }
    if (event.target.closest('[data-fullscreen-toggle]')) {
      // Plein écran : masque la barre d'adresse du navigateur (geste requis par l'API).
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(function () {});
      return;
    }
    if (event.target.closest('[data-sound-toggle]')) {
      state.sound = !state.sound;
      write(SOUND_KEY, state.sound ? 'on' : 'off');
      syncPrefs();
      // Geste utilisateur : seul moment où le navigateur autorise le démarrage audio.
      if (state.sound) { unlockAudio(); notify('message'); }
    }
  });

  // Déconnexion par défaut pour les pages qui n'ont pas leur propre gestionnaire
  // (la page d'accueil de l'admin en pose un lui-même via #logoutButton).
  document.addEventListener('click', function (event) {
    var btn = event.target.closest('#logoutButton');
    if (!btn || document.body.hasAttribute('data-own-logout')) return;
    fetch('../api/admin/logout', { method: 'POST', credentials: 'include' })
      .catch(function () {})
      .then(function () { location.href = 'index.html'; });
  });

  document.addEventListener('fullscreenchange', syncPrefs);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSidebar);
  else buildSidebar();
})();
