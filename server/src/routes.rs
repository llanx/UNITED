use axum::{middleware, Router};
use std::sync::Arc;
use tower_governor::key_extractor::PeerIpKeyExtractor;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

use crate::admin::settings;
use crate::auth::challenge;
use crate::auth::middleware::JwtSecret;
use crate::identity::registration;
use crate::state::AppState;

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
        .layer(GovernorLayer {
            config: governor_config,
        });

    // Public routes (no auth required, no rate limiting)
    let public_routes =
        Router::new().route("/api/server/info", axum::routing::get(settings::get_server_info));

    // Admin routes (JWT auth required — Claims extractor validates token)
    let admin_routes = Router::new().route(
        "/api/server/settings",
        axum::routing::put(settings::update_server_settings),
    );

    // Health check
    let health = Router::new().route("/health", axum::routing::get(health_check));

    Router::new()
        .merge(auth_routes)
        .merge(public_routes)
        .merge(admin_routes)
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
