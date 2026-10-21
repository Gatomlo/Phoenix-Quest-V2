// Empaquette un scénario (scenario.json + img/) en zip pour le déplacer vers
// une autre instance, et inversement dépaquette une archive reçue.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { scenarioDir, scenarioImgDir, scenarioExists, isSafeCode, guidePath } = require('./scenarios');

function exportScenarioZip(code) {
  if (!scenarioExists(code)) throw new Error('Scénario introuvable');
  const zip = new AdmZip();
  zip.addLocalFile(path.join(scenarioDir(code), 'scenario.json'));
  // Le guide de résolution est propre à l'admin (jamais lu par l'app
  // joueur) mais fait partie du "paquet" du scénario au même titre que ses
  // images : utile pour retrouver ses notes après un déplacement d'instance.
  if (fs.existsSync(guidePath(code))) {
    zip.addLocalFile(guidePath(code));
  }
  const imgDir = scenarioImgDir(code);
  if (fs.existsSync(imgDir)) {
    zip.addLocalFolder(imgDir, 'img');
  }
  return zip.toBuffer();
}

// Accepte une archive contenant un scenario.json (à la racine ou dans un
// sous-dossier, peu importe la profondeur) et un dossier img/ optionnel à
// côté. Écrit tout dans scenarios/<code>/, qui ne doit pas déjà exister.
function importScenarioZip(code, buffer) {
  if (!isSafeCode(code)) throw new Error('Code de scénario invalide (lettres, chiffres, - et _ uniquement)');
  if (scenarioExists(code)) throw new Error('Un scénario avec ce code existe déjà');

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const jsonEntry = entries.find((e) => !e.isDirectory && path.basename(e.entryName) === 'scenario.json');
  if (!jsonEntry) throw new Error('Le fichier ne contient pas de scenario.json');

  let data;
  try {
    data = JSON.parse(jsonEntry.getData().toString('utf-8'));
  } catch {
    throw new Error('scenario.json invalide dans l\'archive');
  }

  // Le dossier "img" peut être au même niveau que scenario.json, quel que
  // soit ce niveau (racine de l'archive ou sous-dossier créé par l'outil de
  // compression de l'utilisateur).
  const baseDir = path.dirname(jsonEntry.entryName);
  const imgPrefix = baseDir === '.' ? 'img/' : `${baseDir}/img/`;

  const targetDir = scenarioDir(code);
  fs.mkdirSync(path.join(targetDir, 'img'), { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'scenario.json'), JSON.stringify(data, null, 2), 'utf-8');

  const guideEntry = entries.find((e) => !e.isDirectory && path.basename(e.entryName) === 'guide.json');
  if (guideEntry) {
    try {
      const guideData = JSON.parse(guideEntry.getData().toString('utf-8'));
      fs.writeFileSync(path.join(targetDir, 'guide.json'), JSON.stringify(guideData, null, 2), 'utf-8');
    } catch {
      // guide.json corrompu dans l'archive : on ignore plutôt que de faire
      // échouer tout l'import d'un scénario par ailleurs valide.
    }
  }

  entries.forEach((entry) => {
    if (entry.isDirectory || !entry.entryName.startsWith(imgPrefix)) return;
    const relative = entry.entryName.slice(imgPrefix.length);
    if (!relative || relative.includes('/') || relative.includes('..')) return;
    fs.writeFileSync(path.join(targetDir, 'img', relative), entry.getData());
  });

  return data;
}

module.exports = { exportScenarioZip, importScenarioZip };
