import Database from 'better-sqlite3'

const MIGRATIONS: string[] = [
  // Migration 1: Initial schema
  `CREATE TABLE IF NOT EXISTS local_identity (
    id INTEGER PRIMARY KEY DEFAULT 1,
    fingerprint TEXT NOT NULL,
    public_key BLOB NOT NULL,
    encrypted_private_key BLOB NOT NULL,
    salt BLOB NOT NULL,
    nonce BLOB NOT NULL,
    argon2_m_cost INTEGER NOT NULL DEFAULT 262144,
    argon2_t_cost INTEGER NOT NULL DEFAULT 3,
    argon2_p_cost INTEGER NOT NULL DEFAULT 4,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    icon_data BLOB,
    registration_mode TEXT NOT NULL DEFAULT 'open',
    last_connected TEXT,
    display_name TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, server_id),
    FOREIGN KEY (server_id) REFERENCES servers(id)
  );

  CREATE TABLE IF NOT EXISTS cached_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`
]

let db: Database.Database | null = null

export function initDb(dbPath: string): Database.Database {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDb() first')
  return db
}

function runMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i])
  }

  if (currentVersion < MIGRATIONS.length) {
    db.pragma(`user_version = ${MIGRATIONS.length}`)
  }
}
