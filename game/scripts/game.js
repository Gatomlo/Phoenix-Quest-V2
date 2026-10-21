import { state, restoreFromStorage, markInHistory, markLocationOpened,
  persistActualLocations, persistActualObjects, persistStepsReplaced,
  persistStepsReplacedBy, persistHintsCount } from './core/state.js';
import { getItem, setItem, clearAll, KEYS } from './core/storage.js';
import { fetchScenario, applyTheme, computeProgressBarStepValue, cacheScenarioAssets } from './core/scenario.js';
import { startTimer, computeScore } from './core/timer.js';
import * as render from './ui/render.js';
import { openModal, closeModal, initDialogs, showErrorToast } from './ui/dialogs.js';
import { getMainScanner, stopCameraDirectly, clearMainScanner } from './qr/qrScanner.js';
import { renderLock, wireLockInteractions } from './locks/index.js';
import * as backendSync from './core/backendSync.js';

function findStepById(id) {
  return state.dataJsonGlobal.steps.find(s => s.id === id);
}
function findStepByCode(code) {
  return state.dataJsonGlobal.steps.find(s => s.code === code);
}

// ---------------------------------------------------------------------------
// Ajout de lieux / objets aux listes (inventaire, lieux) + historique
// ---------------------------------------------------------------------------
function addItemOrLocation(step) {
  if (step.type === 'location') {
    const isOpened = state.locationsOpenedHistory.includes(step.id) || step.closed === false;
    if (isOpened) markLocationOpened(step.id);
    render.addLocationEntry(step);
    persistActualLocations();
  }
  if (step.type === 'object') {
    render.addObjectEntry(step);
    persistActualObjects();
  }
  markInHistory(step.id);
}

function addConnexeSteps(step) {
  if (step.closed) return;
  const toAdd = step.toAdd || [];
  state.dataJsonGlobal.steps.forEach(other => {
    if (toAdd.includes(other.id) && !state.history.includes(other.id)) {
      addItemOrLocation(other);
    }
  });
}

function removeConnexeSteps(step) {
  if (step.closed) return;
  const stepsToRemove = step.toRemove || [];
  const stepsToKeep = step.toAdd || [];
  stepsToRemove.forEach(entryId => {
    if (entryId === 'allLocations') {
      document.querySelectorAll('.oneLocation').forEach(row => {
        const id = Number(row.dataset.id);
        if (!stepsToKeep.includes(id)) {
          state.actualLocations = state.actualLocations.filter(item => item !== id);
          persistActualLocations();
          row.remove();
        }
      });
    }
    if (entryId === 'allItems') {
      document.querySelectorAll('.oneObjectLine').forEach(row => {
        const id = Number(row.dataset.id);
        if (!stepsToKeep.includes(id)) {
          state.actualObjects = state.actualObjects.filter(item => item !== id);
          persistActualObjects();
          row.remove();
        }
      });
    }
    document.getElementById('stepID' + entryId)?.remove();
    if (state.actualObjects.length > 0) {
      state.actualObjects = state.actualObjects.filter(item => item !== entryId);
      persistActualObjects();
    }
    if (state.actualLocations.length > 0) {
      state.actualLocations = state.actualLocations.filter(item => item !== entryId);
      persistActualLocations();
    }
  });
}

// ---------------------------------------------------------------------------
// Affichage d'une étape (lieu, objet, personnage, verrou...)
// ---------------------------------------------------------------------------
function showStep(step) {
  if (state.dataJsonGlobal.progressBar) render.upProgressBar(step);
  clearMainScanner();
  if (!state.timerIsOn) startTimer({ onTimeEnd: handleTimeEnd, onGameEnd: handleGameEnd });
  if (step.lastStep) clearInterval(state.timerInterval);

  render.showStepChrome(step);

  if (step.lockType != null && step.lockType !== 'withObject') {
    state.trying = [];
    renderLock(step, { onSolved: ifCodeSivalide, onFailed: handleLockFailure });
  } else {
    render.showMediaImage(step);
  }
}

function handleLockFailure() {
  showErrorToast();
  document.getElementById('actualCode').innerHTML = '';
  state.trying = [];
}

// Un verrou est résolu : ouvre le lieu, marque l'historique, et affiche
// l'étape pointée par `replaceBy`.
function ifCodeSivalide(step) {
  backendSync.enqueueEvent('lock_solved', { stepId: step.id, code: step.code });
  markLocationOpened(step.id);
  if (step.definitiveReplace && !state.stepsReplaced.includes(step.code)) {
    state.stepsReplaced.push(step.code);
    persistStepsReplaced();
  }
  const newStep = findStepByCode(step.replaceBy);
  if (!newStep) return;
  markInHistory(newStep.id);
  clearMainScanner();
  document.getElementById('contentImg').style.display = 'block';
  document.getElementById('actualCode').innerHTML = '';
  showStep(newStep);
  removeConnexeSteps(newStep);
  addItemOrLocation(newStep);
  addConnexeSteps(newStep);
  state.trying = [];
}

