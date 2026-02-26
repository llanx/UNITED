use axum::{middleware, Router};
use std::sync::Arc;
use tower_governor::key_extractor::PeerIpKeyExtractor;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

use crate::admin::settings;
use crate::auth::challenge;
use crate::auth::middleware::JwtSecret;
use crate::auth::totp;
use crate::identity::{blob, registration, rotation};
use crate::channels::crud as channel_crud;
use crate::invite::{generate as invite_gen, landing as invite_landing};
use crate::moderation::{ban, kick};
use crate::roles::{assignment as role_assignment, crud as role_crud};
use crate::state::AppState;
use crate::ws::handler as ws_handler;

/// GET /api/p2p/info — Public endpoint returning the server's P2P connection info.
/// Required by clients to construct the server's libp2p multiaddr for dialing.
async fn p2p_info(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "peer_id": state.server_peer_id,
        "multiaddr": format!(
            "/ip4/0.0.0.0/tcp/{}/ws/p2p/{}",
            state.libp2p_port,
            state.server_peer_id
        ),
        "libp2p_port": state.libp2p_port,
    }))
}

use axum::Json;

/// Inject the JWT secret into request extensions so the Claims extractor can find it.
async fn inject_jwt_secret(
    axum::extract::State(state): axum::extract::State<AppState>,
    mut req: axum::http::Request<axum::body::Body>,
    next: middleware::Next,
) -> axum::response::Response {
    req.extensions_mut()
        .insert(JwtSecret(state.jwt_secret.clone()));
    next.run(req).await
}

