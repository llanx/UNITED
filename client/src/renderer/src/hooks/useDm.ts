/**
 * Hooks for DM subscription, message loading, and send.
 *
 * useDm: Main hook for DM conversation state and real-time events.
 * useDmKeyStatus: Check if a peer has published X25519 keys.
 */

import { useEffect, useCallback, useMemo, useState } from 'react'
import { useStore } from '../stores'
import type { DmEvent, DecryptedDmMessage } from '@shared/ipc-bridge'

/**
 * Main DM hook: manages conversation list, messages, and real-time events.
 *
 * @param conversationId - Active conversation ID (null if none selected)
 */
export function useDm(conversationId?: string) {
  const dmConversations = useStore((s) => s.dmConversations)
  const dmConversationsLoaded = useStore((s) => s.dmConversationsLoaded)
  const conversationMessages = useStore((s) =>
    conversationId ? s.dmMessages[conversationId] : undefined
  )
  const loadConversations = useStore((s) => s.loadConversations)
  const loadDmMessages = useStore((s) => s.loadDmMessages)
  const loadOlderDmMessages = useStore((s) => s.loadOlderDmMessages)
  const appendDmMessage = useStore((s) => s.appendDmMessage)
  const sendDmMessage = useStore((s) => s.sendDmMessage)
  const incrementDmUnread = useStore((s) => s.incrementDmUnread)
  const clearDmUnread = useStore((s) => s.clearDmUnread)
  const activeDmConversationId = useStore((s) => s.activeDmConversationId)
  const getTotalDmUnread = useStore((s) => s.getTotalDmUnread)

  // Load conversations on mount if not yet loaded
  useEffect(() => {
    if (!dmConversationsLoaded) {
      loadConversations()
    }
  }, [dmConversationsLoaded, loadConversations])

  // Set up IPC listener for DM push events
  useEffect(() => {
    const cleanup = window.united.dm.onDmEvent((event: DmEvent) => {
      switch (event.type) {
        case 'new': {
          if (!event.message) break
          const msg = event.message

          // Append message to the correct conversation
          appendDmMessage(msg.conversationId, msg)

          // If this conversation is not active, increment unread
          if (msg.conversationId !== activeDmConversationId) {
            incrementDmUnread(msg.conversationId)
          }

          // If conversation is not in the list, re-fetch conversations
          const convExists = useStore.getState().dmConversations.some(
            c => c.id === msg.conversationId
          )
          if (!convExists) {
            loadConversations()
          }
          break
        }

        case 'conversation-created': {
          if (event.conversation) {
            // Add new conversation to the list (loadConversations will re-sort)
            loadConversations()
          }
          break
        }

        case 'key-rotated': {
          // Key rotation handled by the dm-events.ts module clearing the cache.
          // The UI might want to show a system message -- for now just log it.
          console.log('[DM] Key rotated for user:', event.userPubkey)
          break
        }
      }
    })

    return cleanup
  }, [activeDmConversationId, appendDmMessage, incrementDmUnread, loadConversations])

  // Clear unread count when viewing a conversation
  useEffect(() => {
    if (conversationId) {
      clearDmUnread(conversationId)
    }
  }, [conversationId, clearDmUnread])

  const loadOlder = useCallback(
    (recipientPubkey: string) => {
      if (conversationId) {
        loadOlderDmMessages(conversationId, recipientPubkey)
      }
    },
    [conversationId, loadOlderDmMessages]
  )

  const send = useCallback(
    async (recipientPubkey: string, content: string) => {
      if (conversationId) {
        await sendDmMessage(conversationId, recipientPubkey, content)
      }
    },
    [conversationId, sendDmMessage]
  )

  const messages = useMemo(
    () => conversationMessages?.messages ?? [],
    [conversationMessages?.messages]
  )

  return {
    conversations: dmConversations,
    messages,
    hasMore: conversationMessages?.hasMoreHistory ?? false,
    loading: conversationMessages?.loading ?? false,
    loadMessages: loadDmMessages,
    loadOlder,
    send,
    totalUnread: getTotalDmUnread()
  }
}

/**
 * Hook to check if a peer has published an X25519 key for DM encryption.
 *
 * @param peerPubkey - Ed25519 public key of the peer
 */
export function useDmKeyStatus(peerPubkey: string) {
  const [loading, setLoading] = useState(true)
  const keyAvailable = useStore((s) => s.dmKeyStatus[peerPubkey] ?? false)
  const checkPeerKeyStatus = useStore((s) => s.checkPeerKeyStatus)

  useEffect(() => {
    if (!peerPubkey) {
      setLoading(false)
      return
    }

    setLoading(true)
    checkPeerKeyStatus(peerPubkey).finally(() => setLoading(false))
  }, [peerPubkey, checkPeerKeyStatus])

  return { keyAvailable, loading }
}
