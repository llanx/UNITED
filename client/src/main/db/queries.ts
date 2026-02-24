import { getDb } from './schema'

// ============================================================
// Row types
// ============================================================

export interface IdentityRow {
  id: number
  fingerprint: string
  public_key: Buffer
  encrypted_private_key: Buffer
  salt: Buffer
  nonce: Buffer
  argon2_m_cost: number
  argon2_t_cost: number
  argon2_p_cost: number
  created_at: string
}

export interface ServerRow {
  id: string
  url: string
  name: string
  description: string
  icon_data: Buffer | null
  registration_mode: string
  last_connected: string | null
  display_name: string | null
  user_id: string | null
  created_at: string
}

export interface ChannelRow {
  id: string
  server_id: string
  name: string
  category: string | null
  position: number
}

// ============================================================
// Identity queries
// ============================================================

export function getIdentity(): IdentityRow | null {
  return getDb().prepare('SELECT * FROM local_identity WHERE id = 1').get() as IdentityRow | undefined ?? null
}

export function saveIdentity(row: Omit<IdentityRow, 'id' | 'created_at'>): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO local_identity
      (id, fingerprint, public_key, encrypted_private_key, salt, nonce,
       argon2_m_cost, argon2_t_cost, argon2_p_cost)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.fingerprint, row.public_key, row.encrypted_private_key,
    row.salt, row.nonce,
    row.argon2_m_cost, row.argon2_t_cost, row.argon2_p_cost
  )
}

export function hasIdentity(): boolean {
  const row = getDb().prepare('SELECT 1 FROM local_identity WHERE id = 1').get()
  return row !== undefined
}

// ============================================================
// Server queries
// ============================================================

export function getServer(id: string): ServerRow | null {
  return getDb().prepare('SELECT * FROM servers WHERE id = ?').get(id) as ServerRow | undefined ?? null
}

export function getServerByUrl(url: string): ServerRow | null {
  return getDb().prepare('SELECT * FROM servers WHERE url = ?').get(url) as ServerRow | undefined ?? null
}

export function upsertServer(row: Omit<ServerRow, 'created_at'>): void {
  getDb().prepare(`
    INSERT INTO servers (id, url, name, description, icon_data, registration_mode, last_connected, display_name, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      url = excluded.url,
      name = excluded.name,
      description = excluded.description,
      icon_data = excluded.icon_data,
      registration_mode = excluded.registration_mode,
      last_connected = excluded.last_connected,
      display_name = excluded.display_name,
      user_id = excluded.user_id
  `).run(
    row.id, row.url, row.name, row.description, row.icon_data,
    row.registration_mode, row.last_connected, row.display_name, row.user_id
  )
}

export function getActiveServer(): ServerRow | null {
  const state = getCachedState<string>('active_server_id')
  if (!state) return null
  return getServer(state)
}

// ============================================================
// Channel queries
// ============================================================

export function getChannels(serverId: string): ChannelRow[] {
  return getDb().prepare(
    'SELECT * FROM channels WHERE server_id = ? ORDER BY position'
  ).all(serverId) as ChannelRow[]
}

export function saveChannels(serverId: string, channels: Omit<ChannelRow, 'server_id'>[]): void {
  const db = getDb()
  const deleteStmt = db.prepare('DELETE FROM channels WHERE server_id = ?')
  const insertStmt = db.prepare(
    'INSERT INTO channels (id, server_id, name, category, position) VALUES (?, ?, ?, ?, ?)'
  )

  db.transaction(() => {
    deleteStmt.run(serverId)
    for (const ch of channels) {
      insertStmt.run(ch.id, serverId, ch.name, ch.category, ch.position)
    }
  })()
}

// ============================================================
// Cached state queries (generic key-value)
// ============================================================

export function getCachedState<T>(key: string): T | null {
  const row = getDb().prepare(
    'SELECT value FROM cached_state WHERE key = ?'
  ).get(key) as { value: string } | undefined

  if (!row) return null
  return JSON.parse(row.value) as T
}

export function setCachedState(key: string, value: unknown): void {
  getDb().prepare(`
    INSERT INTO cached_state (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value))
}