// Ajout forcé depuis le backend admin (bouton "Ajouter" de la liste des
// étapes) : traite le lieu/objet/personnage exactement comme s'il venait
// d'être scanné, cadenas éventuel affiché normalement pour que l'équipe le
// résolve elle-même (voir resolveLockedStep pour la résolution forcée), en
// ignorant les conditions de disponibilité (needBefore...) puisque c'est
// précisément une équipe bloquée qu'on aide à avancer.
function simulateScan(step) {
  if (step.type === 'person') {
    showStep(step);
    const toAdd = step.toAdd || [];
    state.dataJsonGlobal.steps.forEach((other) => {
      if (toAdd.includes(other.id) && !state.history.includes(other.id)) {
        removeConnexeSteps(other);
        addConnexeSteps(other);
        addItemOrLocation(other);
      }
    });
    return;
  }
  if (step.type === 'object') {
    showStep(step);
    if (!state.history.includes(step.id)) {
      removeConnexeSteps(step);
      addConnexeSteps(step);
      addItemOrLocation(step);
    }
    return;
  }
  if (step.type === 'location') {
    if (!state.actualLocations.includes(step.id)) addItemOrLocation(step);
    markInHistory(step.id);
    if (step.lockType == null) {
      markLocationOpened(step.id);
      render.markLocationRowOpened(step.id);
    } else {
      render.markLocationRowLocked(step.id);
    }
    showStep(step);
    removeConnexeSteps(step);
    addConnexeSteps(step);
  }
}

// Déblocage forcé depuis le backend admin (bouton "Débloquer cette étape",
// réservé aux étapes ayant un lockType) : simule la résolution du cadenas
// (ou l'association du bon objet), comme si le bon code/objet avait été
// fourni par l'équipe.
function resolveLockedStep(step) {
  if (step.lockType == null) return;
  ifCodeSivalide(step);
}

function handleHotspotSelect(targetId) {
  const step = findStepById(targetId);
  if (!step) return;
  showStep(step);
  removeConnexeSteps(step);
  addConnexeSteps(step);
  markLocationOpened(step.id);
}

// ---------------------------------------------------------------------------
// Minuteur : fin de temps / fin de partie
// ---------------------------------------------------------------------------
function handleTimeEnd(duration) {
  document.querySelectorAll('.gameInterfaceButton, .badge').forEach(el => { el.disabled = true; });
  render.resetFooterColor();
  document.getElementById('stepDescription').innerHTML = '<div>Le temps est malheureusement écoulé.</div>';
  document.getElementById('stepName').innerHTML = 'Temps écoulé';
  document.getElementById('contentImg').innerHTML = '<img class="img-fluid stepImg" src="medias/timeout.png">';
  const score = computeScore(duration, state.hintsCount, state.progressBarValue);
  document.getElementById('scoring').innerHTML = `<strong>Votre score est de: ${Math.ceil(score)} points.</strong>`;
  sendMail(duration, state.hintsCount, state.progressBarValue, Math.ceil(score));
  backendSync.finishGame({ elapsedMs: duration, hintsUsed: state.hintsCount, progressPercent: state.progressBarValue, score, outcome: 'timeout' });
}

function handleGameEnd(elapsedTime) {
  document.querySelectorAll('.gameInterfaceButton, .badge').forEach(el => { el.disabled = true; });
  const score = computeScore(elapsedTime, state.hintsCount, state.progressBarValue);
  document.getElementById('scoring').innerHTML = `<strong>Votre score est de: ${Math.ceil(score)} points.</strong>`;
  sendMail(elapsedTime, state.hintsCount, state.progressBarValue, Math.ceil(score));
  backendSync.finishGame({ elapsedMs: elapsedTime, hintsUsed: state.hintsCount, progressPercent: state.progressBarValue, score, outcome: 'completed' });
  state.gameFinished = true;
  setItem(KEYS.GAME_FINISHED, true);
  setItem(KEYS.SCORE, score);
}

