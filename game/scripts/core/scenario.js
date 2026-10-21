export async function fetchScenario(code) {
  const response = await fetch(`scenarios/${code}/scenario.json`);
  if (!response.ok) throw new Error('Scénario introuvable: ' + code);
  return response.json();
}

const THEME_VARS = {
  color1: '--color1',
  color2: '--color2',
  color3: '--color3',
  titleColor: '--title-color'
};

// Pose les couleurs du scénario comme variables CSS sur :root (voir css/main.css).
// Réinitialise d'abord les variables pour éviter qu'un thème précédent ne
// persiste quand on change de scénario sans recharger la page.
export function applyTheme(data) {
  const root = document.documentElement.style;
  Object.values(THEME_VARS).forEach(cssVar => root.removeProperty(cssVar));
  Object.entries(THEME_VARS).forEach(([field, cssVar]) => {
    if (data[field] != null) root.setProperty(cssVar, data[field]);
  });
}

export function computeProgressBarStepValue(data) {
  if (!data.progressBar) return 0;
  return data.steps.filter(step => step.progressBar).length;
}

const IMG_SRC_PATTERN = /src=["']([^"']+\.(?:png|jpe?g|gif|svg|webp))["']/gi;

function collectInlineImageUrls(text) {
  if (typeof text !== 'string') return [];
  const urls = [];
  let match;
  IMG_SRC_PATTERN.lastIndex = 0;
  while ((match = IMG_SRC_PATTERN.exec(text)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

// Rassemble toutes les images d'un scénario (celles déclarées explicitement
// dans le JSON + celles glissées en HTML dans les descriptions/indices).
function collectScenarioAssetUrls(code, data) {
  const urls = new Set([`scenarios/${code}/scenario.json`]);
  const addImg = (fileName) => {
    if (!fileName) return;
    urls.add(/^https?:|^scenarios\//i.test(fileName) ? fileName : `scenarios/${code}/img/${fileName}`);
  };

  addImg(data.mediaRules);
  addImg(data.logo);
  addImg(data.fav);
  if (data.map) addImg(data.mapMedia || 'map.png');

  (data.steps || []).forEach((step) => {
    addImg(step.media);
    collectInlineImageUrls(step.description).forEach((u) => urls.add(u));
    collectInlineImageUrls(step.hint).forEach((u) => urls.add(u));
  });

  return [...urls];
}

// Télécharge et met en cache (Cache Storage) tous les assets d'un scénario
// pour qu'il reste jouable hors-ligne une fois chargé une première fois.
// Non-bloquant pour le démarrage du jeu : les échecs (hors-ligne, image
// manquante) sont silencieux, un simple avertissement en console.
export async function cacheScenarioAssets(code, data) {
  if (!('caches' in window)) return;
  const urls = collectScenarioAssetUrls(code, data);
  try {
    const cache = await caches.open(`phoenix-scenario-${code}`);
    await Promise.all(urls.map((url) =>
      cache.add(url).catch((err) => console.warn('Mise en cache hors-ligne impossible pour', url, err))
    ));
  } catch (err) {
    console.warn('Mise en cache du scénario impossible (hors-ligne ?)', err);
  }
}
