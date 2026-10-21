import { state } from './state.js';
import { getItem, setItem, KEYS } from './storage.js';
import { displayTime } from '../ui/render.js';

export function computeScore(duration, hintsCount, progressBarValue) {
  const baseFactor = 10000;
  const logTime = Math.log10(duration + 10);
  const progressFactor = progressBarValue / 100;
  const hintPenalty = 1 / (1 + Math.exp(0.5 * (hintsCount - 5)));
  const score = (baseFactor / logTime) * progressFactor * hintPenalty;
  return Math.min(score, 100000);
}

// onTimeEnd(elapsedOrTotalDuration) / onGameEnd(elapsedTime) : callbacks métier
// (affichage, score, envoi de mail) déclenchés par game.js.
export function startTimer({ onTimeEnd, onGameEnd }) {
  if (!state.dataJsonGlobal.timer) return;
  state.timerIsOn = true;
  const stored = getItem(KEYS.START_TIME, null);
  state.startTime = stored ? new Date(stored) : new Date();
  if (!stored) setItem(KEYS.START_TIME, state.startTime.toISOString());

  const mode = state.dataJsonGlobal.timerType;
  const totalDuration = state.dataJsonGlobal.timerParam || 0;

  state.timerInterval = setInterval(() => {
    const now = new Date();
    // Toute pause admin (en cours ou déjà terminée) est déduite du temps
    // écoulé : le minuteur, le décompte ET la fin-à-heure-fixe partagent
    // tous ce même calcul, donc aucun des trois types de scénario n'est
    // pénalisé par le temps de pause.
    const ongoingPauseMs = state.pausedAt ? now - new Date(state.pausedAt) : 0;
    const pausedMs = state.totalPausedMs + ongoingPauseMs;
    const elapsedTime = Math.max(0, now - state.startTime - pausedMs);
    let timeToDisplay;

    if (mode === 'endHour') {
      const [h, m, s = '0'] = state.dataJsonGlobal.timerParam.split(':');
      const endTime = new Date(now);
      endTime.setHours(parseInt(h, 10));
      endTime.setMinutes(parseInt(m, 10));
      endTime.setSeconds(parseInt(s, 10));
      timeToDisplay = elapsedTime;
      if (now >= endTime) {
        clearInterval(state.timerInterval);
        onTimeEnd(elapsedTime);
        return;
      }
    } else if (mode === 'countdown') {
      timeToDisplay = totalDuration - elapsedTime;
      if (elapsedTime >= totalDuration) {
        clearInterval(state.timerInterval);
        onTimeEnd(totalDuration);
        return;
      }
    } else {
      timeToDisplay = elapsedTime;
    }

    if (state.currentStep == state.dataJsonGlobal.lastStepId && !state.gameFinished) {
      clearInterval(state.timerInterval);
      onGameEnd(elapsedTime);
      return;
    }
    displayTime(timeToDisplay);
  }, 1000);
}
