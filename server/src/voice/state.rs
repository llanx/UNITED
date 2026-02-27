use dashmap::DashMap;
use std::sync::Arc;

/// Information about a participant in a voice channel.
#[derive(Debug, Clone)]
pub struct VoiceParticipantInfo {
    pub user_id: String,
    pub display_name: String,
    pub pubkey: String,
    pub muted: bool,
    pub deafened: bool,
}

/// State for a single voice channel.
#[derive(Debug, Clone, Default)]
pub struct VoiceChannelState {
    pub participants: Vec<VoiceParticipantInfo>,
}

/// Error type for voice state operations.
#[derive(Debug)]
pub enum VoiceError {
    ChannelFull,
}

impl std::fmt::Display for VoiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VoiceError::ChannelFull => write!(f, "Voice channel is full"),
        }
    }
}

/// Result from joining a voice channel.
pub struct JoinResult {
    /// Existing participants at the time of join (before the new user was added).
    pub existing_participants: Vec<VoiceParticipantInfo>,
    /// True if participant count exceeds soft cap (8) -- client should show quality warning.
    pub quality_warning: bool,
}

/// In-memory voice channel state manager.
///
/// Tracks which users are in which voice channels using a DashMap for
/// lock-free concurrent access, consistent with the project's existing
/// patterns for challenges and presence.
#[derive(Debug, Clone)]
pub struct VoiceState {
    /// channel_id -> VoiceChannelState
    channels: Arc<DashMap<String, VoiceChannelState>>,
}

const SOFT_CAP: usize = 8;

impl VoiceState {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(DashMap::new()),
        }
    }

    /// Add a participant to a voice channel.
    ///
    /// Returns the list of existing participants (before the join) and whether
    /// a quality warning should be shown.
    ///
    /// If `max_participants` is Some and the channel is at that hard limit, returns Err.
    /// If participant count exceeds the soft cap (8), sets `quality_warning = true`.
    pub fn join_channel(
        &self,
        channel_id: &str,
        participant: VoiceParticipantInfo,
        max_participants: Option<i64>,
    ) -> Result<JoinResult, VoiceError> {
        let mut entry = self.channels.entry(channel_id.to_string()).or_default();
        let state = entry.value_mut();

        // Check hard limit (admin-configured max_participants)
        if let Some(max) = max_participants {
            if max > 0 && state.participants.len() >= max as usize {
                return Err(VoiceError::ChannelFull);
            }
        }

        // Remove user if already present (handles auto-rejoin)
        state.participants.retain(|p| p.user_id != participant.user_id);

        let existing = state.participants.clone();
        let quality_warning = existing.len() >= SOFT_CAP;

        state.participants.push(participant);

        Ok(JoinResult {
            existing_participants: existing,
            quality_warning,
        })
    }

    /// Remove a participant from a voice channel.
    pub fn leave_channel(&self, channel_id: &str, user_id: &str) {
        if let Some(mut entry) = self.channels.get_mut(channel_id) {
            entry.value_mut().participants.retain(|p| p.user_id != user_id);
            // Clean up empty channels
            if entry.value().participants.is_empty() {
                drop(entry);
                self.channels.remove(channel_id);
            }
        }
    }

    /// Get all participants in a voice channel.
    pub fn get_participants(&self, channel_id: &str) -> Vec<VoiceParticipantInfo> {
        self.channels
            .get(channel_id)
            .map(|entry| entry.value().participants.clone())
            .unwrap_or_default()
    }

    /// Update a participant's muted/deafened state.
    pub fn update_state(&self, channel_id: &str, user_id: &str, muted: bool, deafened: bool) {
        if let Some(mut entry) = self.channels.get_mut(channel_id) {
            for p in entry.value_mut().participants.iter_mut() {
                if p.user_id == user_id {
                    p.muted = muted;
                    p.deafened = deafened;
                    break;
                }
            }
        }
    }

    /// Remove a user from all voice channels they are in.
    ///
    /// Returns the list of channel_ids the user was in (for broadcasting leave events).
    pub fn leave_all_channels(&self, user_id: &str) -> Vec<String> {
        let mut left_channels = Vec::new();

        // Collect channel IDs first to avoid holding locks during mutation
        let channel_ids: Vec<String> = self.channels.iter().map(|e| e.key().clone()).collect();

        for channel_id in channel_ids {
            if let Some(mut entry) = self.channels.get_mut(&channel_id) {
                let before = entry.value().participants.len();
                entry.value_mut().participants.retain(|p| p.user_id != user_id);
                let after = entry.value().participants.len();
                if after < before {
                    left_channels.push(channel_id.clone());
                }
                if after == 0 {
                    drop(entry);
                    self.channels.remove(&channel_id);
                }
            }
        }

        left_channels
    }
}
