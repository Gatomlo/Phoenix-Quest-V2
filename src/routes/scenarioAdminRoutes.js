// Édition des scénarios (scenario.json + images) depuis le backend admin :
// création, modification étape par étape, export/import en package zip pour
// déplacer un scénario vers une autre instance.
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const auth = require('../auth');
const scenarios = require('../scenarios');
const { exportScenarioZip, importScenarioZip } = require('../scenarioPackage');

const router = express.Router();
router.use(auth.requireAdmin);

const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadPackage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/scenario-editor/scenarios', (req, res) => {
  res.json({ scenarios: scenarios.listScenarios() });
});

router.get('/scenario-editor/scenarios/:code', (req, res) => {
  const data = scenarios.getScenario(req.params.code);
  if (!data) return res.status(404).json({ error: 'Scénario introuvable' });
  res.json({ scenario: data, images: scenarios.listScenarioImages(req.params.code) });
});

router.post('/scenario-editor/scenarios', (req, res) => {
  const { code, scenario } = req.body || {};
  if (!code || !scenario) return res.status(400).json({ error: 'code et scenario requis' });
  try {
    scenarios.createScenario(code.trim(), scenario);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/scenario-editor/scenarios/:code', (req, res) => {
  const { scenario } = req.body || {};
  if (!scenario) return res.status(400).json({ error: 'scenario requis' });
  try {
    scenarios.saveScenario(req.params.code, scenario);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/scenario-editor/scenarios/:code', (req, res) => {
  try {
    scenarios.deleteScenario(req.params.code);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/scenario-editor/scenarios/:code/images', uploadImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier image requis' });
  try {
    scenarios.saveScenarioImage(req.params.code, req.file.originalname, req.file.buffer);
    res.status(201).json({ ok: true, filename: req.file.originalname });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/scenario-editor/scenarios/:code/images/:filename', (req, res) => {
  try {
    scenarios.deleteScenarioImage(req.params.code, req.params.filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sert l'image directement depuis ce backend (plutôt que de dépendre du
// serveur statique de l'app joueur, pas toujours lancé pendant qu'on utilise
// l'admin) — utilisé par tous les aperçus/miniatures des pages admin.
router.get('/scenario-editor/scenarios/:code/images/:filename', (req, res) => {
  const filePath = scenarios.scenarioImagePath(req.params.code, req.params.filename);
  if (!filePath) return res.status(404).end();
  res.sendFile(filePath);
});

router.get('/scenario-editor/scenarios/:code/export', (req, res) => {
  try {
    const buffer = exportScenarioZip(req.params.code);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${req.params.code}.zip"`
    });
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/scenario-editor/import', uploadPackage.single('package'), (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code requis' });
  if (!req.file) return res.status(400).json({ error: 'Fichier .zip requis' });
  try {
    const data = importScenarioZip(code.trim(), req.file.buffer);
    res.status(201).json({ ok: true, scenario: data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Guide de résolution : parcours d'étapes choisi par l'admin + notes et
// localisation du QR par étape. Fichier séparé de scenario.json (voir
// scenarios.js), jamais lu par l'app joueur.
router.get('/scenario-editor/scenarios/:code/guide', (req, res) => {
  if (!scenarios.scenarioExists(req.params.code)) return res.status(404).json({ error: 'Scénario introuvable' });
  res.json(scenarios.getGuide(req.params.code));
});

router.put('/scenario-editor/scenarios/:code/guide', (req, res) => {
  const { entries } = req.body || {};
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries (tableau) requis' });
  try {
    scenarios.saveGuide(req.params.code, { entries });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Génère l'image du QR code d'une étape (le texte encodé est exactement
// step.code, comparé tel quel par le scanner de l'app joueur). Généré
// côté serveur (lib `qrcode`, pas de build en JS pur/CDN pour le PWA
// joueur : ici c'est uniquement pour l'admin, une simple <img> suffit).
router.get('/scenario-editor/qrcode', async (req, res) => {
  const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Paramètre text requis' });
  try {
    const buffer = await QRCode.toBuffer(text, { type: 'png', width: 400, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
