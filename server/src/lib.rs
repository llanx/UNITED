//! UNITED coordination server library.
//! This crate exposes internal modules for integration testing.
//! The binary entry point is in main.rs.

pub mod admin;
pub mod auth;
pub mod channels;
pub mod chat;
pub mod config;
pub mod db;
pub mod dm;
pub mod identity;
pub mod invite;
pub mod moderation;
pub mod p2p;
pub mod proto;
pub mod roles;
pub mod routes;
pub mod state;
pub mod ws;
