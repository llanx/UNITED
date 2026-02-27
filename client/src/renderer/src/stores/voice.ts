/**
 * Zustand slice for voice channel state.
 *
 * Tracks voice channel membership, participants, mute/deafen,
 * speaking, connection quality, device selection, and volume controls.
 * Persists voice settings (mode, sensitivity, devices, volumes) to localStorage.
 */

import type { StateCreator } from 'zustand'
import type { VoiceMode, ConnectionQuality, VoiceQualityMetrics } from '@shared/ipc-bridge'
import type { RootStore } from './index'

export interface VoiceParticipantState {
  userId: string
  displayName: string
  pubkey: string
  muted: boolean
  deafened: boolean
  speaking: boolean
  quality: ConnectionQuality
}

export interface VoiceSlice {
  // State
  voiceChannelId: string | null
  voiceParticipants: Map<string, VoiceParticipantState>
  localMuted: boolean
  localDeafened: boolean
  voiceMode: VoiceMode
  vadSensitivity: number  // 0-100 (0=sensitive, 100=aggressive)
  pttActive: boolean
  connectionQuality: ConnectionQuality
  qualityMetrics: VoiceQualityMetrics | null
  inputDeviceId: string | null
  outputDeviceId: string | null
  outputVolume: number  // 0-100
  userVolumes: Record<string, number>  // userId -> 0-200

  // Actions
  joinVoiceChannel: (channelId: string) => Promise<void>
  leaveVoiceChannel: () => void
  toggleMute: () => void
  toggleDeafen: () => void
  setVoiceMode: (mode: VoiceMode) => void
  setVadSensitivity: (value: number) => void
  setPttActive: (active: boolean) => void
  setConnectionQuality: (quality: ConnectionQuality, metrics: VoiceQualityMetrics) => void
  setInputDevice: (deviceId: string) => void
  setOutputDevice: (deviceId: string) => void
  setOutputVolume: (volume: number) => void
  setUserVolume: (userId: string, volume: number) => void

  // Participant state updates (from WS events)
  addVoiceParticipant: (participant: { userId: string; displayName: string; pubkey: string; muted: boolean; deafened: boolean }) => void
  removeVoiceParticipant: (userId: string) => void
  updateParticipantState: (userId: string, muted: boolean, deafened: boolean) => void
  updateParticipantSpeaking: (userId: string, speaking: boolean) => void
}

/** localStorage keys for persisted voice settings */
const VOICE_SETTINGS_KEY = 'united_voice_settings'

interface PersistedVoiceSettings {
  voiceMode: VoiceMode
  vadSensitivity: number
  inputDeviceId: string | null
  outputDeviceId: string | null
  outputVolume: number
  userVolumes: Record<string, number>
}

function loadVoiceSettings(): Partial<PersistedVoiceSettings> {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY)
    if (raw) return JSON.parse(raw) as Partial<PersistedVoiceSettings>
  } catch {
    // Corrupt or missing -- use defaults
  }
  return {}
}

function saveVoiceSettings(settings: PersistedVoiceSettings): void {
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // localStorage may be full or unavailable
  }
}