function sendMail(time, hints, progress, score) {
  if (!state.dataJsonGlobal.sendMail || state.mailSended) return;
  if (typeof emailjs === 'undefined') {
    console.warn('emailjs indisponible (hors-ligne ?) : le mail de fin de partie ne sera pas envoyé.');
    return;
  }
  const hours = Math.floor(time / 3600000);
  const minutes = Math.floor((time % 3600000) / 60000);
  const seconds = Math.floor((time % 60000) / 1000);
  const pad = n => String(n).padStart(2, '0');
  emailjs.init('h8ZCIF_7XC9SdzgOB');
  const templateParams = {
    email: getItem(KEYS.GROUP_MAIL),
    group: getItem(KEYS.GROUP_NAME),
    message: 'test',
    progress: Math.round(progress),
    time: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
    hints,
    score
  };
  emailjs.send('service_4xsokbe', 'template_i0okt9m', templateParams).then(
    () => { state.mailSended = true; setItem(KEYS.MAIL_SENDED, true); },
    (error) => console.log('Échec envoi mail', error)
  );
}

// ---------------------------------------------------------------------------
// Interactions : liste des lieux / objets, indices, scan QR
// ---------------------------------------------------------------------------
function followReplacementChain(step) {
  let current = step;
  while (state.stepsReplaced.includes(current.code)) {
    let codeToFind;
    if (Array.isArray(current.toAssociate)) {
      const position = state.stepsReplaced.indexOf(current.code);
      codeToFind = current.replaceBy[state.stepsReplacedBy[position]];
    } else {
      codeToFind = current.replaceBy;
    }
    const next = findStepByCode(codeToFind);
    if (!next) break;
    current = next;
  }
  return current;
}

function wireLocationAndObjectLists() {
  document.addEventListener('click', (event) => {
    const locationView = event.target.closest('.oneLocationtoView');
    if (locationView) {
      const id = Number(locationView.dataset.id);
      if (locationView.dataset.closed === 'true') {
        clearMainScanner();
        document.getElementById('contentImg').style.display = 'block';
        document.getElementById('stepName').innerHTML = locationView.dataset.name;
        document.getElementById('contentImg').innerHTML = '<img class="stepImg" src="medias/noway.png">';
        document.getElementById('stepDescription').innerHTML =
          "Ce lieu n'est pas encore accessible. Vous devez scanner son Qr code avant de pouvoir l'ouvrir.";
      } else {
        const step = findStepById(id);
        if (step) showStep(followReplacementChain(step));
      }
      return;
    }
    const objectView = event.target.closest('.oneObjectToView');
    if (objectView) {
      const step = findStepById(Number(objectView.dataset.id));
      if (step) showStep(step);
      return;
    }
    const objectUse = event.target.closest('.oneObjectToUse');
    if (objectUse) handleObjectUse(Number(objectUse.dataset.id));
  });
}

function handleObjectUse(objectId) {
  const step = findStepById(state.currentStep);
  if (!step) return;
  let valueToCheck, valueReplaceBy, objectPosition;
  if (Array.isArray(step.toAssociate)) {
    objectPosition = step.toAssociate.indexOf(objectId);
    valueToCheck = step.toAssociate[objectPosition];
    valueReplaceBy = step.replaceBy[objectPosition];
  } else {
    valueToCheck = step.toAssociate;
    valueReplaceBy = step.replaceBy;
  }

  if (step.id === objectId) {
    render.showUnavailable('Action impossible', "Il n'est pas possible d'utiliser un objet avec lui-même.");
    return;
  }
  if (step.type === 'lock') {
    render.showUnavailable('Action impossible', "Il n'est pas possible d'utiliser un objet avec un verrou.");
    return;
  }
  if (valueToCheck !== objectId) {
    render.showUnavailable('Action impossible',
      "Il n'est pas possible d'utiliser cet objet de cette manière ou maintenant. Essayez-le ailleurs ou plus tard.");
    return;
  }

  const objectStep = findStepById(objectId);
  if (objectStep?.autoRemoveObject) {
    document.getElementById('stepID' + objectStep.id)?.remove();
    state.actualObjects = state.actualObjects.filter(item => item !== objectStep.id);
    persistActualObjects();
  }
  if (step.lockType === 'withObject') {
    markLocationOpened(step.id);
  }
  if (!state.stepsReplaced.includes(step.code) && step.definitiveReplace) {
    state.stepsReplaced.push(step.code);
    persistStepsReplaced();
    if (Array.isArray(step.toAssociate) && step.toAssociate.includes(objectId)) {
      const position = state.stepsReplaced.indexOf(step.code);
      state.stepsReplacedBy[position] = objectPosition;
      persistStepsReplacedBy();
    }
  }
  const newStep = findStepByCode(valueReplaceBy);
  if (!newStep) return;
  clearMainScanner();
  showStep(newStep);
  if (!state.locationsOpenedHistory.includes(newStep.id)) {
    markInHistory(newStep.id);
    if (newStep.type === 'location') markLocationOpened(newStep.id);
  }
  removeConnexeSteps(newStep);
  addConnexeSteps(newStep);
}

