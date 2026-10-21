import { state } from '../core/state.js';
import { showErrorToast } from '../ui/dialogs.js';
import {
  insertColorLock, insertDigitLock, insertDirectionnalLock, insertFuseLock,
  displayColors, displayDigits, displayDirectionnal
} from './buttonLocks.js';
import { insertPasswordLock, insertLoginLock, insertDateLock, dateInputValueToFrench } from './textLocks.js';
import { insertSlidersLock, slidersResponseCode } from './slidersLock.js';
import { insertDiagramLock } from './diagramLock.js';
import { insertSelector } from './selectorLock.js';
import { insertSonoMeter } from './sonoMeterLock.js';
import { toggleOnIcon, toggleOffIcon } from '../ui/icons.js';

export function renderLock(step, callbacks) {
  state.trying = [];
  switch (step.lockType) {
    case 'color': return insertColorLock();
    case 'digit': return insertDigitLock();
    case 'directionnal': return insertDirectionnalLock();
    case 'fuse': return insertFuseLock();
    case 'date': return insertDateLock();
    case 'password': return insertPasswordLock();
    case 'diagram': return insertDiagramLock(step, callbacks);
    case 'login': return insertLoginLock();
    case 'sliders': return insertSlidersLock(step);
    case 'selector': return insertSelector(step);
    case 'sonoMeter': return insertSonoMeter(step, callbacks);
  }
}

function getResponseCode(step) {
  if (step.lockType === 'sliders') return slidersResponseCode(step);
  return step.lockCode.join();
}

function resetCodeEntry(step) {
  document.getElementById('actualCode').innerHTML = '';
  // Les curseurs (sliders) et interrupteurs (fuse) gardent leur position en cas d'erreur.
  if (step.lockType !== 'fuse' && step.lockType !== 'sliders') {
    state.trying = [];
  }
}

// Met en place, une seule fois, toute la délégation d'événements des verrous.
// handlers = { findStepById, getCurrentStep, onSolved, onFailed, onHotspotSelect }
export function wireLockInteractions(handlers) {
  document.addEventListener('click', (event) => {
    const colorBtn = event.target.closest('.colorButton');
    if (colorBtn) {
      state.trying.push(colorBtn.dataset.color);
      displayColors();
      return;
    }
    const digitBtn = event.target.closest('.digitButton');
    if (digitBtn) {
      state.trying.push(digitBtn.dataset.digitvalue);
      displayDigits();
      return;
    }
    const orientationBtn = event.target.closest('.orientationButton');
    if (orientationBtn) {
      state.trying.push(orientationBtn.dataset.orientation);
      displayDirectionnal();
      return;
    }
    const switchBtn = event.target.closest('.switch');
    if (switchBtn) {
      const position = Number(switchBtn.dataset.index);
      const value = switchBtn.dataset.check === 'true';
      switchBtn.innerHTML = value ? toggleOffIcon : toggleOnIcon;
      state.trying[position] = !value;
      switchBtn.dataset.check = String(!value);
      return;
    }
    if (event.target.closest('#resetSwitch')) {
      state.trying = new Array(16).fill(false);
      document.querySelectorAll('.switch').forEach(btn => {
        btn.dataset.check = 'false';
        btn.innerHTML = toggleOffIcon;
      });
      return;
    }
    if (event.target.closest('#reset')) {
      state.trying = [];
      document.getElementById('actualCode').innerHTML = '';
      return;
    }
    if (event.target.closest('#sendSoluce')) {
      const step = handlers.findStepById(handlers.getCurrentStep());
      if (!step) return;
      const tryingCode = state.trying.join();
      if (tryingCode === getResponseCode(step)) {
        handlers.onSolved(step);
      } else {
        showErrorToast();
        resetCodeEntry(step);
      }
      return;
    }
    if (event.target.closest('#passwordSendSoluce')) {
      const step = handlers.findStepById(handlers.getCurrentStep());
      if (!step) return;
      const value = document.getElementById('passwordInput').value.trim();
      if (value === step.lockCode) {
        handlers.onSolved(step);
      } else {
        showErrorToast();
      }
      return;
    }
    if (event.target.closest('#loginSendSoluce')) {
      const step = handlers.findStepById(handlers.getCurrentStep());
      if (!step) return;
      const login = document.getElementById('loginInput').value;
      const password = document.getElementById('loginPasswordInput').value;
      if ([login, password].join() === step.lockCode.join()) {
        handlers.onSolved(step);
      } else {
        showErrorToast();
      }
      return;
    }
    if (event.target.closest('#dateSoluce')) {
      const step = handlers.findStepById(handlers.getCurrentStep());
      if (!step) return;
      const value = dateInputValueToFrench(document.getElementById('datepicker').value);
      if (value === step.lockCode) {
        handlers.onSolved(step);
      } else {
        showErrorToast();
      }
      return;
    }
    const hotspot = event.target.closest('.hotspotButton');
    if (hotspot) {
      handlers.onHotspotSelect(Number(hotspot.dataset.value));
    }
  });

  document.addEventListener('input', (event) => {
    if (!event.target.classList.contains('multi-range')) return;
    const index = Number(event.target.dataset.index);
    const value = event.target.value;
    document.getElementById('result' + index).textContent = value;
    state.trying[index] = parseInt(value, 10);
  });
}
