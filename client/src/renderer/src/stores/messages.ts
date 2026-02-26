/**
 * Zustand slice for per-channel message state.
 *
 * Stores messages indexed by channel ID with windowed arrays (max 500 per channel),
 * deduplication by server_sequence, and unread tracking.
 */

import type { StateCreator } from 'zustand'
import type { ChatMessage, ChatHistoryResponse } from '@shared/ipc-bridge'
import type { RootStore } from './index'

/** Max messages kept in memory per channel */
const MAX_MESSAGES_PER_CHANNEL = 500

/** Default page size for history fetches */
const DEFAULT_PAGE_SIZE = 50

export interface ChannelMessages {
  messages: ChatMessage[]
  oldestLoaded: number | null
  newestLoaded: number | null
  hasMoreHistory: boolean
  lastReadSequence: number
  loading: boolean
}

export interface MessagesSlice {
  channelMessages: Record<string, ChannelMessages>
  loadMessages: (channelId: string) => Promise<void>
  loadOlderMessages: (channelId: string) => Promise<void>
  appendMessage: (channelId: string, msg: ChatMessage) => void
  updateMessage: (channelId: string, messageId: string, updates: Partial<ChatMessage>) => void
  removeMessage: (channelId: string, messageId: string) => void
  addReaction: (channelId: string, messageId: string, emoji: string, userPubkey: string) => void
  removeReaction: (channelId: string, messageId: string, emoji: string, userPubkey: string) => void
  markChannelRead: (channelId: string) => void
  getUnreadCount: (channelId: string) => number
  clearChannelMessages: (channelId: string) => void
}

function emptyChannelMessages(): ChannelMessages {
  return {
    messages: [],
    oldestLoaded: null,
    newestLoaded: null,
    hasMoreHistory: true,
    lastReadSequence: 0,
    loading: false
  }
}

