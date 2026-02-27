/**
 * Hook for voice channel lifecycle management.
 *
 * Manages VoiceManager, AudioPipeline, SignalingClient lifecycle,
 * WS event subscriptions, speaking detection, stats polling, and cleanup.
 * Call once at a high level (e.g., Main.tsx) so voice persists across
 * channel navigation.
 */

import { useEffect, useRef } from 'react'
import { useStore } from '../stores'
import { VoiceManager } from '../voice/VoiceManager'
import { AudioPipeline } from '../voice/AudioPipeline'
import { SignalingClient } from '../voice/SignalingClient'
import type {
  JoinResponseData,
  ParticipantJoinedData,
  ParticipantLeftData,
  SdpData,
  IceCandidateData,
  StateUpdateData,
  SpeakingData,
} from '../voice/SignalingClient'

export function useVoice(): void {
  const voiceChannelId = useStore((s) => s.voiceChannelId)
  const addVoiceParticipant = useStore((s) => s.addVoiceParticipant)
  const removeVoiceParticipant = useStore((s) => s.removeVoiceParticipant)
  const updateParticipantState = useStore((s) => s.updateParticipantState)
  const updateParticipantSpeaking = useStore((s) => s.updateParticipantSpeaking)
  const setConnectionQuality = useStore((s) => s.setConnectionQuality)
  const setPttActive = useStore((s) => s.setPttActive)
  const leaveVoiceChannel = useStore((s) => s.leaveVoiceChannel)

  const managerRef = useRef<VoiceManager | null>(null)
  const audioRef = useRef<AudioPipeline | null>(null)
  const signalingRef = useRef<SignalingClient | null>(null)

  // Register WS voice event listener and PTT state listener on mount
  useEffect(() => {
    const signaling = new SignalingClient()
    signalingRef.current = signaling
    signaling.start()

    // PTT state -> store
    signaling.onPttState = (active: boolean) => {
      setPttActive(active)
    }

    return () => {
      signaling.dispose()
      signalingRef.current = null
    }
  }, [setPttActive])

  // When voiceChannelId changes: manage VoiceManager lifecycle
  useEffect(() => {
    const signaling = signalingRef.current
    if (!signaling) return

    if (voiceChannelId) {
      // Entering a voice channel -- set up event handlers
      // The actual join + WebRTC setup happens when we receive the join_response

      signaling.onJoinResponse = async (data: JoinResponseData) => {
        // Initialize audio pipeline
        const audio = new AudioPipeline()
        await audio.init()
        audioRef.current = audio

        // Apply persisted volume settings
        const state = useStore.getState()
        audio.setMasterVolume(state.outputVolume)
        if (state.outputDeviceId) {
          audio.setOutputDevice(state.outputDeviceId).catch(() => {
            // Device may not be available
          })
        }

        // Get local user ID from auth state
        const localUserId = state.serverId || ''

        // Create and configure VoiceManager
        const manager = new VoiceManager(signaling, audio)
        managerRef.current = manager

        // Wire speaking detection to store
        manager.onSpeakingChange = (userId: string, speaking: boolean) => {
          updateParticipantSpeaking(userId, speaking)
        }

        manager.onLocalSpeakingChange = (_speaking: boolean) => {
          // Local speaking state is used for UI indicators
          // The VoiceManager handles sending the speaking event via signaling
        }

        // Wire stats polling to store
        manager.onOverallQualityChange = (quality, metrics) => {
          setConnectionQuality(quality, metrics)
        }

        // Add existing participants to store
        for (const p of data.participants) {
          addVoiceParticipant(p)
        }

        // Join the channel with WebRTC
        await manager.joinChannel(
          voiceChannelId,
          localUserId,
          data.participants,
          data.iceServers
        )

        // Apply per-user volume settings
        for (const [userId, volume] of Object.entries(state.userVolumes)) {
          audio.setUserVolume(userId, volume)
        }
      }

      signaling.onParticipantJoined = async (data: ParticipantJoinedData) => {
        addVoiceParticipant(data.participant)
        if (managerRef.current) {
          await managerRef.current.handleNewParticipant(data.participant)

          // Apply per-user volume if previously set
          const volume = useStore.getState().userVolumes[data.participant.userId]
          if (volume !== undefined && audioRef.current) {
            audioRef.current.setUserVolume(data.participant.userId, volume)
          }
        }
      }

      signaling.onParticipantLeft = (data: ParticipantLeftData) => {
        removeVoiceParticipant(data.userId)
        managerRef.current?.handleParticipantLeft(data.userId)
      }

      signaling.onSdpOffer = async (data: SdpData) => {
        await managerRef.current?.handleSdpOffer(data.senderUserId, data.sdp)
      }

      signaling.onSdpAnswer = async (data: SdpData) => {
        await managerRef.current?.handleSdpAnswer(data.senderUserId, data.sdp)
      }

      signaling.onIceCandidate = async (data: IceCandidateData) => {
        await managerRef.current?.handleIceCandidate(data.senderUserId, data.candidateJson)
      }

      signaling.onStateUpdate = (data: StateUpdateData) => {
        updateParticipantState(data.userId, data.muted, data.deafened)
      }

      signaling.onSpeaking = (data: SpeakingData) => {
        updateParticipantSpeaking(data.userId, data.speaking)
      }
    } else {
      // Left voice channel -- clean up
      if (managerRef.current) {
        managerRef.current.leaveChannel()
        managerRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.dispose()
        audioRef.current = null
      }

      // Clear event handlers (but keep signaling client alive for PTT)
      signaling.onJoinResponse = null
      signaling.onParticipantJoined = null
      signaling.onParticipantLeft = null
      signaling.onSdpOffer = null
      signaling.onSdpAnswer = null
      signaling.onIceCandidate = null
      signaling.onStateUpdate = null
      signaling.onSpeaking = null
    }

    // Cleanup on unmount
    return () => {
      if (managerRef.current) {
        managerRef.current.leaveChannel()
        managerRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.dispose()
        audioRef.current = null
      }
    }
  }, [
    voiceChannelId,
    addVoiceParticipant,
    removeVoiceParticipant,
    updateParticipantState,
    updateParticipantSpeaking,
    setConnectionQuality,
    leaveVoiceChannel,
  ])

  // Sync mute/deafen state with AudioPipeline
  const localMuted = useStore((s) => s.localMuted)
  const localDeafened = useStore((s) => s.localDeafened)

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muteLocalMic(localMuted)
    }
  }, [localMuted])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.deafen(localDeafened)
    }
  }, [localDeafened])

  // Sync output volume with AudioPipeline
  const outputVolume = useStore((s) => s.outputVolume)

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.setMasterVolume(outputVolume)
    }
  }, [outputVolume])
}