function wireHintButton() {
  document.getElementById('hintButton')?.addEventListener('click', () => {
    const step = findStepById(state.currentStep);
    if (!step) return;
    const data = state.dataJsonGlobal;
    const hintZone = document.getElementById('hintZone');
    if (data.hints && !data.hintsCount) {
      hintZone.innerHTML = step.hint != null ? step.hint : 'Aucun indice disponible pour cet élément';
      return;
    }
    if (!data.hints || !data.hintsCount) return;
    if (data.hintsLimit == null) {
      if (step.hint != null) {
        hintZone.innerHTML = step.hint;
        state.hintsCount += 1;
        persistHintsCount();
        document.getElementById('hintCountZone').innerHTML = `Vous avez utilisez ${state.hintsCount} indice(s).`;
        backendSync.enqueueEvent('hint_used', { stepId: step.id });
      } else {
        hintZone.innerHTML = 'Aucun indice disponible pour cet élément';
      }
      document.getElementById('hintCountdown').innerHTML = state.hintsCount;
    } else if (state.hintsCount > 1) {
      const displayCount = state.hintsCount - 1;
      document.getElementById('hintCountZone').innerHTML = `Il vous reste ${displayCount} indice(s).`;
      if (step.hint != null) {
        state.hintsCount -= 1;
        persistHintsCount();
        hintZone.innerHTML = step.hint;
        document.getElementById('hintCountdown').innerHTML = displayCount;
        backendSync.enqueueEvent('hint_used', { stepId: step.id });
      } else {
        hintZone.innerHTML = 'Aucun indice disponible pour cet élément';
      }
    } else {
      hintZone.innerHTML = "Vous n'avez plus d'indices disponibles.";
    }
  });
}

function wireRulesDisplay() {
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#MobileRules') && !event.target.closest('#rules')) return;
    document.getElementById('stepName').innerHTML = 'Règles du jeu';
    const contentImg = document.getElementById('contentImg');
    contentImg.style.display = 'block';
    contentImg.innerHTML = `<img class="img-fluid stepImg" src="${render.scenarioImg(state.dataJsonGlobal.mediaRules)}">`;
    document.getElementById('stepDescription').innerHTML = state.dataJsonGlobal.rules;
  });
}

function wireQrScanner() {
  document.getElementById('qrCodeButton')?.addEventListener('click', () => {
    document.getElementById('stepName').innerHTML = 'QrCode Scanneur';
    document.getElementById('contentImg').style.display = 'none';
    document.getElementById('stepDescription').innerHTML =
      'Scannez un qr code pour activer un lieu, récupérer un objet ou parler à un personnage.';
    getMainScanner().render(onScanSuccess);
  });
}

