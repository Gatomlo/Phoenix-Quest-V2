// Verrou "diagram" (schéma façon pattern Android), basé sur patternlock.js
// (scripts/patternlock.js, globale window.PatternLock chargée avant ce module).

export function insertDiagramLock(step, { onSolved, onFailed }) {
  document.getElementById('contentImg').innerHTML =
    '<svg class="patternlock" id="lock" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<g class="lock-actives"></g><g class="lock-lines"></g><g class="lock-dots">' +
    '<circle cx="20" cy="20" r="2"/><circle cx="50" cy="20" r="2"/><circle cx="80" cy="20" r="2"/>' +
    '<circle cx="20" cy="50" r="2"/><circle cx="50" cy="50" r="2"/><circle cx="80" cy="50" r="2"/>' +
    '<circle cx="20" cy="80" r="2"/><circle cx="50" cy="80" r="2"/><circle cx="80" cy="80" r="2"/>' +
    '</g></svg>';

  new PatternLock('#lock', {
    onPattern: function (result) {
      if (result.pattern === step.lockCode) {
        onSolved(step);
        return true;
      }
      onFailed();
      return false;
    }
  });
}