export const createVoiceSlice: StateCreator<RootStore, [], [], VoiceSlice> = (set, get) => {
  const persisted = loadVoiceSettings()

  return {
    // Initial state (with persisted overrides)
    voiceChannelId: null,
    voiceParticipants: new Map(),
    localMuted: false,
    localDeafened: false,
    voiceMode: persisted.voiceMode ?? 'vad',
    vadSensitivity: persisted.vadSensitivity ?? 50,
    pttActive: false,
    connectionQuality: 'good',
    qualityMetrics: null,
    inputDeviceId: persisted.inputDeviceId ?? null,
    outputDeviceId: persisted.outputDeviceId ?? null,
    outputVolume: persisted.outputVolume ?? 100,
    userVolumes: persisted.userVolumes ?? {},

    // Actions
    joinVoiceChannel: async (channelId: string) => {
      // Send IPC join (VoiceManager will handle WebRTC separately)
      await window.united.voice.join(channelId)
      set({ voiceChannelId: channelId, voiceParticipants: new Map() })
    },

    leaveVoiceChannel: () => {
      window.united.voice.leave()
      set({
        voiceChannelId: null,
        voiceParticipants: new Map(),
        localMuted: false,
        localDeafened: false,
        pttActive: false,
        connectionQuality: 'good',
        qualityMetrics: null,
      })
    },

    toggleMute: () => {
      const { localMuted, localDeafened, voiceChannelId } = get()
      const newMuted = !localMuted

      // If deafened and unmuting, also undeafen (deafen implies mute per CONTEXT.md)
      const newDeafened = newMuted ? localDeafened : false

      set({ localMuted: newMuted, localDeafened: newDeafened })

      // Send state update via WS
      if (voiceChannelId) {
        window.united.voice.sendStateUpdate(voiceChannelId, newMuted, newDeafened)
      }
    },

    toggleDeafen: () => {
      const { localDeafened, voiceChannelId } = get()
      const newDeafened = !localDeafened

      // If deafening, also mute
      const newMuted = newDeafened ? true : get().localMuted

      set({ localDeafened: newDeafened, localMuted: newMuted })

      // Send state update via WS
      if (voiceChannelId) {
        window.united.voice.sendStateUpdate(voiceChannelId, newMuted, newDeafened)
      }
    },

    setVoiceMode: (mode: VoiceMode) => {
      set({ voiceMode: mode })
      window.united.voice.setMode(mode)
      persistSettings(get)
    },

    setVadSensitivity: (value: number) => {
      set({ vadSensitivity: value })
      persistSettings(get)
    },

    setPttActive: (active: boolean) => {
      set({ pttActive: active })
    },

    setConnectionQuality: (quality: ConnectionQuality, metrics: VoiceQualityMetrics) => {
      set({ connectionQuality: quality, qualityMetrics: metrics })
    },

    setInputDevice: (deviceId: string) => {
      set({ inputDeviceId: deviceId })
      persistSettings(get)
    },

    setOutputDevice: (deviceId: string) => {
      set({ outputDeviceId: deviceId })
      persistSettings(get)
    },

    setOutputVolume: (volume: number) => {
      set({ outputVolume: volume })
      persistSettings(get)
    },

    setUserVolume: (userId: string, volume: number) => {
      const { userVolumes } = get()
      set({ userVolumes: { ...userVolumes, [userId]: volume } })
      persistSettings(get)
    },

    // Participant state updates
    addVoiceParticipant: (participant) => {
      const { voiceParticipants } = get()
      const next = new Map(voiceParticipants)
      next.set(participant.userId, {
        ...participant,
        speaking: false,
        quality: 'good',
      })
      set({ voiceParticipants: next })
    },

    removeVoiceParticipant: (userId: string) => {
      const { voiceParticipants } = get()
      const next = new Map(voiceParticipants)
      next.delete(userId)
      set({ voiceParticipants: next })
    },

    updateParticipantState: (userId: string, muted: boolean, deafened: boolean) => {
      const { voiceParticipants } = get()
      const existing = voiceParticipants.get(userId)
      if (!existing) return

      const next = new Map(voiceParticipants)
      next.set(userId, { ...existing, muted, deafened })
      set({ voiceParticipants: next })
    },

    updateParticipantSpeaking: (userId: string, speaking: boolean) => {
      const { voiceParticipants } = get()
      const existing = voiceParticipants.get(userId)
      if (!existing) return

      const next = new Map(voiceParticipants)
      next.set(userId, { ...existing, speaking })
      set({ voiceParticipants: next })
    },
  }
}

/**
 * Persist current voice settings to localStorage.
 */
function persistSettings(get: () => RootStore): void {
  const state = get()
  saveVoiceSettings({
    voiceMode: state.voiceMode,
    vadSensitivity: state.vadSensitivity,
    inputDeviceId: state.inputDeviceId,
    outputDeviceId: state.outputDeviceId,
    outputVolume: state.outputVolume,
    userVolumes: state.userVolumes,
  })
}
