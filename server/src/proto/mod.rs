// Generated protobuf types from shared/proto/*.proto via prost-build
// The module hierarchy must match the protobuf package paths:
//   united.auth       -> proto::united::auth
//   united.identity   -> proto::united::identity
//   united.server     -> proto::united::server
//   united.channels   -> proto::united::channels
//   united.roles      -> proto::united::roles
//   united.moderation -> proto::united::moderation
//   united.invite     -> proto::united::invite
//   united.p2p        -> proto::united::p2p
//   united.chat       -> proto::united::chat
//   united.presence   -> proto::united::presence
//   united.dm         -> proto::united::dm
//   united.voice      -> proto::united::voice
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

    pub mod p2p {
        include!(concat!(env!("OUT_DIR"), "/united.p2p.rs"));
    }

    pub mod chat {
        include!(concat!(env!("OUT_DIR"), "/united.chat.rs"));
    }

    pub mod presence {
        include!(concat!(env!("OUT_DIR"), "/united.presence.rs"));
    }

    pub mod dm {
        include!(concat!(env!("OUT_DIR"), "/united.dm.rs"));
    }

    pub mod blocks {
        include!(concat!(env!("OUT_DIR"), "/united.blocks.rs"));
    }

    pub mod voice {
        include!(concat!(env!("OUT_DIR"), "/united.voice.rs"));
    }

    pub mod ws {
        include!(concat!(env!("OUT_DIR"), "/united.ws.rs"));
    }
}

// Re-export for convenient access
pub use united::auth;
pub use united::channels;
pub use united::chat;
pub use united::identity;
pub use united::invite;
pub use united::moderation;
pub use united::p2p as p2p_proto;
pub use united::presence;
pub use united::blocks;
pub use united::dm;
pub use united::voice as voice_proto;
pub use united::roles;
pub use united::server;
pub use united::ws;
