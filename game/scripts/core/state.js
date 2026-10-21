// État partagé du jeu (remplace les ~20 variables globales du script original).
import { getItem, setItem, KEYS } from './storage.js';

export const state = {
  history: [],
  locationsOpenedHistory: [],
  stepsReplaced: [],
  stepsReplacedBy: [],
  currentStep: null,
  trying: [],
  actualLocations: [],
  actualObjects: [],
  hintsCount: 0,
  timerIsOn: false,
  timerInterval: null,
  startTime: null,
  scenario: null,
  footerColor: '#f3ebde',
  dataJsonGlobal: null,
  progressBarStepValue: 0,
  progressBarValue: 0,
  stepsInProgressBar: [],
  mailSended: false,
  gameFinished: false,
  // Pause de session côté admin : décalent le calcul du temps écoulé du
  // minuteur (voir timer.js) pour que la durée de pause ne soit jamais
  // comptée contre l'équipe. Resynchronisés par le serveur (autoritaire, pas
  // un delta) à chaque (re)connexion au flux temps réel.
  pausedAt: null,
  totalPausedMs: 0
};

// Recharge l'état persistant depuis localStorage (appelé une fois au démarrage).
export function restoreFromStorage() {
  state.scenario = getItem(KEYS.SCENARIO, null);
  state.progressBarValue = getItem(KEYS.PROGRESS_BAR_VALUE, 0);
  state.stepsInProgressBar = getItem(KEYS.STEPS_IN_PROGRESS_BAR, []);
  state.mailSended = getItem(KEYS.MAIL_SENDED, false);
  state.gameFinished = getItem(KEYS.GAME_FINISHED, false);
  state.hintsCount = getItem(KEYS.HINTS_COUNT, 0);
  state.stepsReplacedBy = getItem(KEYS.STEPS_REPLACED_BY, []);
  state.locationsOpenedHistory = getItem(KEYS.LOCATIONS_OPENED, []);
  state.stepsReplaced = getItem(KEYS.STEPS_REPLACED, []);
  state.history = getItem(KEYS.HISTORY, []);
  state.actualObjects = getItem(KEYS.ACTUAL_OBJECTS, []);
  state.actualLocations = getItem(KEYS.ACTUAL_LOCATIONS, []);
  state.currentStep = getItem(KEYS.CURRENT_STEP, null);
}

export function persistHistory() {
  setItem(KEYS.HISTORY, state.history);
}
export function persistLocationsOpenedHistory() {
  setItem(KEYS.LOCATIONS_OPENED, state.locationsOpenedHistory);
}
export function persistStepsReplaced() {
  setItem(KEYS.STEPS_REPLACED, state.stepsReplaced);
}
export function persistStepsReplacedBy() {
  setItem(KEYS.STEPS_REPLACED_BY, state.stepsReplacedBy);
}
export function persistCurrentStep() {
  setItem(KEYS.CURRENT_STEP, state.currentStep);
}
export function persistActualLocations() {
  setItem(KEYS.ACTUAL_LOCATIONS, state.actualLocations);
}
export function persistActualObjects() {
  setItem(KEYS.ACTUAL_OBJECTS, state.actualObjects);
}
export function persistHintsCount() {
  setItem(KEYS.HINTS_COUNT, state.hintsCount);
}
export function persistProgressBar() {
  setItem(KEYS.PROGRESS_BAR_VALUE, state.progressBarValue);
  setItem(KEYS.STEPS_IN_PROGRESS_BAR, state.stepsInProgressBar);
}

// Marque un lieu/step comme "ouvert" ET l'enregistre dans l'historique général.
// Remplace le bug de l'ancien code qui persistait parfois `history` au lieu
// de `locationsOpenedHistory` après avoir modifié cette dernière.
export function markLocationOpened(id) {
  if (!state.locationsOpenedHistory.includes(id)) {
    state.locationsOpenedHistory.push(id);
    persistLocationsOpenedHistory();
  }
  markInHistory(id);
}

export function markInHistory(id) {
  if (!state.history.includes(id)) {
    state.history.push(id);
    persistHistory();
  }
}
