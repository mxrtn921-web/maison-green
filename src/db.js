// Accès base de données — SQLite intégré à Node (node:sqlite).
// Toute la persistance passe par ce module : pour migrer vers PostgreSQL,
// seules ces fonctions (one / all / run / tx) sont à réécrire.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(path.join(ROOT, 'src', 'schema.sql'), 'utf8'));

// Migrations légères : colonnes ajoutées après la mise en ligne.
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
for (const [table, col, def] of [['push_subscriptions', 'p256dh', "TEXT NOT NULL DEFAULT ''"], ['push_subscriptions', 'auth', "TEXT NOT NULL DEFAULT ''"],
  ['categories', 'age_restricted', 'INTEGER NOT NULL DEFAULT 0'], ['categories', 'legal_notice', "TEXT NOT NULL DEFAULT ''"],
  ['orders', 'age_check', 'INTEGER NOT NULL DEFAULT 0']]) {
  if (!hasColumn(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

const cache = new Map();
function stmt(sql) {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
}
const plain = (row) => (row ? { ...row } : undefined);

export const one = (sql, ...params) => plain(stmt(sql).get(...params));
export const all = (sql, ...params) => stmt(sql).all(...params).map(plain);
export const run = (sql, ...params) => stmt(sql).run(...params);

/** Copie cohérente de toute la base dans un fichier (sauvegarde à chaud, sans arrêter le site). */
export function backupTo(file) {
  db.exec(`VACUUM INTO '${String(file).replace(/'/g, "''")}'`);
}

let depth = 0;
/** Exécute fn dans une transaction (verrou d'écriture immédiat). */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export const nowIso = () => new Date().toISOString();

// Paramètres clé/valeur (JSON)
export function getSetting(key, fallback = null) {
  const row = one('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
export function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}
