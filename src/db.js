const path = require('path');
const fs = require('fs');
// SQLite via le module intégré à Node (>= 22.5) : mêmes garanties que
// better-sqlite3 (API synchrone, transactions, un seul fichier .db), sans
// dépendance native à compiler (better-sqlite3 exige Visual Studio Build
// Tools sous Windows pour compiler son binding, absent par défaut).
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'game.db'));

// WAL : les lectures (tableau de bord, classement) ne bloquent pas les
// écritures concurrentes de plusieurs équipes qui scannent au même moment.
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    scenario_code TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    pause_message TEXT,
    paused_at TEXT,
    total_paused_ms INTEGER NOT NULL DEFAULT 0,
    settings_override TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    current_step_id TEXT,
    progress_percent REAL NOT NULL DEFAULT 0,
    hints_used INTEGER NOT NULL DEFAULT 0,
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    score REAL,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    finished_at TEXT,
    outcome TEXT,
    last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  -- Sauvegardes nommées d'un état de jeu (copie de teams.local_state),
  -- indépendantes de la durée de vie d'une équipe ou d'une session : ne sont
  -- jamais effacées automatiquement (contrairement à teams.local_state, vidé
  -- à la clôture de la session), pour rejouer un point précis d'un scénario
  -- sans devoir tout reparcourir à chaque test.
  CREATE TABLE IF NOT EXISTS scenario_saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_code TEXT NOT NULL,
    name TEXT NOT NULL,
    local_state TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE INDEX IF NOT EXISTS idx_teams_session ON teams(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_team ON events(team_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_team ON messages(team_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_scenario_saves_scenario ON scenario_saves(scenario_code, created_at);
`);

// Migration : ajoute "outcome" (issue de la partie : "completed" / "timeout")
// aux bases créées avant son introduction — SQLite n'a pas de
// "ADD COLUMN IF NOT EXISTS".
const teamColumns = db.prepare('PRAGMA table_info(teams)').all().map((c) => c.name);
if (!teamColumns.includes('outcome')) {
  db.exec('ALTER TABLE teams ADD COLUMN outcome TEXT');
}

// Migration : colonnes de mise en pause d'une session (message affiché aux
// équipes, horodatage du début de la pause en cours, cumul du temps déjà
// passé en pause — sert à ne pas pénaliser le chrono des équipes).
const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
if (!sessionColumns.includes('pause_message')) {
  db.exec('ALTER TABLE sessions ADD COLUMN pause_message TEXT');
}
if (!sessionColumns.includes('paused_at')) {
  db.exec('ALTER TABLE sessions ADD COLUMN paused_at TEXT');
}
if (!sessionColumns.includes('total_paused_ms')) {
  db.exec('ALTER TABLE sessions ADD COLUMN total_paused_ms INTEGER NOT NULL DEFAULT 0');
}
if (!sessionColumns.includes('settings_override')) {
  db.exec('ALTER TABLE sessions ADD COLUMN settings_override TEXT');
}

// Migration : état de jeu détaillé d'une équipe (copie du localStorage
// pertinent), pour permettre de reprendre à l'identique sur un autre
// téléphone. Effacé à la clôture de la session (voir adminRoutes.js) : plus
// utile passé ce point, pas de raison de le garder en base.
if (!teamColumns.includes('local_state')) {
  db.exec('ALTER TABLE teams ADD COLUMN local_state TEXT');
}

module.exports = db;
