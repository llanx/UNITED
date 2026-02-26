/**
 * Prefetch hooks for channel hover and app launch.
 *
 * - prefetchOnHover: 200ms debounced prefetch of last 20 messages on channel hover
 * - cancelPrefetch: cancel in-flight debounce on mouseLeave
 * - useAppLaunchPrefetch: one-time prefetch of last-viewed + most active channel on startup
 *
 * All prefetching is text + metadata only (no full media per CONTEXT.md).
 * Silent failure -- prefetch errors are swallowed.
 */

import { useRef, useEffect } from 'react'
import { useStore } from '../stores'

/** Number of messages to prefetch per channel */
const PREFETCH_LIMIT = 20

/** Debounce delay for hover prefetch (ms) */
const HOVER_DEBOUNCE_MS = 200

/**
 * Hook providing channel hover prefetch with 200ms debounce.
 *
 * Usage:
 * ```tsx
 * const { prefetchOnHover, cancelPrefetch } = usePrefetch()
 * <div onMouseEnter={() => prefetchOnHover(id)} onMouseLeave={cancelPrefetch}>
 * ```
 */
export function usePrefetch() {
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prefetchOnHover = (channelId: string) => {
    // Clear any existing debounce
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current)
    }

    prefetchTimeoutRef.current = setTimeout(() => {
      const state = useStore.getState()

      // Skip if already loaded or already prefetched
      const existing = state.channelMessages[channelId]
      if (existing && existing.messages.length > 0) return
      if (state.prefetchedChannels.has(channelId)) return

      // Fetch silently -- no UI loading state
      window.united.chat.fetchHistory(channelId, undefined, PREFETCH_LIMIT)
        .then((result) => {
          useStore.getState().prefetchMessages(channelId, result.messages)
        })
        .catch(() => {
          // Silent failure per spec
        })
    }, HOVER_DEBOUNCE_MS)
  }

  const cancelPrefetch = () => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current)
      prefetchTimeoutRef.current = null
    }
  }

  return { prefetchOnHover, cancelPrefetch }
}

// ============================================================
// App launch prefetch
// ============================================================

/** Module-level flag to prevent double execution in React Strict Mode */
let appLaunchPrefetchExecuted = false

/**
 * One-time prefetch on app startup.
 *
 * Prefetches the last-viewed channel (from localStorage) and the most active
 * channel (first channel in the list, typically #general).
 *
 * Runs once per app lifecycle. Text + metadata only.
 */
export function useAppLaunchPrefetch() {
  useEffect(() => {
    if (appLaunchPrefetchExecuted) return
    appLaunchPrefetchExecuted = true

    const doPrefetch = async () => {
      const state = useStore.getState()
      const channelsToPrefetch: string[] = []

      // 1. Last-viewed channel from localStorage
      try {
        const lastViewed = localStorage.getItem('united-last-viewed-channel')
        if (lastViewed && !state.channelMessages[lastViewed]?.messages.length) {
          channelsToPrefetch.push(lastViewed)
        }
      } catch {
        // localStorage may be unavailable
      }

      // 2. Most active channel: pick first channel from categories (typically #general)
      for (const cwc of state.categoriesWithChannels) {
        const sorted = [...cwc.channels].sort((a, b) => a.position - b.position)
        if (sorted.length > 0) {
          const firstChannelId = sorted[0].id
          if (!channelsToPrefetch.includes(firstChannelId) &&
              !state.channelMessages[firstChannelId]?.messages.length) {
            channelsToPrefetch.push(firstChannelId)
          }
          break
        }
      }

      // Prefetch up to 2 channels silently
      for (const channelId of channelsToPrefetch.slice(0, 2)) {
        try {
          const result = await window.united.chat.fetchHistory(channelId, undefined, PREFETCH_LIMIT)
          useStore.getState().prefetchMessages(channelId, result.messages)
        } catch {
          // Silent failure
        }
      }
    }

    doPrefetch()
  }, [])
}
