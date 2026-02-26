use axum::extract::ws::Message;
use prost::Message as ProstMessage;
use tokio::sync::mpsc;

use crate::proto::voice_proto;
use crate::proto::ws::{envelope::Payload, Envelope};
use crate::state::AppState;
use crate::voice::state::VoiceParticipantInfo;
use crate::voice::turn;
use crate::ws::broadcast::send_to_user;

/// Handle a VoiceJoinRequest: add user to voice channel, return participants + ICE servers,
/// broadcast join event to existing participants.
///
/// If the user is already in another voice channel, they are auto-disconnected from it first.
pub async fn handle_voice_join(
    req: voice_proto::VoiceJoinRequest,
    request_id: &str,
    tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    // Look up user's display_name and pubkey from DB
    let db = state.db.clone();
    let uid = user_id.to_string();
    let user_info = tokio::task::spawn_blocking(move || {
        let conn = db.lock().ok()?;
        conn.query_row(
            "SELECT display_name, lower(hex(public_key)) FROM users WHERE id = ?1",
            rusqlite::params![uid],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .ok()
    })
    .await
    .ok()
    .flatten();

    let (display_name, pubkey) = match user_info {
        Some(info) => info,
        None => {
            send_error(tx, request_id, 404, "User not found");
            return;
        }
    };

    // Auto-disconnect from any other voice channel first
    let left_channels = state.voice_state.leave_all_channels(user_id);
    for left_channel_id in &left_channels {
        broadcast_leave_event(state, left_channel_id, user_id, &display_name);
    }

    // Look up max_participants for this channel from DB
    let db = state.db.clone();
    let channel_id = req.channel_id.clone();
    let max_participants = tokio::task::spawn_blocking(move || {
        let conn = db.lock().ok()?;
        conn.query_row(
            "SELECT max_participants FROM channels WHERE id = ?1",
            rusqlite::params![channel_id],
            |row| row.get::<_, Option<i64>>(0),
        )
        .ok()
    })
    .await
    .ok()
    .flatten()
    .flatten();

    let participant = VoiceParticipantInfo {
        user_id: user_id.to_string(),
        display_name: display_name.clone(),
        pubkey: pubkey.clone(),
        muted: false,
        deafened: false,
    };

    // Add to voice state
    let join_result = match state
        .voice_state
        .join_channel(&req.channel_id, participant, max_participants)
    {
        Ok(result) => result,
        Err(_) => {
            send_error(tx, request_id, 409, "Voice channel is full");
            return;
        }
    };

    // Generate ICE servers (STUN + TURN credentials)
    let ice_servers = turn::get_ice_servers(&state.turn_config, user_id);

    // Build participant list for the join response
    let participants: Vec<voice_proto::VoiceParticipant> = join_result
        .existing_participants
        .iter()
        .map(|p| voice_proto::VoiceParticipant {
            user_id: p.user_id.clone(),
            display_name: p.display_name.clone(),
            pubkey: p.pubkey.clone(),
            muted: p.muted,
            deafened: p.deafened,
        })
        .collect();

    // Send VoiceJoinResponse to the joiner
    let response = Envelope {
        request_id: request_id.to_string(),
        payload: Some(Payload::VoiceJoinResponse(voice_proto::VoiceJoinResponse {
            participants,
            ice_servers,
        })),
    };
    send_envelope(tx, &response);

    // Broadcast VoiceParticipantJoinedEvent to existing participants
    let joined_event = Envelope {
        request_id: String::new(),
        payload: Some(Payload::VoiceParticipantJoinedEvent(
            voice_proto::VoiceParticipantJoinedEvent {
                channel_id: req.channel_id.clone(),
                participant: Some(voice_proto::VoiceParticipant {
                    user_id: user_id.to_string(),
                    display_name,
                    pubkey,
                    muted: false,
                    deafened: false,
                }),
            },
        )),
    };

    for p in &join_result.existing_participants {
        send_to_user(&state.connections, &p.user_id, &joined_event);
    }
}

/// Handle a VoiceLeaveRequest: remove user from voice channel, broadcast leave event.
pub async fn handle_voice_leave(
    req: voice_proto::VoiceLeaveRequest,
    _request_id: &str,
    _tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    // Look up display_name for the leave broadcast
    let db = state.db.clone();
    let uid = user_id.to_string();
    let display_name = tokio::task::spawn_blocking(move || {
        let conn = db.lock().ok()?;
        conn.query_row(
            "SELECT display_name FROM users WHERE id = ?1",
            rusqlite::params![uid],
            |row| row.get::<_, String>(0),
        )
        .ok()
    })
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| "Unknown".to_string());

    state.voice_state.leave_channel(&req.channel_id, user_id);
    broadcast_leave_event(state, &req.channel_id, user_id, &display_name);
}

