/**
 * Hook that subscribes to network stats push events from the main process.
 *
 * On mount: fetches initial stats and subscribes to periodic updates (every 5s).
 * On unmount: cleans up the subscription.
 *
 * Stats are private only -- never exposed to other users.
 */

import { useEffect } from 'react'
import { useStore } from '../stores'

export function useNetworkStats(): void {
  const setNetworkStats = useStore((s) => s.setNetworkStats)

  useEffect(() => {
    // Fetch initial stats on mount
    window.united.stats.getNetworkStats()
      .then((stats) => setNetworkStats(stats))
      .catch(() => {
        // Stats may not be available yet
      })

    // Subscribe to periodic push updates
    const cleanup = window.united.stats.onNetworkStats((stats) => {
      setNetworkStats(stats)
    })

    return cleanup
  }, [setNetworkStats])
}
