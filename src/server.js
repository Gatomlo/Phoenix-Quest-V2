const path = require('path');
// Charge un éventuel fichier .env (absent en dev local où les valeurs par
// défaut suffisent ; présent en prod si besoin de surcharger PORT).
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');

const auth = require('./auth');
const publicRoutes = require('./routes/publicRoutes');
const adminRoutes = require('./routes/adminRoutes');
const scenarioAdminRoutes = require('./routes/scenarioAdminRoutes');

auth.ensureAdminPassword();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cookieParser());
app.use(express.json());

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', scenarioAdminRoutes);

// Jeu (app joueur) à la racine et tableau de bord admin sous /admin : un
// seul process Node sert les deux, plus de second site ni de CORS entre eux
// (même origine). L'ordre compte : /admin doit être vérifié avant la racine.
app.use('/admin', express.static(path.join(__dirname, '..', 'public')));
app.use(express.static(path.join(__dirname, '..', 'game')));

// Compatible passerelle node-gateway (voir node-gateway/README.md) : monté
// via app.use('/mystere', app) par la passerelle, ce fichier doit exporter
// l'app Express plutôt que d'écouter lui-même sur un port. app.listen()
// reste appelé quand ce fichier est lancé directement (dev local, ou
// déploiement Infomaniak autonome sans passerelle).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend admin Phoenix en écoute sur http://localhost:${PORT}`);
  });
}
module.exports = app;
