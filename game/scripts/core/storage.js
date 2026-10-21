// Wrapper unique autour de localStorage : centralise les clés utilisées
// et évite les incohérences (ex. persister la mauvaise variable).
export function getItem(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function setItem(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function clearAll() {
  localStorage.clear();
}

export const KEYS = {
  SCENARIO: 'scenario',
  HISTORY: 'storageHistory',
  LOCATIONS_OPENED: 'locationsOpenedHistory',
  STEPS_REPLACED: 'stepsReplaced',
  STEPS_REPLACED_BY: 'stepsReplacedBy',
  CURRENT_STEP: 'currentStep',
  ACTUAL_LOCATIONS: 'actualLocations',
  ACTUAL_OBJECTS: 'actualObjects',
  HINTS_COUNT: 'hintsCount',
  START_TIME: 'startTime',
  PROGRESS_BAR_VALUE: 'progressBarValue',
  STEPS_IN_PROGRESS_BAR: 'stepsInProgressBar',
  MAIL_SENDED: 'mailSended',
  GAME_FINISHED: 'gameFinished',
  SCORE: 'score',
  GROUP_NAME: 'groupName',
  GROUP_MAIL: 'groupMail',
  BACKEND_TEAM_ID: 'backendTeamId',
  BACKEND_TEAM_TOKEN: 'backendTeamToken',
  BACKEND_SESSION_CODE: 'backendSessionCode',
  BACKEND_TEAM_NAME: 'backendTeamName',
  BACKEND_EVENT_QUEUE: 'backendEventQueue',
  // Dernier statut de session connu (+ infos de pause) : mis en cache pour
  // verrouiller l'app immédiatement au chargement, avant même que le flux
  // temps réel ait pu confirmer l'état actuel (évite une fenêtre où une
  // session clôturée/en pause resterait jouable le temps de la connexion).
  SESSION_STATUS: 'sessionStatus',
  SESSION_PAUSE_MESSAGE: 'sessionPauseMessage',
  SESSION_PAUSED_AT: 'sessionPausedAt',
  SESSION_TOTAL_PAUSED_MS: 'sessionTotalPausedMs',
  // Réglages du scénario propres à cette session (indices, minuteur,
  // chat...), reçus une fois en rejoignant la session et réappliqués à
  // chaque chargement par-dessus le scenario.json par défaut.
  SESSION_SETTINGS_OVERRIDE: 'sessionSettingsOverride'
};
