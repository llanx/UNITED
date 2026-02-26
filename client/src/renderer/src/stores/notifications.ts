/**
 * Zustand slice for notification state and per-channel preferences.
 *
 * Tracks per-channel mention counts and notification mute/notify-all settings.
 */

import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface NotificationsSlice {
  channelMentionCounts: Record<string, number>
  notificationPrefs: Record<string, { muted: boolean; notifyAll: boolean }>
  incrementMentionCount: (channelId: string) => void
  clearMentionCount: (channelId: string) => void
  setNotificationPref: (channelId: string, pref: { muted?: boolean; notifyAll?: boolean }) => void
}

export const createNotificationsSlice: StateCreator<RootStore, [], [], NotificationsSlice> = (set, get) => ({
  channelMentionCounts: {},
  notificationPrefs: {},

  incrementMentionCount: (channelId: string) => {
    set((state) => ({
      channelMentionCounts: {
        ...state.channelMentionCounts,
        [channelId]: (state.channelMentionCounts[channelId] ?? 0) + 1
      }
    }))
  },

  clearMentionCount: (channelId: string) => {
    set((state) => {
      const { [channelId]: _, ...rest } = state.channelMentionCounts
      return { channelMentionCounts: rest }
    })
  },

  setNotificationPref: (channelId: string, pref: { muted?: boolean; notifyAll?: boolean }) => {
    const current = get().notificationPrefs[channelId] ?? { muted: false, notifyAll: false }
    const updated = {
      muted: pref.muted ?? current.muted,
      notifyAll: pref.notifyAll ?? current.notifyAll
    }

    set((state) => ({
      notificationPrefs: {
        ...state.notificationPrefs,
        [channelId]: updated
      }
    }))

    // Persist to main process (fire and forget)
    window.united.notifications.setPrefs(channelId, updated).catch(() => {})
  }
})