export const createMessagesSlice: StateCreator<RootStore, [], [], MessagesSlice> = (set, get) => ({
  channelMessages: {},

  loadMessages: async (channelId: string) => {
    const existing = get().channelMessages[channelId]
    if (existing && existing.messages.length > 0) return // Already loaded
    if (existing?.loading) return // Already loading

    set((state) => ({
      channelMessages: {
        ...state.channelMessages,
        [channelId]: {
          ...(state.channelMessages[channelId] || emptyChannelMessages()),
          loading: true
        }
      }
    }))

    try {
      const result: ChatHistoryResponse = await window.united.chat.fetchHistory(
        channelId,
        undefined,
        DEFAULT_PAGE_SIZE
      )

      const sortedMessages = result.messages.sort(
        (a, b) => a.server_sequence - b.server_sequence
      )

      // Fetch last-read position
      let lastReadSequence = 0
      try {
        const lastRead = await window.united.lastRead.fetch(channelId)
        lastReadSequence = lastRead.last_sequence
      } catch {
        // No last-read position yet
      }

      set((state) => ({
        channelMessages: {
          ...state.channelMessages,
          [channelId]: {
            messages: sortedMessages,
            oldestLoaded: sortedMessages.length > 0
              ? sortedMessages[0].server_sequence
              : null,
            newestLoaded: sortedMessages.length > 0
              ? sortedMessages[sortedMessages.length - 1].server_sequence
              : null,
            hasMoreHistory: result.has_more,
            lastReadSequence,
            loading: false
          }
        }
      }))
    } catch (err) {
      console.error(`Failed to load messages for channel ${channelId}:`, err)
      set((state) => ({
        channelMessages: {
          ...state.channelMessages,
          [channelId]: {
            ...(state.channelMessages[channelId] || emptyChannelMessages()),
            loading: false
          }
        }
      }))
    }
  },

  loadOlderMessages: async (channelId: string) => {
    const channel = get().channelMessages[channelId]
    if (!channel || !channel.hasMoreHistory || channel.loading) return

    set((state) => ({
      channelMessages: {
        ...state.channelMessages,
        [channelId]: { ...state.channelMessages[channelId], loading: true }
      }
    }))

    try {
      const result: ChatHistoryResponse = await window.united.chat.fetchHistory(
        channelId,
        channel.oldestLoaded ?? undefined,
        DEFAULT_PAGE_SIZE
      )

      const sortedNew = result.messages.sort(
        (a, b) => a.server_sequence - b.server_sequence
      )

      set((state) => {
        const current = state.channelMessages[channelId]
        if (!current) return state

        // Deduplicate by server_sequence
        const existingSeqs = new Set(current.messages.map(m => m.server_sequence))
        const unique = sortedNew.filter(m => !existingSeqs.has(m.server_sequence))

        const merged = [...unique, ...current.messages]

        // Trim from newest end if over cap
        const trimmed = merged.length > MAX_MESSAGES_PER_CHANNEL
          ? merged.slice(0, MAX_MESSAGES_PER_CHANNEL)
          : merged

        return {
          channelMessages: {
            ...state.channelMessages,
            [channelId]: {
              ...current,
              messages: trimmed,
              oldestLoaded: trimmed.length > 0
                ? trimmed[0].server_sequence
                : current.oldestLoaded,
              hasMoreHistory: result.has_more,
              loading: false
            }
          }
        }
      })
    } catch (err) {
      console.error(`Failed to load older messages for channel ${channelId}:`, err)
      set((state) => ({
        channelMessages: {
          ...state.channelMessages,
          [channelId]: { ...state.channelMessages[channelId], loading: false }
        }
      }))
    }
  },

  appendMessage: (channelId: string, msg: ChatMessage) => {
    set((state) => {
      const current = state.channelMessages[channelId] || emptyChannelMessages()

      // Deduplicate: check if message with this server_sequence already exists
      if (current.messages.some(m => m.server_sequence === msg.server_sequence)) {
        return state
      }

      const updated = [...current.messages, msg]

      // Trim from oldest end if over cap
      const trimmed = updated.length > MAX_MESSAGES_PER_CHANNEL
        ? updated.slice(updated.length - MAX_MESSAGES_PER_CHANNEL)
        : updated

      return {
        channelMessages: {
          ...state.channelMessages,
          [channelId]: {
            ...current,
            messages: trimmed,
            newestLoaded: msg.server_sequence,
            oldestLoaded: trimmed.length > 0
              ? trimmed[0].server_sequence
              : current.oldestLoaded,
            hasMoreHistory: trimmed.length < updated.length
              ? true
              : current.hasMoreHistory
          }
        }
      }
    })
  },

  updateMessage: (channelId: string, messageId: string, updates: Partial<ChatMessage>) => {
    set((state) => {
      const current = state.channelMessages[channelId]
      if (!current) return state

      const updatedMessages = current.messages.map(m =>
        m.id === messageId ? { ...m, ...updates } : m
      )

      return {
        channelMessages: {
          ...state.channelMessages,
          [channelId]: { ...current, messages: updatedMessages }
        }
      }
    })
  },

  removeMessage: (channelId: string, messageId: string) => {
    set((state) => {
      const current = state.channelMessages[channelId]
      if (!current) return state

      const filteredMessages = current.messages.filter(m => m.id !== messageId)

      return {
        channelMessages: {
          ...state.channelMessages,
          [channelId]: { ...current, messages: filteredMessages }
        }
      }
    })
  },

  addReaction: (channelId: string, messageId: string, emoji: string, userPubkey: string) => {
    set((state) => {
      const current = state.channelMessages[channelId]
      if (!current) return state

      const updatedMessages = current.messages.map(m => {
        if (m.id !== messageId) return m

        const existingReaction = m.reactions.find(r => r.emoji === emoji)
        if (existingReaction) {
          // Check if user already reacted
          if (existingReaction.user_pubkeys.includes(userPubkey)) return m
          return {
            ...m,
            reactions: m.reactions.map(r =>
              r.emoji === emoji
                ? {
                    ...r,
                    count: r.count + 1,
                    user_pubkeys: [...r.user_pubkeys, userPubkey]
                  }
                : r
            )
          }
        }

        // New reaction type
        return {
          ...m,
          reactions: [...m.reactions, { emoji, count: 1, user_pubkeys: [userPubkey] }]
        }
      })

      return {
        channelMessages: {
          ...state.channelMessages,
          [channelId]: { ...current, messages: updatedMessages }
        }
      }
    })
  },

  removeReaction: (channelId: string, messageId: string, emoji: string, userPubkey: string) => {
    set((state) => {
      const current = state.channelMessages[channelId]
      if (!current) return state

      const updatedMessages = current.messages.map(m => {
        if (m.id !== messageId) return m

        const updatedReactions = m.reactions
          .map(r => {
            if (r.emoji !== emoji) return r
            const filteredUsers = r.user_pubkeys.filter(pk => pk !== userPubkey)
            return {
              ...r,
              count: filteredUsers.length,
              user_pubkeys: filteredUsers
            }
          })
          .filter(r => r.count > 0)

        return { ...m, reactions: updatedReactions }
      })

      return {
        channelMessages: {
          ...state.channelMessages,
          [channelId]: { ...current, messages: updatedMessages }
        }
      }
    })
  },

  markChannelRead: (channelId: string) => {
    const current = get().channelMessages[channelId]
    if (!current || !current.newestLoaded) return

    const newestSeq = current.newestLoaded
    set((state) => ({
      channelMessages: {
        ...state.channelMessages,
        [channelId]: {
          ...state.channelMessages[channelId],
          lastReadSequence: newestSeq
        }
      }
    }))

    // Persist to server (fire and forget)
    window.united.lastRead.update(channelId, newestSeq).catch(() => {})
  },

  getUnreadCount: (channelId: string) => {
    const channel = get().channelMessages[channelId]
    if (!channel) return 0
    return channel.messages.filter(
      m => m.server_sequence > channel.lastReadSequence
    ).length
  },

  clearChannelMessages: (channelId: string) => {
    set((state) => {
      const { [channelId]: _, ...rest } = state.channelMessages
      return { channelMessages: rest }
    })
  }
})
