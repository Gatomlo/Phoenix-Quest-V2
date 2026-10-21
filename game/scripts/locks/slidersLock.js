import { state } from '../core/state.js';
import { keyIcon } from '../ui/icons.js';

export function insertSlidersLock(step) {
  const container = document.getElementById('contentImg');
  container.innerHTML = '';
  step.lockCode.forEach((entry, index) => {
    const [label] = entry;
    state.trying[index] = 0;
    container.insertAdjacentHTML('beforeend',
      `<div class="row slidersRow align-items-center mb-1">` +
      `<label for="slider${index}" class="col-auto form-label">${label}</label>` +
      `<div class="col-auto result" id="result${index}">0</div></div>` +
      `<div class="row mb-3"><input value="0" min="0" max="200" type="range" data-index="${index}" id="slider${index}" class="form-range multi-range col"></div>`);
  });
  container.insertAdjacentHTML('beforeend',
    `<button id="sendSoluce" class="btn btn-success" type="button">${keyIcon}</button>`);
}

export function slidersResponseCode(step) {
  return step.lockCode.map(entry => entry[1]).join();
}
