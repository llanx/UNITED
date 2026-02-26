/**
 * Zustand slice for DM conversations and per-conversation messages.
 *
 * Stores conversations ordered by most recent activity, messages indexed
 * by conversation ID with windowed arrays (max 200 per conversation),
 * deduplication by serverSequence, and per-conversation unread counts.
 */

import type { StateCreator } from 'zustand'
import type { DmConversation, DecryptedDmMessage } from '@shared/ipc-bridge'
import type { RootStore } from './index'

/** Max messages kept in memory per DM conversation (lower volume than channels) */
const MAX_DM_MESSAGES = 200

/** Default page size for DM history fetches */
const DEFAULT_DM_PAGE_SIZE = 50

export interface ConversationMessages {
  messages: DecryptedDmMessage[]
  oldestLoaded: number | null
  newestLoaded: number | null
  hasMoreHistory: boolean
  loading: boolean
}

export interface DmSlice {
  // State
  dmConversations: DmConversation[]
  dmMessages: Record<string, ConversationMessages>
  activeDmConversationId: string | null
  dmUnreadCounts: Record<string, number>
  dmView: boolean
  dmEncryptionBannerDismissed: boolean
  dmKeyStatus: Record<string, boolean>
  dmConversationsLoaded: boolean

  // Actions
  loadConversations: () => Promise<void>
  setActiveDmConversation: (id: string | null) => void
  setDmView: (active: boolean) => void
  loadDmMessages: (conversationId: string, recipientPubkey: string) => Promise<void>
  loadOlderDmMessages: (conversationId: string, recipientPubkey: string) => Promise<void>
  appendDmMessage: (conversationId: string, message: DecryptedDmMessage) => void
  createConversation: (recipientPubkey: string) => Promise<DmConversation>
  sendDmMessage: (conversationId: string, recipientPubkey: string, content: string) => Promise<void>
  deleteLocalDmMessage: (conversationId: string, messageId: string) => void
  dismissEncryptionBanner: () => void
  checkPeerKeyStatus: (peerPubkey: string) => Promise<boolean>
  incrementDmUnread: (conversationId: string) => void
  clearDmUnread: (conversationId: string) => void
  getTotalDmUnread: () => number
}

function emptyConversationMessages(): ConversationMessages {
  return {
    messages: [],
    oldestLoaded: null,
    newestLoaded: null,
    hasMoreHistory: true,
    loading: false
  }
}

/**
 * Sort conversations by lastMessageAt DESC (most recent first).
 */
function sortConversations(convs: DmConversation[]): DmConversation[] {
  return [...convs].sort((a, b) => b.lastMessageAt - a.lastMessageAt)
}

