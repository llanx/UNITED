//! WebSocket broadcast helpers for chat events.
//! Wraps chat proto messages in Envelope and broadcasts to all connected WS clients.

use crate::proto::chat as proto_chat;
use crate::proto::presence as proto_presence;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::ws::broadcast::broadcast_to_all;
use crate::ws::ConnectionRegistry;

/// Broadcast a NewMessageEvent to all connected WS clients.
pub fn broadcast_new_message(
    registry: &ConnectionRegistry,
    chat_message: proto_chat::ChatMessage,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::NewMessageEvent(proto_chat::NewMessageEvent {
            message: Some(chat_message),
        })),
    };
    broadcast_to_all(registry, &envelope);
}

/// Broadcast a MessageEditedEvent to all connected WS clients.
pub fn broadcast_message_edited(
    registry: &ConnectionRegistry,
    event: proto_chat::MessageEditedEvent,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::MessageEditedEvent(event)),
    };
    broadcast_to_all(registry, &envelope);
}

/// Broadcast a MessageDeletedEvent to all connected WS clients.
pub fn broadcast_message_deleted(
    registry: &ConnectionRegistry,
    event: proto_chat::MessageDeletedEvent,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::MessageDeletedEvent(event)),
    };
    broadcast_to_all(registry, &envelope);
}

/// Broadcast a ReactionAddedEvent to all connected WS clients.
pub fn broadcast_reaction_added(
    registry: &ConnectionRegistry,
    event: proto_chat::ReactionAddedEvent,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::ReactionAddedEvent(event)),
    };
    broadcast_to_all(registry, &envelope);
}

/// Broadcast a ReactionRemovedEvent to all connected WS clients.
pub fn broadcast_reaction_removed(
    registry: &ConnectionRegistry,
    event: proto_chat::ReactionRemovedEvent,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::ReactionRemovedEvent(event)),
    };
    broadcast_to_all(registry, &envelope);
}

/// Broadcast a TypingEvent to all connected WS clients.
#[allow(dead_code)]
pub fn broadcast_typing(
    registry: &ConnectionRegistry,
    event: proto_presence::TypingEvent,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::TypingEvent(event)),
    };
    broadcast_to_all(registry, &envelope);
}

/// Broadcast a PresenceUpdateEvent to all connected WS clients.
/// Called from the presence module on status changes.
pub fn broadcast_presence_update(
    registry: &ConnectionRegistry,
    user_pubkey: &str,
    display_name: &str,
    status_i32: i32,
    timestamp: u64,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::PresenceUpdateEvent(proto_presence::PresenceUpdateEvent {
            update: Some(proto_presence::PresenceUpdate {
                user_pubkey: user_pubkey.to_string(),
                display_name: display_name.to_string(),
                status: status_i32,
                timestamp,
            }),
        })),
    };
    broadcast_to_all(registry, &envelope);
}

/// Broadcast a TypingEvent (typing indicator) to all connected WS clients.
/// Called from the presence REST endpoint.
pub fn broadcast_typing_indicator(
    registry: &ConnectionRegistry,
    user_pubkey: &str,
    channel_id: &str,
    display_name: &str,
    timestamp: u64,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::TypingEvent(proto_presence::TypingEvent {
            indicator: Some(proto_presence::TypingIndicator {
                user_pubkey: user_pubkey.to_string(),
                channel_id: channel_id.to_string(),
                display_name: display_name.to_string(),
                timestamp,
            }),
        })),
    };
    broadcast_to_all(registry, &envelope);
}
