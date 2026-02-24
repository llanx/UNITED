use axum::{middleware, Router};

use crate::admin::settings;
use crate::auth::middleware::JwtSecret;
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
    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/api/server/info", axum::routing::get(settings::get_server_info));

    // Admin routes (JWT auth required — Claims extractor validates token)
    let admin_routes = Router::new()
        .route(
            "/api/server/settings",
            axum::routing::put(settings::update_server_settings),
        );

    // Health check
    let health = Router::new().route("/health", axum::routing::get(health_check));

    Router::new()
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
