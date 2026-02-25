use chrono::Utc;
use uuid::Uuid;

use super::ordering::POSITION_GAP;

/// Seed the starter template (General + Voice categories with default channels).
/// Only seeds if no categories exist yet (idempotent guard).
pub fn seed_starter_template(conn: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let now = Utc::now().to_rfc3339();

    // General category (position 1000)
    let general_cat_id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO categories (id, name, position, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![general_cat_id, "General", POSITION_GAP, now],
    )?;

    // #general text channel (position 1000)
    let general_ch_id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, topic, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![general_ch_id, "general", "text", general_cat_id, POSITION_GAP, "", now],
    )?;

    // #introductions text channel (position 2000)
    let intro_ch_id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, topic, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![intro_ch_id, "introductions", "text", general_cat_id, POSITION_GAP * 2, "", now],
    )?;

    // Voice category (position 2000)
    let voice_cat_id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO categories (id, name, position, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![voice_cat_id, "Voice", POSITION_GAP * 2, now],
    )?;

    // General voice channel (position 1000)
    let voice_ch_id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO channels (id, name, channel_type, category_id, position, topic, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![voice_ch_id, "General", "voice", voice_cat_id, POSITION_GAP, "", now],
    )?;

    Ok(())
}
