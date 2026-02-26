/**
 * Hook for presence and typing indicator subscriptions.
 *
 * Sets up IPC listeners for PUSH_PRESENCE_EVENT and PUSH_TYPING_EVENT.
 * Updates presence and typing stores. Handles typing timeout cleanup.
 */

import { useEffect } from 'react'
import { useStore } from '../stores'
import type { PresenceUpdate, TypingEvent } from '@shared/ipc-bridge'

/**
 * Subscribe to presence and typing events from the main process.
 * Should be mounted once at the app level.
 */
export function usePresence() {
  const setPresence = useStore((s) => s.setPresence)
  const addTypingUser = useStore((s) => s.addTypingUser)
  const userPresence = useStore((s) => s.userPresence)
  const typingUsers = useStore((s) => s.typingUsers)

  // Listen for presence updates
  useEffect(() => {
    const cleanupPresence = window.united.onPresenceEvent((event: PresenceUpdate) => {
      setPresence(event.userPubkey, event.status, event.displayName)
    })

    const cleanupTyping = window.united.onTypingEvent((event: TypingEvent) => {
      addTypingUser(event.channelId, event.userId, event.displayName)
    })

    return () => {
      cleanupPresence()
      cleanupTyping()
    }
  }, [setPresence, addTypingUser])

  return {
    userPresence,
    typingUsers
  }
}

/**
 * Get typing users for a specific channel.
 * Returns an array of display names for the typing indicator.
 */
export function useTypingIndicator(channelId: string | null) {
  const typingUsers = useStore((s) =>
    channelId ? (s.typingUsers[channelId] ?? []) : []
  )

  if (typingUsers.length === 0) return null
  if (typingUsers.length === 1) return `${typingUsers[0].displayName} is typing...`
  if (typingUsers.length === 2) {
    return `${typingUsers[0].displayName} and ${typingUsers[1].displayName} are typing...`
  }
  return 'Several people are typing...'
}