export const createDmSlice: StateCreator<RootStore, [], [], DmSlice> = (set, get) => ({
  // Initial state
  dmConversations: [],
  dmMessages: {},
  activeDmConversationId: null,
  dmUnreadCounts: {},
  dmView: false,
  dmEncryptionBannerDismissed: false,
  dmKeyStatus: {},
  dmConversationsLoaded: false,

  loadConversations: async () => {
    try {
      const conversations = await window.united.dm.listConversations()
      set({ dmConversations: sortConversations(conversations), dmConversationsLoaded: true })
    } catch (err) {
      console.error('Failed to load DM conversations:', err)
    }
  },

  setActiveDmConversation: (id: string | null) => {
    set({ activeDmConversationId: id })
    if (id) {
      // Clear unread count for this conversation when opened
      set((state) => {
        const { [id]: _, ...rest } = state.dmUnreadCounts
        return { dmUnreadCounts: rest }
      })
    }
  },

  setDmView: (active: boolean) => {
    set({ dmView: active })
  },

  loadDmMessages: async (conversationId: string, recipientPubkey: string) => {
    const existing = get().dmMessages[conversationId]
    if (existing && existing.messages.length > 0) return // Already loaded
    if (existing?.loading) return // Already loading

    set((state) => ({
      dmMessages: {
        ...state.dmMessages,
        [conversationId]: {
          ...(state.dmMessages[conversationId] || emptyConversationMessages()),
          loading: true
        }
      }
    }))

    try {
      const result = await window.united.dm.fetchHistory(
        conversationId,
        recipientPubkey,
        undefined,
        DEFAULT_DM_PAGE_SIZE
      )

      const sorted = result.messages.sort(
        (a, b) => a.serverSequence - b.serverSequence
      )

      set((state) => ({
        dmMessages: {
          ...state.dmMessages,
          [conversationId]: {
            messages: sorted,
            oldestLoaded: sorted.length > 0
              ? sorted[0].serverSequence
              : null,
            newestLoaded: sorted.length > 0
              ? sorted[sorted.length - 1].serverSequence
              : null,
            hasMoreHistory: result.hasMore,
            loading: false
          }
        }
      }))
    } catch (err) {
      console.error(`Failed to load DM messages for ${conversationId}:`, err)
      set((state) => ({
        dmMessages: {
          ...state.dmMessages,
          [conversationId]: {
            ...(state.dmMessages[conversationId] || emptyConversationMessages()),
            loading: false
          }
        }
      }))
    }
  },

  loadOlderDmMessages: async (conversationId: string, recipientPubkey: string) => {
    const conv = get().dmMessages[conversationId]
    if (!conv || !conv.hasMoreHistory || conv.loading) return

    set((state) => ({
      dmMessages: {
        ...state.dmMessages,
        [conversationId]: { ...state.dmMessages[conversationId], loading: true }
      }
    }))

    try {
      const result = await window.united.dm.fetchHistory(
        conversationId,
        recipientPubkey,
        conv.oldestLoaded ?? undefined,
        DEFAULT_DM_PAGE_SIZE
      )

      const sortedNew = result.messages.sort(
        (a, b) => a.serverSequence - b.serverSequence
      )

      set((state) => {
        const current = state.dmMessages[conversationId]
        if (!current) return state

        // Deduplicate by serverSequence
        const existingSeqs = new Set(current.messages.map(m => m.serverSequence))
        const unique = sortedNew.filter(m => !existingSeqs.has(m.serverSequence))

        const merged = [...unique, ...current.messages]

        // Trim from newest end if over cap
        const trimmed = merged.length > MAX_DM_MESSAGES
          ? merged.slice(0, MAX_DM_MESSAGES)
          : merged

        return {
          dmMessages: {
            ...state.dmMessages,
            [conversationId]: {
              ...current,
              messages: trimmed,
              oldestLoaded: trimmed.length > 0
                ? trimmed[0].serverSequence
                : current.oldestLoaded,
              hasMoreHistory: result.hasMore,
              loading: false
            }
          }
        }
      })
    } catch (err) {
      console.error(`Failed to load older DM messages for ${conversationId}:`, err)
      set((state) => ({
        dmMessages: {
          ...state.dmMessages,
          [conversationId]: { ...state.dmMessages[conversationId], loading: false }
        }
      }))
    }
  },

  appendDmMessage: (conversationId: string, message: DecryptedDmMessage) => {
    set((state) => {
      const current = state.dmMessages[conversationId] || emptyConversationMessages()

      // Deduplicate: check if message with this serverSequence already exists
      if (current.messages.some(m => m.serverSequence === message.serverSequence)) {
        return state
      }

      const updated = [...current.messages, message]

      // Trim from oldest end if over cap
      const trimmed = updated.length > MAX_DM_MESSAGES
        ? updated.slice(updated.length - MAX_DM_MESSAGES)
        : updated

      // Update the conversation's lastMessageAt and reorder the list
      const updatedConversations = state.dmConversations.map(conv =>
        conv.id === conversationId
          ? { ...conv, lastMessageAt: message.timestamp }
          : conv
      )

      return {
        dmMessages: {
          ...state.dmMessages,
          [conversationId]: {
            ...current,
            messages: trimmed,
            newestLoaded: message.serverSequence,
            oldestLoaded: trimmed.length > 0
              ? trimmed[0].serverSequence
              : current.oldestLoaded,
            hasMoreHistory: trimmed.length < updated.length
              ? true
              : current.hasMoreHistory
          }
        },
        dmConversations: sortConversations(updatedConversations)
      }
    })
  },

  createConversation: async (recipientPubkey: string) => {
    const conversation = await window.united.dm.createConversation(recipientPubkey)
    set((state) => ({
      dmConversations: sortConversations([conversation, ...state.dmConversations])
    }))
    return conversation
  },

  sendDmMessage: async (conversationId: string, recipientPubkey: string, content: string) => {
    const result = await window.united.dm.sendMessage(conversationId, recipientPubkey, content)

    // Check if it's an error response
    if ('error' in result) {
      throw new Error(result.message)
    }

    // Append the sent message to the store
    get().appendDmMessage(conversationId, result as DecryptedDmMessage)
  },

  deleteLocalDmMessage: (conversationId: string, messageId: string) => {
    // Remove from local state
    set((state) => {
      const current = state.dmMessages[conversationId]
      if (!current) return state

      return {
        dmMessages: {
          ...state.dmMessages,
          [conversationId]: {
            ...current,
            messages: current.messages.filter(m => m.id !== messageId)
          }
        }
      }
    })

    // Also request deletion from local SQLite (fire and forget)
    window.united.dm.deleteLocal(conversationId, messageId).catch(() => {})
  },

  dismissEncryptionBanner: () => {
    set({ dmEncryptionBannerDismissed: true })
    // Persist to cache
    window.united.storage.setCachedState('dm_banner_dismissed', true).catch(() => {})
  },

  checkPeerKeyStatus: async (peerPubkey: string) => {
    try {
      const result = await window.united.dm.getPeerKeyStatus(peerPubkey)
      set((state) => ({
        dmKeyStatus: { ...state.dmKeyStatus, [peerPubkey]: result.available }
      }))
      return result.available
    } catch (err) {
      console.error('Failed to check peer key status:', err)
      return false
    }
  },

  incrementDmUnread: (conversationId: string) => {
    set((state) => ({
      dmUnreadCounts: {
        ...state.dmUnreadCounts,
        [conversationId]: (state.dmUnreadCounts[conversationId] || 0) + 1
      }
    }))
  },

  clearDmUnread: (conversationId: string) => {
    set((state) => {
      const { [conversationId]: _, ...rest } = state.dmUnreadCounts
      return { dmUnreadCounts: rest }
    })
  },

  getTotalDmUnread: () => {
    const counts = get().dmUnreadCounts
    return Object.values(counts).reduce((sum, count) => sum + count, 0)
  }
})
