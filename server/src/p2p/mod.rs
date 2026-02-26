pub mod behaviour;
pub mod config;
pub mod directory;
pub mod identity;
pub mod messages;
pub mod swarm;

// Re-export key types for convenient access
pub use config::P2pConfig;
pub use directory::PeerDirectory;
pub use swarm::{SwarmCommand, SwarmEvent};
