/**
 * Hook for message subscription and scroll management.
 *
 * On mount: loads messages if channel not yet loaded.
 * Sets up IPC listener for PUSH_CHAT_EVENT.
 * Returns messages, loading state, and loadOlder function.
 * Cleans up listener on unmount.
 */

import { useEffect, useCallback, useMemo } from 'react'
import { useStore } from '../stores'
import type { ChatEvent } from '@shared/ipc-bridge'

export function useMessages(channelId: string | null) {
  const channelMessages = useStore((s) => channelId ? s.channelMessages[channelId] : undefined)
  const loadMessages = useStore((s) => s.loadMessages)
  const loadOlderMessages = useStore((s) => s.loadOlderMessages)
  const appendMessage = useStore((s) => s.appendMessage)
  const updateMessage = useStore((s) => s.updateMessage)
  const removeMessage = useStore((s) => s.removeMessage)
  const addReaction = useStore((s) => s.addReaction)
  const removeReaction = useStore((s) => s.removeReaction)
  const markChannelRead = useStore((s) => s.markChannelRead)

  // Load messages on mount if not already loaded
  useEffect(() => {
    if (!channelId) return
    loadMessages(channelId)
  }, [channelId, loadMessages])

  // Listen for push chat events from main process
  useEffect(() => {
    if (!channelId) return

    const cleanup = window.united.onChatEvent((event: ChatEvent) => {
      switch (event.type) {
        case 'new':
          if (event.message && event.message.channel_id === channelId) {
            appendMessage(channelId, event.message)
          } else if (event.message) {
            // Message for another channel -- still append to that channel's store
            appendMessage(event.message.channel_id, event.message)
          }
          break

        case 'edited':
          if (event.channelId === channelId && event.messageId) {
            updateMessage(channelId, event.messageId, {
              content: event.newContent ?? '',
              edited_at: event.editTimestamp ?? new Date().toISOString()
            })
          }
          break

        case 'deleted':
          if (event.channelId === channelId && event.messageId) {
            removeMessage(channelId, event.messageId)
          }
          break

        case 'reaction-added':
          if (event.messageId && event.emoji && event.userPubkey) {
            // Find which channel the message belongs to
            addReaction(channelId, event.messageId, event.emoji, event.userPubkey)
          }
          break

        case 'reaction-removed':
          if (event.messageId && event.emoji && event.userPubkey) {
            removeReaction(channelId, event.messageId, event.emoji, event.userPubkey)
          }
          break
      }
    })

    return cleanup
  }, [channelId, appendMessage, updateMessage, removeMessage, addReaction, removeReaction])

  // Mark channel as read when viewing messages
  useEffect(() => {
    if (!channelId) return
    markChannelRead(channelId)
  }, [channelId, channelMessages?.newestLoaded, markChannelRead])

  const loadOlder = useCallback(() => {
    if (channelId) loadOlderMessages(channelId)
  }, [channelId, loadOlderMessages])

  const messages = useMemo(
    () => channelMessages?.messages ?? [],
    [channelMessages?.messages]
  )

  return {
    messages,
    hasMore: channelMessages?.hasMoreHistory ?? false,
    loading: channelMessages?.loading ?? false,
    loadOlder,
    unreadCount: channelId ? useStore.getState().getUnreadCount(channelId) : 0
  }
}
