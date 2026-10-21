// Reprend exactement la formule du front (scripts/core/timer.js,
// computeScore) pour rester cohérent avec le score déjà affiché au joueur
// en fin de partie. Utilisé en repli si l'app ne transmet pas de score.
function computeScore(durationMs, hintsUsed, progressPercent) {
  const baseFactor = 10000;
  const logTime = Math.log10(durationMs + 10);
  const progressFactor = progressPercent / 100;
  const hintPenalty = 1 / (1 + Math.exp(0.5 * (hintsUsed - 5)));
  const score = (baseFactor / logTime) * progressFactor * hintPenalty;
  return Math.min(score, 100000);
}

module.exports = { computeScore };