/// Build the full axum Router with all routes and middleware.
pub fn build_router(state: AppState) -> Router {
    // Rate limiting: 5 requests per minute per IP on auth endpoints
    // Uses PeerIpKeyExtractor which reads from ConnectInfo<SocketAddr>
    let governor_config = Arc::new(
        GovernorConfigBuilder::default()
            .key_extractor(PeerIpKeyExtractor)
            .per_second(12) // 1 token every 12 seconds = 5 per minute
            .burst_size(5)  // Allow burst of 5
            .finish()
            .expect("Failed to build governor config"),
    );
    let governor_limiter = governor_config.limiter().clone();

    // Spawn background task to clean up rate limiter state
    let limiter_for_cleanup = governor_limiter.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            limiter_for_cleanup.retain_recent();
        }
    });

    // Auth routes with rate limiting (5/min/IP per user decision)
    let auth_routes = Router::new()
        .route(
            "/api/auth/challenge",
            axum::routing::post(challenge::issue_challenge),
        )
        .route(
            "/api/auth/verify",
            axum::routing::post(challenge::verify_challenge),
        )
        .route(
            "/api/auth/register",
            axum::routing::post(registration::register),
        )
        .route(
            "/api/auth/refresh",
            axum::routing::post(challenge::refresh_tokens),
        )
        // TOTP verification during login (user not yet JWT-authenticated)
        .route(
            "/api/auth/totp/verify",
            axum::routing::post(totp::totp_verify),
        )
        .layer(GovernorLayer {
            config: governor_config,
        });

    // Rate limiting for public identity endpoints: 10 requests per minute per IP
    let identity_governor_config = Arc::new(
        GovernorConfigBuilder::default()
            .key_extractor(PeerIpKeyExtractor)
            .per_second(6) // 1 token every 6 seconds = 10 per minute
            .burst_size(10)
            .finish()
            .expect("Failed to build identity governor config"),
    );
    let identity_limiter = identity_governor_config.limiter().clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            identity_limiter.retain_recent();
        }
    });

    // Public identity routes with rate limiting
    // Blob retrieval and rotation chain are public (required for recovery / cross-server verification)
    let public_identity_routes = Router::new()
        .route(
            "/api/identity/blob/{fingerprint}",
            axum::routing::get(blob::get_blob),
        )
        .route(
            "/api/identity/rotation-chain/{fingerprint}",
            axum::routing::get(rotation::get_rotation_chain),
        )
        .layer(GovernorLayer {
            config: identity_governor_config,
        });

    // Public routes (no auth required, no rate limiting)
    let public_routes = Router::new()
        .route("/api/server/info", axum::routing::get(settings::get_server_info))
        .route("/api/p2p/info", axum::routing::get(p2p_info));

    // Authenticated routes (JWT required — Claims extractor validates token)
    let authenticated_routes = Router::new()
        // TOTP enrollment and confirmation (requires existing JWT)
        .route(
            "/api/auth/totp/enroll",
            axum::routing::post(totp::totp_enroll),
        )
        .route(
            "/api/auth/totp/confirm",
            axum::routing::post(totp::totp_confirm),
        )
        // Identity blob storage (authenticated — update own blob)
        .route(
            "/api/identity/blob",
            axum::routing::put(blob::put_blob),
        )
        // Key rotation (authenticated — rotate own key)
        .route(
            "/api/identity/rotate",
            axum::routing::post(rotation::rotate_key),
        )
        .route(
            "/api/identity/rotate/cancel",
            axum::routing::post(rotation::cancel_rotation),
        );

    // Admin routes (JWT auth required — Claims extractor validates token)
    let admin_routes = Router::new().route(
        "/api/server/settings",
        axum::routing::put(settings::update_server_settings),
    );

    // WebSocket endpoint (auth via query param, not JWT header)
    let ws_routes = Router::new().route(
        "/ws",
        axum::routing::get(ws_handler::ws_upgrade),
    );

    // Health check
    let health = Router::new().route("/health", axum::routing::get(health_check));

    // Phase 2: Channel, role, moderation, and invite route groups.
    // Note: /api/channels/reorder MUST come before /api/channels/{id} to avoid path param conflict.
    let channel_routes = Router::new()
        .route("/api/channels", axum::routing::get(channel_crud::list_channels))
        .route("/api/channels", axum::routing::post(channel_crud::create_channel))
        .route("/api/channels/reorder", axum::routing::put(channel_crud::reorder_channels))
        .route("/api/channels/{id}", axum::routing::put(channel_crud::update_channel))
        .route("/api/channels/{id}", axum::routing::delete(channel_crud::delete_channel))
        .route("/api/categories", axum::routing::post(channel_crud::create_category))
        .route("/api/categories/{id}", axum::routing::delete(channel_crud::delete_category));
    let role_routes = Router::new()
        .route("/api/members", axum::routing::get(role_assignment::list_members))
        .route("/api/roles", axum::routing::get(role_crud::list_roles))
        .route("/api/roles", axum::routing::post(role_crud::create_role))
        .route(
            "/api/roles/{id}",
            axum::routing::put(role_crud::update_role),
        )
        .route(
            "/api/roles/{id}",
            axum::routing::delete(role_crud::delete_role),
        )
        .route(
            "/api/roles/assign",
            axum::routing::post(role_assignment::assign_role),
        )
        .route(
            "/api/roles/remove",
            axum::routing::post(role_assignment::remove_role),
        )
        .route(
            "/api/roles/user/{user_id}",
            axum::routing::get(role_assignment::get_user_roles),
        );
    let moderation_routes = Router::new()
        .route("/api/moderation/kick", axum::routing::post(kick::kick_user))
        .route("/api/moderation/ban", axum::routing::post(ban::ban_user))
        .route("/api/moderation/unban", axum::routing::post(ban::unban_user))
        .route("/api/moderation/bans", axum::routing::get(ban::list_bans));
    let invite_routes = Router::new()
        .route("/api/invites", axum::routing::post(invite_gen::create_invite))
        .route("/api/invites", axum::routing::get(invite_gen::list_invites))
        .route("/api/invites/{code}", axum::routing::delete(invite_gen::delete_invite));
    // Public invite landing page (no auth required)
    let invite_landing_routes = Router::new()
        .route("/invite/{code}", axum::routing::get(invite_landing::invite_landing_page));

    Router::new()
        .merge(auth_routes)
        .merge(public_identity_routes)
        .merge(public_routes)
        .merge(authenticated_routes)
        .merge(admin_routes)
        .merge(channel_routes)
        .merge(role_routes)
        .merge(moderation_routes)
        .merge(invite_routes)
        .merge(invite_landing_routes)
        .merge(ws_routes)
        .merge(health)
        .layer(middleware::from_fn_with_state(
            state.clone(),
            inject_jwt_secret,
        ))
        .with_state(state)
}

/// Basic health check endpoint
async fn health_check() -> &'static str {
    "ok"
}
