use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
};
use serde::{Deserialize, Serialize};

/// JWT claims extracted from Authorization: Bearer header.
/// Implements axum's FromRequestParts for use as an extractor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// User ID (UUIDv7)
    pub sub: String,
    /// Public key fingerprint
    pub fingerprint: String,
    /// Whether user is server owner
    pub is_owner: bool,
    /// Whether user has admin role
    pub is_admin: bool,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// Expiration (Unix timestamp)
    pub exp: i64,
}

impl<S> FromRequestParts<S> for Claims
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Extract Bearer token from Authorization header
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or(StatusCode::UNAUTHORIZED)?;

        // Get JWT secret from request extensions (set by middleware layer)
        let jwt_secret = parts
            .extensions
            .get::<JwtSecret>()
            .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

        // Validate and decode JWT
        let validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
        let token_data = jsonwebtoken::decode::<Claims>(
            token,
            &jsonwebtoken::DecodingKey::from_secret(&jwt_secret.0),
            &validation,
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

        Ok(token_data.claims)
    }
}

/// JWT secret stored in request extensions for the Claims extractor
#[derive(Clone)]
pub struct JwtSecret(pub Vec<u8>);
