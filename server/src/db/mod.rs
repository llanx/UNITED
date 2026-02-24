pub mod migrations;
pub mod models;

use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Type alias for the shared database connection.
/// rusqlite is synchronous — we wrap in Arc<Mutex> for thread safety
/// with tokio::task::spawn_blocking for DB operations.
pub type DbPool = Arc<Mutex<Connection>>;

/// Initialize the SQLite database: create data directory if needed,
/// open (or create) the database file, enable WAL mode, and run migrations.
pub fn init_db(data_dir: &str) -> Result<DbPool, Box<dyn std::error::Error>> {
    // Ensure data directory exists
    std::fs::create_dir_all(data_dir)?;

    let db_path = Path::new(data_dir).join("united.db");
    let mut conn = Connection::open(&db_path)?;

    // Enable WAL mode for better concurrent read performance
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // Enable foreign key enforcement
    conn.pragma_update(None, "foreign_keys", "ON")?;

    // Run migrations
    let migrations = migrations::migrations();
    migrations.to_latest(&mut conn)?;

    tracing::info!("Database initialized at {}", db_path.display());

    Ok(Arc::new(Mutex::new(conn)))
}