function onScanSuccess(decodeText) {
  clearMainScanner();
  if (decodeText === 'addhint') {
    render.resetFooterColor();
    document.getElementById('stepDescription').innerHTML = '<div>Bravo vous avez trouvé un indice bonus.<div>';
    document.getElementById('stepName').innerHTML = 'Indice supplémentaire';
    document.getElementById('contentImg').style.display = 'block';
    document.getElementById('contentImg').innerHTML = '<img class="stepImg" src="medias/addhint.png">';
    state.hintsCount += 1;
    persistHintsCount();
    backendSync.enqueueEvent('hint_used', { bonus: true });
    return;
  }
  if (decodeText === 'removehint') {
    render.resetFooterColor();
    document.getElementById('stepDescription').innerHTML = 'Vous avez perdu un indice.<div>';
    document.getElementById('stepName').innerHTML = 'Indice perdu';
    document.getElementById('contentImg').style.display = 'block';
    document.getElementById('contentImg').innerHTML = '<img class="stepImg" src="medias/removehint.png">';
    state.hintsCount -= 1;
    persistHintsCount();
    backendSync.enqueueEvent('hint_lost', {});
    return;
  }

  if (state.stepsReplaced.includes(decodeText)) {
    const replacedStep = findStepByCode(decodeText);
    if (replacedStep) {
      if (Array.isArray(replacedStep.replaceBy)) {
        const position = state.stepsReplaced.indexOf(replacedStep.code);
        decodeText = replacedStep.replaceBy[state.stepsReplacedBy[position]];
      } else {
        decodeText = replacedStep.replaceBy;
      }
      if (!state.locationsOpenedHistory.includes(replacedStep.id) && replacedStep.lockType == null) {
        markLocationOpened(replacedStep.id);
      }
    }
  }

  const step = findStepByCode(decodeText);
  if (!step) return;
  backendSync.enqueueEvent('qr_scan', { stepId: step.id, code: decodeText });

  if (step.type === 'person') {
    const notReady = step.needBefore != null && !state.history.includes(step.needBefore);
    if (notReady) {
      render.showUnavailable('Personnage non disponible pour le moment',
        "Vous ne pouvez pas encore parler à ce personnage. Veuillez avancer dans l'histoire avant de pouvoir le scanner.");
      return;
    }
    document.getElementById('contentImg').style.display = 'block';
    showStep(step);
    const toAdd = step.toAdd || [];
    state.dataJsonGlobal.steps.forEach(other => {
      if (toAdd.includes(other.id) && !state.history.includes(other.id)) {
        removeConnexeSteps(other);
        addConnexeSteps(other);
        addItemOrLocation(other);
      }
    });
    return;
  }

  if (step.type === 'object') {
    if (state.history.includes(step.id)) {
      document.getElementById('contentImg').style.display = 'block';
      showStep(step);
      return;
    }
    if (!state.history.includes(step.id) && state.locationsOpenedHistory.includes(step.needBefore)) {
      document.getElementById('contentImg').style.display = 'block';
      showStep(step);
      removeConnexeSteps(step);
      addConnexeSteps(step);
      addItemOrLocation(step);
      return;
    }
    if (!state.locationsOpenedHistory.includes(step.needBefore)) {
      render.showUnavailable('Objet non disponible pour le moment',
        "Vous ne pouvez pas encore scanner cet objet. Veuillez avancer dans l'histoire avant de pouvoir le scanner.");
    }
    return;
  }

  if (step.type === 'location') {
    if (state.actualLocations.includes(step.id)) {
      if (step.lockType == null) state.locationsOpenedHistory.push(step.id);
      state.history.push(step.id);
      document.getElementById('contentImg').style.display = 'block';
      const row = document.getElementById('stepID' + step.id)?.querySelector('.oneLocationtoView');
      if (row) row.dataset.closed = 'false';
      if (step.lockType == null) render.markLocationRowOpened(step.id);
      else render.markLocationRowLocked(step.id);
      showStep(step);
      removeConnexeSteps(step);
      addConnexeSteps(step);
      setItem(KEYS.HISTORY, state.history);
      if (step.lockType == null) setItem(KEYS.LOCATIONS_OPENED, state.locationsOpenedHistory);
      return;
    }
    render.showUnavailable('Lieu non découvert',
      "Vous ne n'avez pas encore découvert ce lieu. Veuillez avancer dans l'histoire avant de pouvoir le scanner.");
  }
}

// ---------------------------------------------------------------------------
// Réinitialisation, menu, sélection de scénario, inscription
// ---------------------------------------------------------------------------
function wireResetGame() {
  document.getElementById('resetGame')?.addEventListener('click', async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
    } catch (error) {
      console.error('Erreur lors de la réinitialisation complète :', error);
    } finally {
      clearAll();
      window.location.href = window.location.origin + window.location.pathname;
    }
  });
}

function wireEmailModal() {
  document.getElementById('emailButton')?.addEventListener('click', () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const groupName = document.getElementById('groupName').value;
    const groupMail = document.getElementById('groupEmail').value;
    if (groupName !== '' && emailRegex.test(groupMail)) {
      setItem(KEYS.GROUP_NAME, groupName);
      setItem(KEYS.GROUP_MAIL, groupMail);
      closeModal('emailModal');
      initGame();
    } else {
      document.getElementById('emailErrorMessage').innerHTML =
        '<br><div class="alert alert-warning" role="alert"> Veuillez indiquer un nom de groupe et un Email valide.</div>';
    }
  });
}

// ---------------------------------------------------------------------------
// Démarrage / chargement du scénario
// ---------------------------------------------------------------------------
// Icône personnalisée d'un scénario : elle remplace seulement le pictogramme du bouton,
// pas son libellé (les icônes par défaut sont déjà dans index.html).
function setTabIcon(buttonId, svgMarkup) {
  const slot = document.querySelector(`#${buttonId} .tab-ico`);
  if (slot) slot.innerHTML = svgMarkup;
}

