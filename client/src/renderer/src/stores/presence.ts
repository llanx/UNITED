/**
 * Zustand slice for presence and typing indicator state.
 *
 * Tracks online/offline/away/dnd status for all known users and
 * per-channel typing users with automatic 3-second timeout.
 */

import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface PresenceInfo {
  status: 'online' | 'away' | 'dnd' | 'offline'
  displayName: string
}

export interface TypingUser {
  userId: string
  displayName: string
  timeout: number
}

export interface PresenceSlice {
  userPresence: Record<string, PresenceInfo>
  typingUsers: Record<string, TypingUser[]>
  setPresence: (userPubkey: string, status: 'online' | 'away' | 'dnd' | 'offline', displayName: string) => void
  setBulkPresence: (updates: Array<{ userPubkey: string; status: 'online' | 'away' | 'dnd' | 'offline'; displayName: string }>) => void
  addTypingUser: (channelId: string, userId: string, displayName: string) => void
  removeTypingUser: (channelId: string, userId: string) => void
  clearTypingForChannel: (channelId: string) => void
}

/** Typing indicator timeout in milliseconds */
const TYPING_TIMEOUT_MS = 3000

export const createPresenceSlice: StateCreator<RootStore, [], [], PresenceSlice> = (set, get) => ({
  userPresence: {},
  typingUsers: {},

  setPresence: (userPubkey: string, status: 'online' | 'away' | 'dnd' | 'offline', displayName: string) => {
    set((state) => ({
      userPresence: {
        ...state.userPresence,
        [userPubkey]: { status, displayName }
      }
    }))
  },

  setBulkPresence: (updates) => {
    set((state) => {
      const newPresence = { ...state.userPresence }
      for (const update of updates) {
        newPresence[update.userPubkey] = {
          status: update.status,
          displayName: update.displayName
        }
      }
      return { userPresence: newPresence }
    })
  },

  addTypingUser: (channelId: string, userId: string, displayName: string) => {
    const existing = get().typingUsers[channelId] ?? []

    // Clear existing timeout for this user if present
    const existingUser = existing.find(u => u.userId === userId)
    if (existingUser && existingUser.timeout) {
      clearTimeout(existingUser.timeout)
    }

    // Set new timeout to auto-remove after 3 seconds
    const timeout = window.setTimeout(() => {
      get().removeTypingUser(channelId, userId)
    }, TYPING_TIMEOUT_MS)

    set((state) => {
      const channelTyping = (state.typingUsers[channelId] ?? [])
        .filter(u => u.userId !== userId)
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: [...channelTyping, { userId, displayName, timeout }]
        }
      }
    })
  },

  removeTypingUser: (channelId: string, userId: string) => {
    set((state) => {
      const channelTyping = state.typingUsers[channelId]
      if (!channelTyping) return state

      // Clear the timeout for the removed user
      const removedUser = channelTyping.find(u => u.userId === userId)
      if (removedUser?.timeout) {
        clearTimeout(removedUser.timeout)
      }

      const filtered = channelTyping.filter(u => u.userId !== userId)
      if (filtered.length === 0) {
        const { [channelId]: _, ...rest } = state.typingUsers
        return { typingUsers: rest }
      }

      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: filtered
        }
      }
    })
  },

  clearTypingForChannel: (channelId: string) => {
    const channelTyping = get().typingUsers[channelId]
    if (channelTyping) {
      // Clear all timeouts
      for (const user of channelTyping) {
        if (user.timeout) clearTimeout(user.timeout)
      }
    }

    set((state) => {
      const { [channelId]: _, ...rest } = state.typingUsers
      return { typingUsers: rest }
    })
  }
})