/// Handle a VoiceSdpOffer: relay to target user with sender's user_id.
pub async fn handle_voice_sdp_offer(
    req: voice_proto::VoiceSdpOffer,
    _request_id: &str,
    _tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::VoiceSdpOffer(voice_proto::VoiceSdpOffer {
            target_user_id: req.target_user_id.clone(),
            sdp: req.sdp,
            channel_id: req.channel_id,
            sender_user_id: user_id.to_string(),
        })),
    };
    send_to_user(&state.connections, &req.target_user_id, &envelope);
}

/// Handle a VoiceSdpAnswer: relay to target user with sender's user_id.
pub async fn handle_voice_sdp_answer(
    req: voice_proto::VoiceSdpAnswer,
    _request_id: &str,
    _tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::VoiceSdpAnswer(voice_proto::VoiceSdpAnswer {
            target_user_id: req.target_user_id.clone(),
            sdp: req.sdp,
            channel_id: req.channel_id,
            sender_user_id: user_id.to_string(),
        })),
    };
    send_to_user(&state.connections, &req.target_user_id, &envelope);
}

/// Handle a VoiceIceCandidate: relay to target user with sender's user_id.
pub async fn handle_voice_ice_candidate(
    req: voice_proto::VoiceIceCandidate,
    _request_id: &str,
    _tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::VoiceIceCandidate(voice_proto::VoiceIceCandidate {
            target_user_id: req.target_user_id.clone(),
            candidate_json: req.candidate_json,
            channel_id: req.channel_id,
            sender_user_id: user_id.to_string(),
        })),
    };
    send_to_user(&state.connections, &req.target_user_id, &envelope);
}

/// Handle a VoiceStateUpdate: update voice state and broadcast to all participants.
pub async fn handle_voice_state_update(
    req: voice_proto::VoiceStateUpdate,
    _request_id: &str,
    _tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    // Update in-memory state
    state
        .voice_state
        .update_state(&req.channel_id, user_id, req.muted, req.deafened);

    // Broadcast to all participants in the channel
    let participants = state.voice_state.get_participants(&req.channel_id);
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::VoiceStateUpdate(voice_proto::VoiceStateUpdate {
            channel_id: req.channel_id,
            user_id: user_id.to_string(),
            muted: req.muted,
            deafened: req.deafened,
        })),
    };

    for p in &participants {
        if p.user_id != user_id {
            send_to_user(&state.connections, &p.user_id, &envelope);
        }
    }
}

/// Handle a VoiceSpeakingEvent: broadcast to all participants in the channel.
pub async fn handle_voice_speaking(
    req: voice_proto::VoiceSpeakingEvent,
    _request_id: &str,
    _tx: &mpsc::UnboundedSender<Message>,
    state: &AppState,
    user_id: &str,
) {
    let participants = state.voice_state.get_participants(&req.channel_id);
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::VoiceSpeakingEvent(
            voice_proto::VoiceSpeakingEvent {
                channel_id: req.channel_id,
                user_id: user_id.to_string(),
                speaking: req.speaking,
            },
        )),
    };

    for p in &participants {
        if p.user_id != user_id {
            send_to_user(&state.connections, &p.user_id, &envelope);
        }
    }
}

/// Broadcast a VoiceLeaveEvent to remaining participants in a channel.
pub fn broadcast_leave_event(
    state: &AppState,
    channel_id: &str,
    user_id: &str,
    display_name: &str,
) {
    let participants = state.voice_state.get_participants(channel_id);
    let envelope = Envelope {
        request_id: String::new(),
        payload: Some(Payload::VoiceLeaveEvent(voice_proto::VoiceLeaveEvent {
            channel_id: channel_id.to_string(),
            user_id: user_id.to_string(),
            display_name: display_name.to_string(),
        })),
    };

    for p in &participants {
        send_to_user(&state.connections, &p.user_id, &envelope);
    }
}

/// Encode and send an Envelope as a binary WebSocket message.
fn send_envelope(tx: &mpsc::UnboundedSender<Message>, envelope: &Envelope) {
    let mut buf = Vec::with_capacity(envelope.encoded_len());
    if envelope.encode(&mut buf).is_ok() {
        let _ = tx.send(Message::Binary(buf.into()));
    }
}

/// Send an error response envelope.
fn send_error(tx: &mpsc::UnboundedSender<Message>, request_id: &str, code: u32, message: &str) {
    let envelope = Envelope {
        request_id: request_id.to_string(),
        payload: Some(Payload::Error(crate::proto::ws::ErrorResponse {
            code,
            message: message.to_string(),
            request_id: request_id.to_string(),
        })),
    };
    send_envelope(tx, &envelope);
}
