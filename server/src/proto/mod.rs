// Generated protobuf types from shared/proto/*.proto via prost-build
// The module hierarchy must match the protobuf package paths:
//   united.auth    -> proto::united::auth
//   united.identity -> proto::united::identity
//   united.server  -> proto::united::server
//   united.ws      -> proto::united::ws

pub mod united {
    pub mod auth {
        include!(concat!(env!("OUT_DIR"), "/united.auth.rs"));
    }

    pub mod identity {
        include!(concat!(env!("OUT_DIR"), "/united.identity.rs"));
    }

    pub mod server {
        include!(concat!(env!("OUT_DIR"), "/united.server.rs"));
    }

    pub mod ws {
        include!(concat!(env!("OUT_DIR"), "/united.ws.rs"));
    }
}

// Re-export for convenient access
pub use united::auth;
pub use united::identity;
pub use united::server;
pub use united::ws;
