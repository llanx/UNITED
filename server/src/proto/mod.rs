// Generated protobuf types from shared/proto/*.proto via prost-build
// The module hierarchy must match the protobuf package paths:
//   united.auth       -> proto::united::auth
//   united.identity   -> proto::united::identity
//   united.server     -> proto::united::server
//   united.channels   -> proto::united::channels
//   united.roles      -> proto::united::roles
//   united.moderation -> proto::united::moderation
//   united.invite     -> proto::united::invite
//   united.ws         -> proto::united::ws

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

    pub mod channels {
        include!(concat!(env!("OUT_DIR"), "/united.channels.rs"));
    }

    pub mod roles {
        include!(concat!(env!("OUT_DIR"), "/united.roles.rs"));
    }

    pub mod moderation {
        include!(concat!(env!("OUT_DIR"), "/united.moderation.rs"));
    }

    pub mod invite {
        include!(concat!(env!("OUT_DIR"), "/united.invite.rs"));
    }

    pub mod ws {
        include!(concat!(env!("OUT_DIR"), "/united.ws.rs"));
    }
}

// Re-export for convenient access
pub use united::auth;
pub use united::channels;
pub use united::identity;
pub use united::invite;
pub use united::moderation;
pub use united::roles;
pub use united::server;
pub use united::ws;
