/**
 * Zustand slice for network stats state.
 *
 * Tracks P2P network activity (upload/download totals, speed, blocks seeded)
 * and status bar visibility preference. Stats are private only.
 */

import type { StateCreator } from 'zustand'
import type { NetworkStats } from '@shared/ipc-bridge'
import type { RootStore } from './index'

const STORAGE_KEY = 'united-show-status-bar'

export interface NetworkSlice {
  /** Current network stats snapshot (null before first update) */
  networkStats: NetworkStats | null
  /** Whether the compact status bar indicator is visible */
  showStatusBar: boolean
  /** Update network stats from push event */
  setNetworkStats: (stats: NetworkStats) => void
  /** Toggle status bar visibility (persisted to localStorage) */
  toggleStatusBar: () => void
}

export const createNetworkSlice: StateCreator<RootStore, [], [], NetworkSlice> = (set) => ({
  networkStats: null,
  showStatusBar: (() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })(),

  setNetworkStats: (stats: NetworkStats) => {
    set({ networkStats: stats })
  },

  toggleStatusBar: () => {
    set((state) => {
      const next = !state.showStatusBar
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // localStorage may be unavailable
      }
      return { showStatusBar: next }
    })
  },
})
