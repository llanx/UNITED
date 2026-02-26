/**
 * P2P stats aggregation and push pipeline from main process.
 *
 * Collects peer, topic, NAT, and connection data from the libp2p node
 * and pushes P2PStats snapshots to all renderer windows at 2-second intervals.
 * Zero overhead when the dev panel is closed (interval check returns early).
 */

import { BrowserWindow } from 'electron'
import { IPC } from '../ipc/channels'
import { getP2PNode, getServerPeerId } from './node'
import { getTopicStats } from './gossipsub'
import type { P2PStats, PeerInfo } from './types'

// ============================================================
// Panel state tracking
// ============================================================

let panelOpen = false
let statsInterval: ReturnType<typeof setInterval> | null = null

/**
 * Notify the stats pipeline that the dev panel opened.
 */
export function onPanelOpen(): void {
  panelOpen = true
}

/**
 * Notify the stats pipeline that the dev panel closed.
 */
export function onPanelClose(): void {
  panelOpen = false
}

/**
 * Check whether the dev panel is currently open.
 */
export function isPanelOpen(): boolean {
  return panelOpen
}

// ============================================================
// Stats aggregation
// ============================================================

/**
 * Build a P2PStats snapshot from the current libp2p node state.
 *
 * If no node is running, returns empty stats.
 */
export function buildP2PStats(): P2PStats {
  const node = getP2PNode()
  if (!node) {
    return {
      peers: [],
      topics: [],
      natType: 'unknown',
      isConnected: false,
      serverPeerId: ''
    }
  }

  const connections = node.getConnections()
  const serverPeerId = getServerPeerId() || ''

  const peers: PeerInfo[] = connections.map(conn => ({
    unitedId: '',
    peerId: conn.remotePeer.toString(),
    multiaddrs: [conn.remoteAddr.toString()],
    channels: [],
    natType: 'unknown' as const,
    connectionType: conn.remoteAddr.toString().includes('/p2p-circuit/')
      ? 'relayed' as const
      : 'direct' as const
  }))

  return {
    peers,
    topics: getTopicStats(),
    natType: 'unknown',
    isConnected: connections.length > 0,
    serverPeerId
  }
}

// ============================================================
// Push pipeline
// ============================================================

/**
 * Start pushing P2PStats to all renderer windows at 2-second intervals.
 *
 * The interval runs continuously but only builds and sends stats when
 * the dev panel is open. This ensures zero IPC overhead when closed.
 */
export function startStatsPush(): void {
  if (statsInterval) return

  statsInterval = setInterval(() => {
    if (!panelOpen) return

    const stats = buildP2PStats()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PUSH_P2P_STATS, stats)
    }
  }, 2000)
}

/**
 * Stop the stats push interval.
 */
export function stopStatsPush(): void {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
}
