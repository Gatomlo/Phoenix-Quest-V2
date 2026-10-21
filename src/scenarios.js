// Lit et écrit les scénarios depuis le dossier du jeu, servi statiquement
// par ce même backend (voir server.js). Chemin surchargeable via
// SCENARIOS_DIR si besoin d'un emplacement différent en prod.
const fs = require('fs');
const path = require('path');

const SCENARIOS_DIR = process.env.SCENARIOS_DIR
  || path.join(__dirname, '..', 'game', 'scenarios');

function isSafeCode(code) {
  return typeof code === 'string' && /^[a-zA-Z0-9_-]+$/.test(code);
}

// Un nom de fichier image ne doit pas pouvoir sortir du dossier img/ du
// scénario (pas de "..", pas de séparateur de chemin).
function isSafeFilename(name) {
  return typeof name === 'string' && name.length > 0 && !name.includes('/') && !name.includes('\\') && !name.includes('..');
}

function scenarioDir(code) {
  return path.join(SCENARIOS_DIR, code);
}

function scenarioImgDir(code) {
  return path.join(scenarioDir(code), 'img');
}

function listScenarios() {
  let entries;
  try {
    entries = fs.readdirSync(SCENARIOS_DIR, { withFileTypes: true });
  } catch (err) {
    console.warn('Impossible de lire SCENARIOS_DIR (' + SCENARIOS_DIR + ') :', err.message);
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const jsonPath = path.join(SCENARIOS_DIR, entry.name, 'scenario.json');
      try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        return { code: entry.name, name: data.nameStory || entry.name };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function scenarioExists(code) {
  if (!isSafeCode(code)) return false;
  return fs.existsSync(path.join(scenarioDir(code), 'scenario.json'));
}

function getScenario(code) {
  if (!isSafeCode(code)) return null;
  const jsonPath = path.join(SCENARIOS_DIR, code, 'scenario.json');
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

// Crée un nouveau scénario (dossier + img/ + scenario.json minimal). Échoue
// si le code est invalide ou déjà pris, pour ne jamais écraser un scénario
// existant par accident.
function createScenario(code, data) {
  if (!isSafeCode(code)) throw new Error('Code de scénario invalide (lettres, chiffres, - et _ uniquement)');
  if (scenarioExists(code)) throw new Error('Un scénario avec ce code existe déjà');
  fs.mkdirSync(scenarioImgDir(code), { recursive: true });
  fs.writeFileSync(path.join(scenarioDir(code), 'scenario.json'), JSON.stringify(data, null, 2), 'utf-8');
}

// Écrase le scenario.json d'un scénario existant.
function saveScenario(code, data) {
  if (!scenarioExists(code)) throw new Error('Scénario introuvable');
  fs.writeFileSync(path.join(scenarioDir(code), 'scenario.json'), JSON.stringify(data, null, 2), 'utf-8');
}

// Supprime entièrement un scénario (dossier complet, images incluses).
function deleteScenario(code) {
  if (!scenarioExists(code)) throw new Error('Scénario introuvable');
  fs.rmSync(scenarioDir(code), { recursive: true, force: true });
}

function listScenarioImages(code) {
  if (!scenarioExists(code)) return [];
  try {
    return fs.readdirSync(scenarioImgDir(code), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'fr'));
  } catch {
    return [];
  }
}

function saveScenarioImage(code, filename, buffer) {
  if (!scenarioExists(code)) throw new Error('Scénario introuvable');
  if (!isSafeFilename(filename)) throw new Error('Nom de fichier invalide');
  fs.mkdirSync(scenarioImgDir(code), { recursive: true });
  fs.writeFileSync(path.join(scenarioImgDir(code), filename), buffer);
}

function deleteScenarioImage(code, filename) {
  if (!scenarioExists(code)) throw new Error('Scénario introuvable');
  if (!isSafeFilename(filename)) throw new Error('Nom de fichier invalide');
  const target = path.join(scenarioImgDir(code), filename);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

// Chemin absolu d'une image de scénario, pour la servir depuis ce backend
// admin directement plutôt que de dépendre d'un serveur statique séparé pour
// l'app joueur (qui n'est pas toujours lancé pendant qu'on utilise l'admin).
function scenarioImagePath(code, filename) {
  if (!scenarioExists(code) || !isSafeFilename(filename)) return null;
  const target = path.join(scenarioImgDir(code), filename);
  return fs.existsSync(target) ? target : null;
}

function guidePath(code) {
  return path.join(scenarioDir(code), 'guide.json');
}

// Guide de résolution (parcours choisi par l'admin + notes/localisation par
// étape) : fichier séparé de scenario.json, réservé à l'admin — l'app joueur
// ne le lit jamais.
function getGuide(code) {
  if (!scenarioExists(code)) return { entries: [] };
  try {
    return JSON.parse(fs.readFileSync(guidePath(code), 'utf-8'));
  } catch {
    return { entries: [] };
  }
}

function saveGuide(code, data) {
  if (!scenarioExists(code)) throw new Error('Scénario introuvable');
  fs.writeFileSync(guidePath(code), JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  SCENARIOS_DIR,
  isSafeCode,
  isSafeFilename,
  scenarioDir,
  scenarioImgDir,
  listScenarios,
  scenarioExists,
  getScenario,
  createScenario,
  saveScenario,
  deleteScenario,
  listScenarioImages,
  saveScenarioImage,
  deleteScenarioImage,
  scenarioImagePath,
  guidePath,
  getGuide,
  saveGuide
};