function applyScenarioChrome(data) {
  document.title = data.nameStory;
  document.getElementById('titleText').innerHTML = data.nameStory;
  document.getElementById('locationListTitle').innerHTML = data.locationListTitle;
  document.getElementById('itemListTitle').innerHTML = data.itemListTitle;

  if (data.logo != null) {
    document.getElementById('logo').src = render.scenarioImg(data.logo);
    document.getElementById('mobileLogo').src = render.scenarioImg(data.logo);
  }
  if (data.fav != null) {
    document.getElementById('favicon').setAttribute('href', render.scenarioImg(data.fav));
  }
  if (!data.progressBar) document.getElementById('myProgress')?.remove();
  if (data.hintsLimit != null) {
    state.hintsCount = data.hintsLimit;
    document.getElementById('hintCountdown').innerHTML = state.hintsCount;
  }
  if (!data.timer) document.getElementById('timer')?.remove();
  if (!data.locationList) {
    document.getElementById('locationsButton')?.remove();
  } else if (data.locationIcon != null) {
    setTabIcon('locationsButton', data.locationIcon);
  }
  if (!data.qrCodeReader) document.getElementById('qrCodeButton')?.remove();
  if (!data.itemList) {
    document.getElementById('itemsButton')?.remove();
  } else if (data.itemIcon != null) {
    setTabIcon('itemsButton', data.itemIcon);
  }
  if (data.map) {
    document.getElementById('mapArea').innerHTML =
      `<div id="imgMap" class="lg-container"><img alt="Workplace" usemap="#workmap" class="img-fluid lg-image stepImg" src="${render.scenarioImg('map.png')}">` +
      '<map name="workmap"><area class="toClick" shape="rect" coords="34,44,270,350" alt="Computer" href="computer.htm">' +
      '<area class="toClick" shape="rect" coords="290,172,333,250" alt="Phone" href="phone.htm">' +
      '<area class="toClick" shape="circle" coords="337,300,44" alt="Coffee" href="coffee.htm"></map></div>';
  } else {
    document.getElementById('mapButton')?.remove();
  }
  if (!data.hints) document.getElementById('hintButton')?.remove();
  if (!data.hintsCount) document.getElementById('hintCountZone')?.remove();

  document.getElementById('stepName').innerHTML = 'Règles du jeu';
  const contentImg = document.getElementById('contentImg');
  contentImg.style.display = 'block';
  contentImg.innerHTML = `<img class="img-fluid stepImg" src="${render.scenarioImg(data.mediaRules)}">`;
  document.getElementById('stepDescription').innerHTML = data.rules;
}

export function initGame() {
  if (!backendSync.hasJoinedSession()) {
    openModal('sessionModal');
    return;
  }
  // Verrouille immédiatement avec le dernier état de session connu, avant
  // même la connexion au flux temps réel : sans ça, une session en
  // pause/clôturée resterait jouable pendant la fraction de seconde où l'app
  // se recharge, le temps que le flux confirme l'état actuel.
  const cachedStatus = getItem(KEYS.SESSION_STATUS, 'active');
  if (cachedStatus !== 'active') {
    applySessionStatus({
      status: cachedStatus,
      pauseMessage: getItem(KEYS.SESSION_PAUSE_MESSAGE, null),
      pausedAt: getItem(KEYS.SESSION_PAUSED_AT, null),
      totalPausedMs: getItem(KEYS.SESSION_TOTAL_PAUSED_MS, 0)
    });
  }
  fetchScenario(state.scenario).then((data) => {
    // Réglages propres à cette session (indices, minuteur, chat...),
    // par-dessus les valeurs par défaut du scénario.
    data = { ...data, ...backendSync.getSettingsOverride() };
    state.dataJsonGlobal = data;
    state.progressBarStepValue = computeProgressBarStepValue(data);
    applyTheme(data);
    applyScenarioChrome(data);
    cacheScenarioAssets(state.scenario, data);
    wireBackendFeatures();

    restoreFromStorage();
    render.syncProgressBar();
    const steps = data.steps;

    if (getItem(KEYS.HISTORY, null) !== null) {
      // Reprise d'une partie déjà commencée.
      const currentId = state.currentStep;
      steps.forEach((step) => {
        if (state.actualObjects.includes(step.id) || state.actualLocations.includes(step.id)) {
          addItemOrLocation(step);
        }
        if (step.id == currentId) showStep(step);
      });
    } else {
      steps.forEach((step) => {
        if (step.default === true) addItemOrLocation(step);
      });
    }

    document.getElementById('loadingScreen').style.display = 'none';
  });
}

// ---------------------------------------------------------------------------
// Intégration backend admin : session (suivi + chat), remontée d'événements
// ---------------------------------------------------------------------------

