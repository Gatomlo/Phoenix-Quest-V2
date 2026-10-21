// Verrous à saisie texte : mot de passe, identifiant/mot de passe, date.
import { keyIcon } from '../ui/icons.js';

export function insertPasswordLock() {
  document.getElementById('contentImg').innerHTML =
    `<div class="input-group mb-3">` +
    `<input id="passwordInput" type="text" class="form-control" placeholder="Mot de passe" aria-label="Mot de passe">` +
    `<div class="input-group-append"><button id="passwordSendSoluce" class="btn btn-success" type="button">${keyIcon}</button></div></div>`;
}

export function insertLoginLock() {
  document.getElementById('contentImg').innerHTML =
    `<div class="mb-3">` +
    `<input id="loginInput" type="text" class="form-control" placeholder="Identifiant" aria-label="Identifiant">` +
    `<div class="mb-3"><div class="mb-3">` +
    `<input id="loginPasswordInput" type="text" class="form-control" placeholder="Mot de passe" aria-label="Mot de passe"></div>` +
    `<button id="loginSendSoluce" class="btn btn-success" type="button">${keyIcon}</button></div></div>`;
}

export function insertDateLock() {
  document.getElementById('contentImg').innerHTML =
    `<input id="datepicker" type="date" class="form-control" style="max-width:220px;display:inline-block">` +
    `<button id="dateSoluce" class="btn btn-success" type="button">${keyIcon}</button>`;
}

// Le format de scenario.json fige les dates en "jj/mm/aaaa" (rétrocompatibilité) ;
// <input type="date"> renvoie "aaaa-mm-jj", d'où cette petite conversion.
export function dateInputValueToFrench(isoValue) {
  if (!isoValue) return '';
  const [y, m, d] = isoValue.split('-');
  return `${d}/${m}/${y}`;
}
