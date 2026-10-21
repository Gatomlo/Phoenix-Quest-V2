import { state, persistCurrentStep, persistProgressBar } from '../core/state.js';
import { eyeIcon, handIcon, chevronIcon, iconLockedHouse, iconOpenedHouse, iconLock } from './icons.js';

export function scenarioImg(fileName) {
  return `scenarios/${state.scenario}/img/${fileName}`;
}

export function resetFooterColor() {
  document.querySelectorAll('.card-footer').forEach(el => {
    el.style.backgroundColor = state.footerColor;
  });
}

// Petite transition de fondu à chaque changement d'étape/indice/cadenas :
// on relance l'animation CSS en retirant puis reposant la classe.
function animateContentChange() {
  ['contentImg', 'stepDescription'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('step-transition');
    void el.offsetWidth; // force le reflow pour redémarrer l'animation
    el.classList.add('step-transition');
  });
}

export function showUnavailable(title, message, imageSrc = 'medias/noway.png') {
  resetFooterColor();
  document.getElementById('stepName').innerHTML = title;
  const contentImg = document.getElementById('contentImg');
  contentImg.style.display = 'block';
  contentImg.innerHTML = `<img class="stepImg" src="${imageSrc}">`;
  document.getElementById('stepDescription').innerHTML = message;
  animateContentChange();
}

export function showMediaImage(step) {
  document.getElementById('contentImg').innerHTML =
    `<img class="img-fluid stepImg" src="${scenarioImg(step.media)}">`;
}

export function showStepChrome(step) {
  document.getElementById('contentImg').style.display = 'block';
  document.getElementById('stepName').innerHTML = step.name;
  resetFooterColor();
  document.getElementById('stepDescription').innerHTML = step.description;
  state.currentStep = step.id;
  persistCurrentStep();
  animateContentChange();
}

export function upProgressBar(step) {
  if (!step.progressBar || state.stepsInProgressBar.includes(step.id)) return;
  const increment = 100 / state.progressBarStepValue;
  state.progressBarValue += increment;
  state.stepsInProgressBar.push(step.id);
  persistProgressBar();
  syncProgressBar();
}

// Réapplique state.progressBarValue (restauré depuis le stockage local) à la
// barre DOM : sans ça, un rechargement de page affiche une barre à 0% tant
// qu'aucune nouvelle étape n'est franchie, alors que la valeur est bien
// conservée en mémoire/stockage.
export function syncProgressBar() {
  const bar = document.getElementById('myBar');
  if (!bar) return;
  // #myProgress est l'anneau de l'en-tête : --p pilote le remplissage (css/main.css),
  // #myBar porte le pourcentage affiché au centre.
  const value = Math.max(0, Math.min(100, state.progressBarValue));
  const ring = document.getElementById('myProgress');
  if (ring) {
    ring.style.setProperty('--p', value);
    ring.setAttribute('aria-valuenow', String(Math.round(value)));
  }
  bar.innerHTML = Math.round(value) + '%';
}

export function displayTime(ms) {
  let diffMs = ms;
  const hours = Math.floor(diffMs / 3600000);
  diffMs -= hours * 3600000;
  const minutes = Math.floor(diffMs / 60000);
  diffMs -= minutes * 60000;
  const seconds = Math.floor(diffMs / 1000);
  const pad = n => String(n).padStart(2, '0');
  const timer = document.getElementById('timer');
  if (timer) timer.innerHTML = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function locationStatusIcon(step, isOpened) {
  if (isOpened) return iconOpenedHouse;
  if (state.history.includes(step.id) && step.lockType != null) return iconLock;
  return iconLockedHouse;
}

export function addLocationEntry(step) {
  // On vérifie la présence dans le DOM (pas seulement dans `actualLocations`)
  // car à la reprise d'une partie, `actualLocations` est déjà restauré depuis
  // le stockage avant que les lignes n'existent : se fier au tableau d'état
  // empêchait de jamais reconstruire la liste après un rechargement de page.
  if (document.getElementById('stepID' + step.id)) return;
  const isOpened = state.locationsOpenedHistory.includes(step.id) || step.closed === false;
  const icon = locationStatusIcon(step, isOpened);
  const row = document.createElement('div');
  row.dataset.id = step.id;
  row.id = 'stepID' + step.id;
  row.className = 'item-row oneLocation';
  // Toute la ligne est cliquable : .oneLocationtoView s'étire sur elle (css/main.css).
  row.innerHTML = `<div class="locationStatus"><span>${icon}</span></div>` +
    `<div class="item-name">${step.name}</div>` +
    `<div data-name="${step.name}" data-closed="${!isOpened}" data-id="${step.id}" data-close-modal role="button" tabindex="0" aria-label="Ouvrir ${step.name}" class="oneLocationtoView badge">${chevronIcon}</div>`;
  document.getElementById('locationsList').appendChild(row);
  if (!state.actualLocations.includes(step.id)) state.actualLocations.push(step.id);
}

export function addObjectEntry(step) {
  if (document.getElementById('stepID' + step.id)) return;
  const row = document.createElement('div');
  row.id = 'stepID' + step.id;
  row.dataset.id = step.id;
  row.className = 'item-row oneObjectLine';
  row.innerHTML = `<div class="oneObject item-name">${step.name}</div>` +
    `<div class="item-actions">` +
    `<div data-id="${step.id}" data-close-modal role="button" tabindex="0" class="oneObjectToView badge">${eyeIcon}<span>Voir</span></div>` +
    `<div data-id="${step.id}" data-close-modal role="button" tabindex="0" class="oneObjectToUse badge">${handIcon}<span>Utiliser</span></div></div>`;
  document.getElementById('objectList').appendChild(row);
  if (!state.actualObjects.includes(step.id)) {
    state.actualObjects.push(step.id);
  }
}

export function markLocationRowOpened(id) {
  const row = document.getElementById('stepID' + id);
  if (!row) return;
  const status = row.querySelector('.locationStatus');
  if (status) status.innerHTML = iconOpenedHouse;
  const view = row.querySelector('.oneLocationtoView');
  if (view) view.dataset.closed = 'false';
}

export function markLocationRowLocked(id) {
  const row = document.getElementById('stepID' + id);
  if (!row) return;
  const status = row.querySelector('.locationStatus');
  if (status) status.innerHTML = iconLock;
}