// Applique (et mémorise) l'état de la session : verrouille/déverrouille
// l'app et fige le chrono en conséquence. Utilisée à la fois par le flux
// temps réel (voir wireBackendFeatures) ET dès le lancement de l'app
// (voir initGame) pour verrouiller instantanément avec le dernier état
// connu, sans attendre la connexion au flux — sinon une fenêtre de quelques
// centaines de ms resterait jouable après un rechargement pendant une
// pause/clôture.
function applySessionStatus({ status, pauseMessage, pausedAt, totalPausedMs }) {
  const locked = status === 'paused' || status === 'closed';
  state.pausedAt = locked ? (pausedAt || new Date().toISOString()) : null;
  state.totalPausedMs = totalPausedMs || 0;

  setItem(KEYS.SESSION_STATUS, status);
  setItem(KEYS.SESSION_PAUSE_MESSAGE, pauseMessage || null);
  setItem(KEYS.SESSION_PAUSED_AT, state.pausedAt);
  setItem(KEYS.SESSION_TOTAL_PAUSED_MS, state.totalPausedMs);

  const lockedScreen = document.getElementById('sessionLockedScreen');
  lockedScreen.hidden = !locked;
  document.getElementById('sessionLockedLeaderboardButton').hidden = !locked;
  if (status === 'paused') {
    document.getElementById('sessionLockedTitle').textContent = 'Jeu en pause';
    document.getElementById('sessionLockedMessage').textContent =
      "L'animateur a mis le jeu en pause. Merci de patienter, la partie reprendra bientôt.";
    const custom = document.getElementById('sessionLockedCustomMessage');
    custom.textContent = pauseMessage || '';
    custom.hidden = !pauseMessage;
  } else if (status === 'closed') {
    document.getElementById('sessionLockedTitle').textContent = 'Session terminée';
    document.getElementById('sessionLockedMessage').textContent =
      "L'animateur a clôturé cette session de jeu. Merci d'avoir joué !";
    document.getElementById('sessionLockedCustomMessage').hidden = true;
  }
}

function isChatEnabled() {
  // Rétrocompatible : absent du scenario.json => activé par défaut.
  return state.dataJsonGlobal?.chat !== false;
}

// Le code de session détermine à la fois l'équipe suivie ET le scénario à
// charger (plus de saisie manuelle d'un code de scénario séparé) : une
// session créée par l'admin est toujours liée à un scénario précis.
function wireSessionModal() {
  document.getElementById('sessionJoinButton')?.addEventListener('click', async () => {
    const code = document.getElementById('sessionCodeInput').value.trim();
    const teamName = document.getElementById('teamNameInput').value.trim();
    const errorZone = document.getElementById('sessionErrorMessage');
    errorZone.innerHTML = '';
    if (!code || !teamName) {
      errorZone.innerHTML =
        '<br><div class="alert alert-warning" role="alert">Indiquez le code de session et le nom de votre équipe.</div>';
      return;
    }
    document.getElementById('loadingScreen').style.display = 'block';
    try {
      const { session } = await backendSync.joinSession(code, teamName);
      state.scenario = session.scenarioCode;
      setItem(KEYS.SCENARIO, session.scenarioCode);
      const data = await fetchScenario(session.scenarioCode);
      closeModal('sessionModal');
      if (data.sendMail === true) {
        openModal('emailModal');
        document.getElementById('loadingScreen').style.display = 'none';
      } else {
        initGame();
      }
    } catch (err) {
      document.getElementById('loadingScreen').style.display = 'none';
      errorZone.innerHTML = `<br><div class="alert alert-warning" role="alert">${err.message}</div>`;
    }
  });
}

function appendChatBubble(message) {
  const thread = document.getElementById('chatThread');
  if (!thread) return;
  thread.querySelector('.chat-empty')?.remove();
  const bubble = document.createElement('div');
  bubble.className = 'chat-message ' + (message.sender === 'admin' ? 'admin' : 'team');
  bubble.textContent = message.text;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
}

function showChatUnreadDot() {
  const dot = document.getElementById('chatUnreadDot');
  if (dot) dot.hidden = false;
}

function hideChatUnreadDot() {
  const dot = document.getElementById('chatUnreadDot');
  if (dot) dot.hidden = true;
}

function wireChat() {
  document.getElementById('chatForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    appendChatBubble({ sender: 'team', text });
    backendSync.sendChatMessage(text);
    input.value = '';
  });

  // Le joueur peut continuer à jouer sans être interrompu : le point rouge
  // sur le bouton signale un message en attente, à consulter quand il veut.
  document.getElementById('chatButton')?.addEventListener('click', hideChatUnreadDot);
}

