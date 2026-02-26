//! Background retention cleanup task for expired blocks.
//!
//! Spawns a tokio task that periodically scans for and deletes blocks
//! whose `expires_at` timestamp has passed.

use crate::blocks::store;
use crate::db::DbPool;

/// Spawn a background task that periodically purges expired blocks.
///
/// Runs `delete_expired_blocks` every `interval_secs` seconds (default 3600 = 1 hour).
/// Logs the number of purged blocks each cycle.
pub fn spawn_retention_cleanup(db: DbPool, data_dir: String, interval_secs: u64) {
    let interval = std::time::Duration::from_secs(interval_secs);

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(interval).await;

            let db_clone = db.clone();
            let dir_clone = data_dir.clone();

            match tokio::task::spawn_blocking(move || {
                store::delete_expired_blocks(&db_clone, &dir_clone)
            })
            .await
            {
                Ok(Ok(count)) => {
                    if count > 0 {
                        tracing::info!("Block retention cleanup: purged {} expired blocks", count);
                    } else {
                        tracing::debug!("Block retention cleanup: no expired blocks");
                    }
                }
                Ok(Err(e)) => {
                    tracing::error!("Block retention cleanup error: {}", e);
                }
                Err(e) => {
                    tracing::error!("Block retention cleanup task join error: {}", e);
                }
            }
        }
    });
}
