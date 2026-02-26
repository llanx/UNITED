/**
 * IPC handlers for P2P operations.
 *
 * Exposes the P2P control surface to the renderer process via IPC:
 * start/stop mesh, send test messages, ping peers, get stats.
 */

import { BrowserWindow, type IpcMain } from 'electron'
import { IPC } from './channels'
import { getSessionKeys, bufToHex } from './crypto'
import { getAccessToken, getServerUrl } from './auth'
import { startP2PNode, stopP2PNode, getP2PNode, getServerPeerId } from '../p2p/node'
import {
  subscribeToChannels,
  subscribeToChannel,
  unsubscribeFromChannel,
  publishMessage,
  setupMessageHandler,
  getTopicStats,
  computeTopic
} from '../p2p/gossipsub'
import {
  discoverAndConnectPeers,
  registerPeerIdWithServer,
  setupReconnection,
  setupWsP2PListener,
  clearReconnectionState
} from '../p2p/discovery'
import { MessageType } from '@shared/generated/p2p_pb'
import type { P2PStats, PeerInfo, GossipMessage } from '../p2p/types'

// ============================================================
// State tracking
// ============================================================

let devPanelOpen = false
let statsInterval: ReturnType<typeof setInterval> | null = null
let serverFingerprint: string | null = null
let currentChannelIds: string[] = []

/**
 * Initialize the P2P WS listener for handling directory/register responses.
 * Must be called once during app startup.
 */
export function initP2PListener(): void {
  setupWsP2PListener()
}

// ============================================================
// Stats pushing
// ============================================================

function buildP2PStats(): P2PStats {
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
  const peers: PeerInfo[] = connections.map(conn => ({
    unitedId: '', // Would need directory lookup
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
    natType: 'unknown', // Would need AutoNAT
    isConnected: connections.length > 0,
    serverPeerId: getServerPeerId() || ''
  }
}

function startStatsPush(): void {
  if (statsInterval) return
  statsInterval = setInterval(() => {
    if (!devPanelOpen) return
    const stats = buildP2PStats()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PUSH_P2P_STATS, stats)
    }
  }, 2000)
}

function stopStatsPush(): void {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
}

// ============================================================
// IPC handler registration
// ============================================================

export function registerP2PHandlers(ipcMain: IpcMain): void {
  // Start the P2P mesh
  ipcMain.handle(IPC.P2P_START_MESH, async (): Promise<{ peerId: string }> => {
    const url = getServerUrl()
    if (!url) throw new Error('Not connected to a server')

    // Start the P2P node
    const peerId = await startP2PNode(url)

    const node = getP2PNode()
    if (!node) throw new Error('P2P node failed to start')

    // Compute server fingerprint from server PeerId for topic naming
    const sPeerId = getServerPeerId()
    serverFingerprint = sPeerId || ''

    // Subscribe to all joined channels
    if (currentChannelIds.length > 0 && serverFingerprint) {
      subscribeToChannels(node, currentChannelIds, serverFingerprint)
    }

    // Set up gossipsub message handler — forward to renderer
    setupMessageHandler(node, (msg: GossipMessage) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.PUSH_P2P_MESSAGE, {
          senderPubkey: bufToHex(Buffer.from(msg.senderPubkey)),
          topic: msg.topic,
          messageType: msg.messageType,
          timestamp: msg.timestamp,
          sequenceHint: msg.sequenceHint,
          payload: Buffer.from(msg.payload).toString('base64')
        })
      }
    })

    // Discover and connect to peers
    try {
      await discoverAndConnectPeers(node, currentChannelIds)
    } catch (err) {
      console.error('[P2P] Initial peer discovery failed:', err)
    }

    // Register our PeerId with the server
    try {
      await registerPeerIdWithServer(peerId)
      console.log('[P2P] Registered PeerId with server')
    } catch (err) {
      console.error('[P2P] Failed to register PeerId:', err)
    }

    // Set up reconnection
    setupReconnection(node, currentChannelIds)

    // Start stats push if dev panel is open
    if (devPanelOpen) startStatsPush()

    return { peerId }
  })

  // Stop the P2P mesh
  ipcMain.handle(IPC.P2P_STOP_MESH, async (): Promise<void> => {
    stopStatsPush()
    clearReconnectionState()
    await stopP2PNode()
  })

  // Send a test gossipsub message
  ipcMain.handle(IPC.P2P_SEND_TEST_MESSAGE, async (_event, topic: string, text: string): Promise<void> => {
    const node = getP2PNode()
    if (!node) throw new Error('P2P node not running')

    const keys = getSessionKeys()
    if (!keys) throw new Error('Identity not unlocked')

    const payload = new TextEncoder().encode(text)
    await publishMessage(
      node,
      topic,
      MessageType.TEST,
      payload,
      keys.publicKey,
      keys.secretKey
    )
  })

  // Ping a specific peer
  ipcMain.handle(IPC.P2P_PING_PEER, async (_event, peerId: string): Promise<{ rttMs: number }> => {
    const node = getP2PNode()
    if (!node) throw new Error('P2P node not running')

    // Find the peer's connection
    const connections = node.getConnections()
    const peerConn = connections.find(c => c.remotePeer.toString() === peerId)
    if (!peerConn) throw new Error(`Not connected to peer ${peerId}`)

    const start = performance.now()
    await node.services.ping.ping(peerConn.remotePeer)
    const rttMs = Math.round(performance.now() - start)

    return { rttMs }
  })

  // Force reconnect to all peers
  ipcMain.handle(IPC.P2P_FORCE_RECONNECT, async (): Promise<void> => {
    const node = getP2PNode()
    if (!node) throw new Error('P2P node not running')

    // Close all connections
    const connections = node.getConnections()
    for (const conn of connections) {
      try {
        await conn.close()
      } catch {
        // Ignore close errors
      }
    }

    // Re-discover and connect
    await discoverAndConnectPeers(node, currentChannelIds)
  })

  // Get current P2P stats
  ipcMain.handle(IPC.P2P_GET_STATS, async (): Promise<P2PStats> => {
    return buildP2PStats()
  })

  // Dev panel open/close tracking
  ipcMain.handle(IPC.P2P_PANEL_OPEN, async (): Promise<void> => {
    devPanelOpen = true
    startStatsPush()
  })

  ipcMain.handle(IPC.P2P_PANEL_CLOSE, async (): Promise<void> => {
    devPanelOpen = false
    stopStatsPush()
  })
}

// ============================================================
// Channel lifecycle hooks
// ============================================================

/**
 * Update the tracked channel list and subscribe/unsubscribe topics.
 * Called by connection.ts when channels are created/deleted.
 */
export function setChannelIds(channelIds: string[]): void {
  currentChannelIds = channelIds
}

export function onChannelCreated(channelId: string): void {
  if (!currentChannelIds.includes(channelId)) {
    currentChannelIds.push(channelId)
  }

  const node = getP2PNode()
  if (node && serverFingerprint) {
    subscribeToChannel(node, channelId, serverFingerprint)
  }
}

export function onChannelDeleted(channelId: string): void {
  currentChannelIds = currentChannelIds.filter(id => id !== channelId)

  const node = getP2PNode()
  if (node && serverFingerprint) {
    unsubscribeFromChannel(node, channelId, serverFingerprint)
  }
}
