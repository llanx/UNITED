use base64::Engine;
use hmac::{Hmac, Mac};
use sha1::Sha1;

use crate::config::TurnConfig;
use crate::proto::voice_proto::IceServer;

type HmacSha1 = Hmac<Sha1>;

/// Generate time-limited TURN credentials using HMAC-SHA1 shared secret mechanism.
///
/// This is the standard coturn/RFC 5389 time-limited credential mechanism:
/// - username = "{expiry_timestamp}:{user_id}"
/// - credential = base64(HMAC-SHA1(shared_secret, username))
///
/// The TURN server independently computes the same HMAC to verify credentials.
pub fn generate_turn_credentials(
    username: &str,
    shared_secret: &str,
    ttl_secs: u64,
) -> (String, String) {
    let timestamp = chrono::Utc::now().timestamp() as u64 + ttl_secs;
    let turn_username = format!("{}:{}", timestamp, username);

    let mut mac =
        HmacSha1::new_from_slice(shared_secret.as_bytes()).expect("HMAC accepts any key length");
    mac.update(turn_username.as_bytes());
    let credential = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());

    (turn_username, credential)
}

/// Build the list of ICE servers (STUN + TURN) for a voice join response.
///
/// Always includes a STUN server for NAT type detection.
/// If TURN is configured and enabled, includes TURN servers with time-limited credentials.
pub fn get_ice_servers(turn_config: &Option<TurnConfig>, user_id: &str) -> Vec<IceServer> {
    let mut servers = vec![
        // Public STUN server (fallback for NAT type detection)
        IceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            username: String::new(),
            credential: String::new(),
        },
    ];

    if let Some(cfg) = turn_config {
        if cfg.enabled && !cfg.shared_secret.is_empty() {
            let (turn_username, credential) =
                generate_turn_credentials(user_id, &cfg.shared_secret, cfg.credential_ttl_secs);

            servers.push(IceServer {
                urls: vec![
                    format!("turn:{}:{}?transport=udp", cfg.host, cfg.port),
                    format!("turn:{}:{}?transport=tcp", cfg.host, cfg.port),
                ],
                username: turn_username,
                credential,
            });
        }
    }

    servers
}
