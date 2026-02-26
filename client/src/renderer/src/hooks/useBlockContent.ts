/**
 * React hook for resolving block content with progressive loading feedback.
 *
 * Resolves a content-addressed block via IPC with progressive timeout states:
 *   0-3s:  'cache' (shimmer placeholder)
 *   3-15s: 'fetching' ("Fetching from network..." text)
 *   15s+:  'unavailable' (error state with retry button)
 *
 * Supports retry which re-triggers the full resolution cascade.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export type BlockLoadingProgress = 'cache' | 'fetching' | 'unavailable'

export interface UseBlockContentResult {
  /** Overall resolution status */
  status: 'idle' | 'loading' | 'loaded' | 'error'
  /** Base64-encoded block data (when loaded) */
  data: string | null
  /** Progressive feedback state for UI rendering */
  progress: BlockLoadingProgress
  /** Re-trigger the full resolution cascade */
  retry: () => void
}

/** Time before transitioning from shimmer to "Fetching..." */
const FETCHING_DELAY_MS = 3_000
/** Time before showing "Content unavailable" */
const UNAVAILABLE_DELAY_MS = 15_000

export function useBlockContent(hash: string | null): UseBlockContentResult {
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>(
    hash ? 'loading' : 'idle'
  )
  const [data, setData] = useState<string | null>(null)
  const [progress, setProgress] = useState<BlockLoadingProgress>('cache')

  // Track timeouts for cleanup
  const fetchingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unavailableTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track the hash being resolved to avoid stale updates
  const activeHashRef = useRef<string | null>(null)
  // Counter to trigger retries
  const [retryCount, setRetryCount] = useState(0)

  const clearTimeouts = useCallback(() => {
    if (fetchingTimeoutRef.current) {
      clearTimeout(fetchingTimeoutRef.current)
      fetchingTimeoutRef.current = null
    }
    if (unavailableTimeoutRef.current) {
      clearTimeout(unavailableTimeoutRef.current)
      unavailableTimeoutRef.current = null
    }
  }, [])

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1)
  }, [])

  useEffect(() => {
    if (!hash) {
      setStatus('idle')
      setData(null)
      setProgress('cache')
      clearTimeouts()
      return
    }

    // Reset state for new resolution
    activeHashRef.current = hash
    setStatus('loading')
    setData(null)
    setProgress('cache')
    clearTimeouts()

    // Set up progressive timeout transitions
    fetchingTimeoutRef.current = setTimeout(() => {
      if (activeHashRef.current === hash) {
        setProgress('fetching')
      }
    }, FETCHING_DELAY_MS)

    unavailableTimeoutRef.current = setTimeout(() => {
      if (activeHashRef.current === hash) {
        setProgress('unavailable')
        setStatus('error')
      }
    }, UNAVAILABLE_DELAY_MS)

    // Resolve block via IPC
    let cancelled = false
    window.united.blocks.resolveBlock(hash).then((result) => {
      if (cancelled || activeHashRef.current !== hash) return

      if (result) {
        clearTimeouts()
        setData(result)
        setStatus('loaded')
        setProgress('cache') // Reset progress on success
      } else {
        // Block not found via cascade -- wait for timeout transitions
        // The unavailable timeout will eventually set error state
      }
    }).catch(() => {
      if (cancelled || activeHashRef.current !== hash) return
      // IPC error -- let timeout handle the transition to unavailable
    })

    return () => {
      cancelled = true
      clearTimeouts()
    }
  }, [hash, retryCount, clearTimeouts])

  return { status, data, progress, retry }
}
