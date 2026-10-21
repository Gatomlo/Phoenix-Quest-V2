# Les Enquêtes du Phoenix — jeu + backend d'administration

## Objectif
Escape game numérique (PWA joueur) + tableau de bord animateur : sessions, suivi des équipes en direct, chat, classement, éditeur de scénarios, guide de solution. Un seul process Node sert le tout.

## Stack
Node >= 22.5 (`node:sqlite` intégré, pas de dépendance native), Express 4, SQLite (`data/game.db`, WAL), JS vanilla en modules ES côté navigateur, Bootstrap côté jeu. Pas de build.

## Architecture
- `src/server.js` : jeu à `/`, admin sous `/admin`, API sous `/api` (publique) et `/api/admin` (cookie de session admin). Exporte l'app si importé (passerelle), écoute si lancé seul.
- `src/routes/publicRoutes.js` (joueurs : join/reprise, events/heartbeat, chat, classements), `adminRoutes.js` (sessions, équipes, QR de transfert, sauvegardes), `scenarioAdminRoutes.js` (édition scénarios, guide, images, QR d'étape).
- `src/scenarios.js` lit/écrit `game/scenarios/<code>/` (surchargeable via `SCENARIOS_DIR`).
- `game/` : app joueur (PWA, `service-worker.js`, `scripts/core|ui|locks|qr`). `public/` : pages admin (servies sous `/admin`).
- Variante passerelle : branche `gateway` du dépôt (copie locale : `phoenix-admin-backend-gateway/`). Les correctifs communs doivent être reportés dans les deux branches.

## Modèle de données non évident
- `teams.local_state` : copie JSON du localStorage de jeu (envoyée par le heartbeat toutes les 20 s) pour reprendre sur un autre téléphone ; vidée à la clôture de session.
- `scenario_saves` : sauvegardes nommées d'une progression, par scénario, jamais effacées automatiquement.
- Heartbeat = événement `type: 'heartbeat'` (met à jour `last_seen_at`, filtré de l'historique admin).
- Reprise d'équipe : `GET /api/teams/resume?token=` (QR admin) ou `/join` avec le même nom d'équipe.

## Commandes
- Lancer : `npm start` (port 4000, `PORT` surchargeable). Mot de passe admin : `npm run set-password -- "mdp"`.
- Test : par API (fetch/curl) puis navigateur ; pas de suite de tests automatisés.
- Déploiement Infomaniak : zip sans `node_modules` ni `data/*.db` (build `npm install`, start `npm start`, Node >= 22.5). Ne jamais écraser `data/`. Redémarrer Node si `src/` change (modules chargés une fois). Générer le zip avec adm-zip (PowerShell `Compress-Archive` écrit des `\` dans les chemins).

## Dépôt
https://github.com/Gatomlo/Phoenix-Quest-V2 (public). Branche `main` = site autonome ; branche `gateway` = variante pour node-gateway (`apps/mystere`). Sur le serveur : `git pull` puis redémarrer Node ; `data/`, `node_modules/` et `.env` sont ignorés (jamais écrasés).

## Pièges connus
- Service worker : incrémenter `APP_VERSION` à chaque changement de `game/` ; `/api` et `/admin` ne doivent jamais passer par le cache. Vider SW + caches avant de tester un correctif en local.
- `window.prompt()/alert()` sont bloqués sur certains mobiles : utiliser les modales maison (`confirmAction`, `promptAction`).
- Éviter les chemins absolus `/…` dans HTML/JS (montage sous préfixe).

## Méthode
Réponses en français et concises ; diagnostiquer par mesure (taille réelle, requêtes réseau) avant de corriger ; tester à 360 px de large.
