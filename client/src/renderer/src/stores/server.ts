import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface ModerationNotice {
  type: 'kick' | 'ban'
  reason?: string
}

export interface ServerSlice {
  serverId: string | null
  name: string | null
  description: string | null
  registrationMode: string | null
  isAdmin: boolean

  // Welcome overlay state
  welcomeEnabled: boolean
  welcomeText: string | null
  welcomeDismissed: Record<string, boolean>
  dismissWelcome: (serverId: string) => void
  setWelcomeConfig: (enabled: boolean, text?: string | null) => void

  // Moderation notice state
  moderationNotice: ModerationNotice | null
  setModerationNotice: (notice: ModerationNotice) => void
  clearModerationNotice: () => void
}

export const createServerSlice: StateCreator<RootStore, [], [], ServerSlice> = (set, get) => ({
  serverId: null,
  name: null,
  description: null,
  registrationMode: null,
  isAdmin: false,

  // Welcome overlay
  welcomeEnabled: false,
  welcomeText: null,
  welcomeDismissed: {},

  dismissWelcome: (serverId: string) => {
    const current = get().welcomeDismissed
    set({
      welcomeDismissed: { ...current, [serverId]: true }
    })
    // Persist dismissal to local storage
    window.united.storage
      .setCachedState('welcome_dismissed', { ...current, [serverId]: true })
      .catch(() => {})
  },

  setWelcomeConfig: (enabled: boolean, text?: string | null) => {
    set({
      welcomeEnabled: enabled,
      welcomeText: text ?? null
    })
  },

  // Moderation notices
  moderationNotice: null,

  setModerationNotice: (notice: ModerationNotice) => {
    set({ moderationNotice: notice })
  },

  clearModerationNotice: () => {
    set({ moderationNotice: null })
  },
})
