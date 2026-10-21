// Verrous à grille de boutons : couleur, chiffres, directions, fusibles.
import { state } from '../core/state.js';
import { resetIcon, keyIcon, toggleOffIcon, directionIcons } from '../ui/icons.js';

function circleSvg(hexColor) {
  return `<svg width="1em" height="1em" viewBox="0 0 16 16" class="bi bi-circle-fill" fill="#${hexColor}" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8"/></svg>`;
}

const controlButtons = `<div class="col oneDigit"><button id="reset" type="button" class="btn digit btn-warning">${resetIcon}</button></div>`;
const submitButton = `<div class="col oneDigit"><button id="sendSoluce" type="button" class="btn digit btn-success">${keyIcon}</button></div>`;

export function insertColorLock() {
  const colors = [
    ['pinkDigit', 'F06292'], ['blueDigit', '0b30d9'], ['greenDigit', '0c9411'],
    ['yellowDigit', 'fafa1e'], ['orangeDigit', 'ff8d0d'], ['redDigit', 'ff0000'],
    ['violetDigit', '7B1FA2'], ['brownDigit', '582900'], ['grayDigit', '878787']
  ];
  const rows = [];
  for (let i = 0; i < colors.length; i += 3) {
    const cells = colors.slice(i, i + 3).map(([id, color]) =>
      `<div class="col oneDigit"><button id="${id}" data-color="${color}" type="button" class="btn digit btn-primary colorButton">${circleSvg(color)}</button></div>`
    ).join('');
    rows.push(`<div class="row justify-content-center">${cells}</div>`);
  }
  rows.push(`<div class="row justify-content-center">${controlButtons}` +
    `<div class="col oneDigit"><button id="blackDigit" data-color="000000" type="button" class="btn digit btn-primary colorButton">${circleSvg('000000')}</button></div>${submitButton}</div>`);
  document.getElementById('contentImg').innerHTML =
    `<div class="card-body passCardBody"><div id="digit" class="lockContainer">${rows.join('')}</div></div>`;
}

export function insertDigitLock() {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const rows = [];
  for (let i = 0; i < digits.length; i += 3) {
    const cells = digits.slice(i, i + 3).map(d =>
      `<div class="col oneDigit"><button id="${d}Digit" data-digitvalue="${d}" type="button" class="btn digit btn-primary digitButton">${d}</button></div>`
    ).join('');
    rows.push(`<div class="row justify-content-center">${cells}</div>`);
  }
  rows.push(`<div class="row justify-content-center">${controlButtons}` +
    `<div class="col oneDigit"><button id="0Digit" data-digitvalue="0" type="button" class="btn digit btn-primary digitButton">0</button></div>${submitButton}</div>`);
  document.getElementById('contentImg').innerHTML =
    `<div class="card-body passCardBody"><div id="digit" class="lockContainer">${rows.join('')}</div></div>`;
}

export function insertDirectionnalLock() {
  const grid = [
    ['no', 'n', 'ne'],
    ['o', null, 'e'],
    ['so', 's', 'se']
  ];
  const rows = grid.map(row => {
    const cells = row.map(dir => {
      if (!dir) return '<div class="col oneDigit"></div>';
      return `<div class="col oneDigit"><button data-orientation="${dir}" id="${dir}Digit" type="button" class="btn digit btn-primary orientationButton">${directionIcons[dir]}</button></div>`;
    }).join('');
    return `<div class="row justify-content-center">${cells}</div>`;
  });
  rows.push(`<div class="row justify-content-center">${controlButtons}${submitButton}</div>`);
  document.getElementById('contentImg').innerHTML =
    `<div id="digit" class="lockContainer">${rows.join('')}</div>`;
}

export function insertFuseLock() {
  state.trying = new Array(16).fill(false);
  const switches = [];
  for (let i = 0; i < 16; i++) {
    switches.push(`<div class="col oneDigit"><button id="switch${i}" data-index="${i}" data-check="false" type="button" class="btn digit switch btn-primary">${toggleOffIcon}</button></div>`);
  }
  const rows = [];
  for (let i = 0; i < switches.length; i += 4) {
    rows.push(`<div class="row justify-content-center">${switches.slice(i, i + 4).join('')}</div>`);
  }
  const resetButton = `<div class="col oneDigit"><button id="resetSwitch" type="button" class="btn digit btn-warning">${resetIcon}</button></div>`;
  rows.push(`<div class="row justify-content-center">${resetButton}${submitButton}</div>`);
  document.getElementById('contentImg').innerHTML = `<div id="digit" class="lockContainer">${rows.join('')}</div>`;
}

export function displayColors() {
  const zone = document.getElementById('actualCode');
  zone.innerHTML = '';
  state.trying.forEach(color => {
    zone.insertAdjacentHTML('beforeend', circleSvg(color).replace('1em', '2em'));
  });
}

export function displayDigits() {
  const zone = document.getElementById('actualCode');
  zone.innerHTML = '';
  state.trying.forEach(digit => {
    zone.insertAdjacentHTML('beforeend', `<span class="oneDigitFromTrying">${digit}</span>`);
  });
}

export function displayDirectionnal() {
  const zone = document.getElementById('actualCode');
  zone.innerHTML = '';
  state.trying.forEach(dir => {
    if (directionIcons[dir]) zone.insertAdjacentHTML('beforeend', directionIcons[dir]);
  });
}
