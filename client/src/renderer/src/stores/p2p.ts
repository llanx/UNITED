/**
 * Zustand slice for P2P mesh state.
 *
 * Stores live P2P stats pushed from the main process (peers, topics, NAT type,
 * connection status) and manages the dev panel open/close state. The panel
 * open/close actions notify the main process via IPC to start/stop the stats push.
 */

import type { StateCreator } from 'zustand'
import type { RootStore } from './index'
import type { P2PPeerInfo, P2PTopicStats, P2PStats } from '@shared/ipc-bridge'

export interface P2PSlice {
  // State
  peers: P2PPeerInfo[]
  topics: P2PTopicStats[]
  natType: string
  isConnected: boolean
  serverPeerId: string
  devPanelOpen: boolean

  // Actions
  setP2PStats: (stats: P2PStats) => void
  toggleDevPanel: () => void
  setDevPanelOpen: (open: boolean) => void
}

export const createP2PSlice: StateCreator<RootStore, [], [], P2PSlice> = (set, get) => ({
  // Initial state
  peers: [],
  topics: [],
  natType: 'unknown',
  isConnected: false,
  serverPeerId: '',
  devPanelOpen: false,

  // Update all stats from a push event
  setP2PStats: (stats: P2PStats) => set({
    peers: stats.peers,
    topics: stats.topics,
    natType: stats.natType,
    isConnected: stats.isConnected,
    serverPeerId: stats.serverPeerId
  }),

  // Toggle the dev panel and notify main process
  toggleDevPanel: () => {
    const current = get().devPanelOpen
    const next = !current
    set({ devPanelOpen: next })

    if (next) {
      window.united.p2p.openPanel()
    } else {
      window.united.p2p.closePanel()
    }
  },

  // Set dev panel open state explicitly
  setDevPanelOpen: (open: boolean) => {
    set({ devPanelOpen: open })

    if (open) {
      window.united.p2p.openPanel()
    } else {
      window.united.p2p.closePanel()
    }
  }
})