function formatDurationHms(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`;
}

function wireLeaderboard() {
  document.querySelectorAll('[data-open-modal="leaderboardModal"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const content = document.getElementById('leaderboardContent');
      content.innerHTML = 'Chargement…';
      try {
        const { ranking } = await backendSync.fetchLeaderboard(backendSync.getSessionCode());
        if (!ranking.length) {
          content.innerHTML = '<p>Aucune équipe n\'a encore terminé cette partie.</p>';
          return;
        }
        const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
        // Une carte par équipe plutôt qu'un tableau : sur mobile, un tableau
        // à 6 colonnes ne tient pas dans la largeur de la modale (voir
        // historique du fichier) — cet empilement vertical affiche tout sans
        // glissière, quelle que soit la largeur d'écran.
        const rows = ranking.map((t) => `<li class="leaderboard-row${t.rank === 1 ? ' leaderboard-first' : ''}">
          <div class="leaderboard-rank-name">
            <span class="leaderboard-rank">#${t.rank}</span>
            <span class="leaderboard-team">${escapeHtml(t.name)}</span>
          </div>
          <div class="leaderboard-stats">
            <div><span class="leaderboard-stat-label">Temps</span><span class="leaderboard-stat-value">${formatDurationHms(t.elapsedMs)}</span></div>
            <div><span class="leaderboard-stat-label">Progression</span><span class="leaderboard-stat-value">${Math.round(t.progressPercent || 0)}%</span></div>
            <div><span class="leaderboard-stat-label">Indices</span><span class="leaderboard-stat-value">${t.hintsUsed ?? 0}</span></div>
            <div><span class="leaderboard-stat-label">Score</span><span class="leaderboard-stat-value">${Math.round(t.score)}</span></div>
          </div>
        </li>`).join('');
        content.innerHTML = `<ol class="leaderboard-list">${rows}</ol>`;
      } catch {
        content.innerHTML = '<p>Classement indisponible pour le moment.</p>';
      }
    });
  });
}

// Appelé une fois la partie chargée (ou dès le démarrage si une session a
// déjà été rejointe précédemment) : affiche le chat, récupère l'historique,
// et écoute les messages/déblocages/ajustements d'indices en direct.
function wireBackendFeatures() {
  backendSync.startBackgroundSync();
  if (!backendSync.hasJoinedSession()) return;

  const chatButton = document.getElementById('chatButton');
  const leaderboardButton = document.getElementById('menuLeaderboardButton');
  if (leaderboardButton) leaderboardButton.hidden = false;

  const infoLine = document.getElementById('sessionInfoLine');
  if (infoLine) {
    infoLine.textContent = `Session ${backendSync.getSessionCode()} · Équipe ${backendSync.getTeamName() || '—'}`;
    infoLine.hidden = false;
  }

  if (isChatEnabled()) {
    if (chatButton) chatButton.hidden = false;
    backendSync.fetchChatHistory().then((messages) => {
      const thread = document.getElementById('chatThread');
      if (thread) thread.innerHTML = messages.length ? '' : '<p class="chat-empty">Aucun message pour l\'instant.</p>';
      messages.forEach(appendChatBubble);
    }).catch(() => {});
  }

  backendSync.subscribeToTeamStream({
    onMessage: (message) => {
      if (!isChatEnabled()) return;
      appendChatBubble(message);
      if (!document.getElementById('chatModal')?.open) showChatUnreadDot();
    },
    onUnlock: ({ stepId, action }) => {
      const step = findStepById(Number(stepId)) || findStepById(stepId);
      if (!step) return;
      if (action === 'resolve') resolveLockedStep(step);
      else simulateScan(step);
    },
    // Le serveur envoie toujours le total exact (pas un delta) : reçu à
    // l'ouverture du flux et à chaque ajustement, ça absorbe les
    // notifications manquées pendant une coupure de connexion.
    onHintsSync: (hintsCount) => {
      state.hintsCount = hintsCount;
      persistHintsCount();
      const countdown = document.getElementById('hintCountdown');
      if (countdown) countdown.innerHTML = state.hintsCount;
    },
    // Reçu à l'ouverture du flux (état actuel) et en direct si l'admin
    // clôture/réactive/met en pause pendant que l'app est ouverte. Toujours
    // la valeur autoritaire (pas un delta) : absorbe les changements manqués
    // pendant une coupure (veille, réseau...).
    onSessionStatus: applySessionStatus
  });
}

// Transfert vers un nouveau téléphone via le QR généré par l'admin (ou un
// lien ?resume=<jeton> partagé autrement) : reprend l'équipe visée avant
// même d'afficher l'écran normal de connexion. Le paramètre est retiré de
// l'URL dans tous les cas pour ne pas retenter la reprise à chaque
// rechargement (ex. jeton déjà utilisé par un autre appareil entretemps).
async function resumeFromUrlIfPresent() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('resume');
  if (!token) return;
  url.searchParams.delete('resume');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  try {
    await backendSync.resumeWithToken(token);
  } catch (err) {
    showErrorToast(err.message || 'Impossible de reprendre cette équipe.');
  }
}

export async function startApp() {
  await resumeFromUrlIfPresent();
  restoreFromStorage();
  initDialogs();
  wireLocationAndObjectLists();
  wireHintButton();
  wireRulesDisplay();
  wireQrScanner();
  wireResetGame();
  wireEmailModal();
  wireSessionModal();
  wireChat();
  wireLeaderboard();
  wireLockInteractions({
    findStepById,
    getCurrentStep: () => state.currentStep,
    onSolved: ifCodeSivalide,
    onFailed: handleLockFailure,
    onHotspotSelect: handleHotspotSelect
  });
  initGame();
}
