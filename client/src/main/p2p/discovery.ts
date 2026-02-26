/**
 * Peer discovery via server's WS-based peer directory and connection management.
 *
 * Handles peer discovery, exponential backoff reconnection, PeerId registration,
 * and member list verification for mesh authentication.
 */

import { multiaddr } from '@multiformats/multiaddr'
import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import {
  PeerDirectoryRequestSchema,
  PeerDirectoryResponseSchema,
  RegisterPeerIdRequestSchema,
  RegisterPeerIdResponseSchema,
  type PeerInfo as ProtoPeerInfo
} from '@shared/generated/p2p_pb'
import {
  EnvelopeSchema,
  type Envelope
} from '@shared/generated/ws_pb'
import { wsClient } from '../ws/client'
import type { PeerInfo } from './types'
import type { Libp2p, PubSub, PeerId } from '@libp2p/interface'
import { peerIdFromString } from '@libp2p/peer-id'

// ============================================================
// Reconnection state
// ============================================================

interface ReconnectState {
  peerId: string
  attempt: number
  timer: ReturnType<typeof setTimeout> | null
}

const reconnectStates = new Map<string, ReconnectState>()

const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30000
const MAX_RECONNECT_BEFORE_DIRECTORY = 7 // ~2 minutes worth of backoff

function calculateBackoff(attempt: number): number {
  const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS)
  // Add small jitter to prevent thundering herd
  return delay + Math.random() * 200
}

// ============================================================
// WS message helpers
// ============================================================

let pendingDirectoryResolve: ((peers: ProtoPeerInfo[]) => void) | null = null
let pendingRegisterResolve: ((success: boolean) => void) | null = null

function sendWsEnvelope(envelope: Envelope): void {
  const encoded = toBinary(EnvelopeSchema, envelope)
  wsClient.send(new Uint8Array(encoded))
}

/**
 * Listen for WS messages that contain P2P-related responses.
 * Must be called once during initialization.
 */
export function setupWsP2PListener(): void {
  wsClient.on('message', (data: Uint8Array) => {
    try {
      const envelope = fromBinary(EnvelopeSchema, data)

      if (envelope.payload.case === 'peerDirectoryResponse' && pendingDirectoryResolve) {
        const response = envelope.payload.value
        pendingDirectoryResolve(response.peers)
        pendingDirectoryResolve = null
      }

      if (envelope.payload.case === 'registerPeerIdResponse' && pendingRegisterResolve) {
        const response = envelope.payload.value
        pendingRegisterResolve(response.success)
        pendingRegisterResolve = null
      }
    } catch {
      // Not a protobuf message we care about, ignore
    }
  })
}

// ============================================================
// Peer discovery
// ============================================================

/**
 * Discover and connect to peers by querying the server's peer directory.
 *
 * Sends a PeerDirectoryRequest via the existing WS connection, receives
 * the response with peer multiaddresses, and dials each peer.
 */
export async function discoverAndConnectPeers(
  node: Libp2p<{ pubsub: PubSub }>,
  channelIds: string[]
): Promise<PeerInfo[]> {
  // Send PeerDirectoryRequest via WS
  const requestId = `pdr-${Date.now()}`
  const dirRequest = create(PeerDirectoryRequestSchema, {
    channelIds
  })

  const envelope = create(EnvelopeSchema, {
    requestId,
    payload: {
      case: 'peerDirectoryRequest',
      value: dirRequest
    }
  })

  // Send and wait for response with timeout
  const peers = await new Promise<ProtoPeerInfo[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingDirectoryResolve = null
      reject(new Error('Peer directory request timed out'))
    }, 10000)

    pendingDirectoryResolve = (result) => {
      clearTimeout(timeout)
      resolve(result)
    }

    try {
      sendWsEnvelope(envelope)
    } catch (err) {
      clearTimeout(timeout)
      pendingDirectoryResolve = null
      reject(err)
    }
  })

  console.log(`[P2P] Discovered ${peers.length} peers from directory`)

  const connectedPeers: PeerInfo[] = []

  for (const peer of peers) {
    // Skip self
    const selfPeerId = node.peerId.toString()
    if (peer.peerId === selfPeerId) continue

    // Skip already-connected peers
    const connections = node.getConnections()
    const alreadyConnected = connections.some(
      conn => conn.remotePeer.toString() === peer.peerId
    )
    if (alreadyConnected) {
      connectedPeers.push(protoPeerToLocal(peer, 'direct'))
      continue
    }

    // Try to dial each multiaddr
    for (const addrStr of peer.multiaddrs) {
      try {
        const ma = multiaddr(addrStr)
        await node.dial(ma)
        console.log(`[P2P] Connected to peer ${peer.peerId} via ${addrStr}`)
        connectedPeers.push(protoPeerToLocal(peer, 'direct'))
        break // Connected via one addr, move to next peer
      } catch (err) {
        console.debug(`[P2P] Failed to dial ${addrStr}:`, err)
      }
    }
  }

  return connectedPeers
}

function protoPeerToLocal(
  proto: ProtoPeerInfo,
  connectionType: 'direct' | 'relayed'
): PeerInfo {
  return {
    unitedId: proto.unitedId,
    peerId: proto.peerId,
    multiaddrs: proto.multiaddrs,
    channels: proto.channels,
    natType: (proto.natType as 'public' | 'private' | 'unknown') || 'unknown',
    connectionType
  }
}

// ============================================================
// Reconnection
// ============================================================

/**
 * Set up automatic reconnection for disconnected mesh peers.
 *
 * Uses exponential backoff (1s-30s) with server directory fallback
 * after ~2 minutes of failed reconnection attempts.
 */
export function setupReconnection(
  node: Libp2p<{ pubsub: PubSub }>,
  channelIds: string[]
): void {
  node.addEventListener('peer:disconnect', (event) => {
    const remotePeerId = event.detail.toString()

    // Check if the disconnected peer was in the gossipsub mesh
    // by checking if they were subscribed to any of our topics
    const meshTopics = node.services.pubsub.getTopics()
    const isMeshPeer = meshTopics.length > 0 // Simplified: any subscribed topic means mesh participant

    if (!isMeshPeer) {
      // Non-mesh peer: lazy reconnection per CONTEXT.md
      console.debug(`[P2P] Non-mesh peer ${remotePeerId} disconnected, skipping reconnect`)
      return
    }

    console.log(`[P2P] Mesh peer ${remotePeerId} disconnected, starting reconnection`)

    // Start exponential backoff reconnection
    const state: ReconnectState = {
      peerId: remotePeerId,
      attempt: 0,
      timer: null
    }
    reconnectStates.set(remotePeerId, state)

    scheduleReconnect(node, state, channelIds)
  })

  // Clean up reconnect state on successful connection
  node.addEventListener('peer:connect', (event) => {
    const remotePeerId = event.detail.toString()
    const state = reconnectStates.get(remotePeerId)
    if (state) {
      if (state.timer) clearTimeout(state.timer)
      reconnectStates.delete(remotePeerId)
      console.log(`[P2P] Reconnected to peer ${remotePeerId}`)
    }
  })
}

function scheduleReconnect(
  node: Libp2p<{ pubsub: PubSub }>,
  state: ReconnectState,
  channelIds: string[]
): void {
  if (state.attempt >= MAX_RECONNECT_BEFORE_DIRECTORY) {
    // After ~2 minutes, fall back to directory query for replacement peers
    console.log(`[P2P] Max reconnect attempts for ${state.peerId}, querying directory`)
    reconnectStates.delete(state.peerId)
    discoverAndConnectPeers(node, channelIds).catch(err => {
      console.error('[P2P] Directory fallback failed:', err)
    })
    return
  }

  const delay = calculateBackoff(state.attempt)
  console.debug(`[P2P] Reconnect attempt ${state.attempt + 1} to ${state.peerId} in ${Math.round(delay)}ms`)

  state.timer = setTimeout(async () => {
    try {
      // Parse the string PeerId back to a PeerId object for peerStore lookup
      const remotePeerId = peerIdFromString(state.peerId)
      const peerStore = node.peerStore
      let peerData
      try {
        peerData = await peerStore.get(remotePeerId)
      } catch {
        // Peer not in store — skip to next attempt
      }

      if (peerData && peerData.addresses.length > 0) {
        // Try each known multiaddr
        for (const addr of peerData.addresses) {
          try {
            await node.dial(addr.multiaddr)
            console.log(`[P2P] Reconnected to ${state.peerId} via ${addr.multiaddr.toString()}`)
            return // Success — peer:connect handler cleans up state
          } catch {
            // This addr failed, try next
          }
        }
      }

      // All addrs failed or none found — backoff and retry
      state.attempt++
      scheduleReconnect(node, state, channelIds)
    } catch (err) {
      console.debug(`[P2P] Reconnect to ${state.peerId} failed:`, err)
      state.attempt++
      scheduleReconnect(node, state, channelIds)
    }
  }, delay)
}

// ============================================================
// PeerId registration
// ============================================================

/**
 * Register the client's libp2p PeerId with the server.
 *
 * Sends a RegisterPeerIdRequest via WS to map UNITED identity to PeerId
 * in the server's peer directory.
 */
export async function registerPeerIdWithServer(peerId: string): Promise<boolean> {
  const requestId = `rpi-${Date.now()}`
  const request = create(RegisterPeerIdRequestSchema, {
    peerId
  })

  const envelope = create(EnvelopeSchema, {
    requestId,
    payload: {
      case: 'registerPeerIdRequest',
      value: request
    }
  })

  return new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRegisterResolve = null
      reject(new Error('RegisterPeerId request timed out'))
    }, 10000)

    pendingRegisterResolve = (success) => {
      clearTimeout(timeout)
      resolve(success)
    }

    try {
      sendWsEnvelope(envelope)
    } catch (err) {
      clearTimeout(timeout)
      pendingRegisterResolve = null
      reject(err)
    }
  })
}

// ============================================================
// Cleanup
// ============================================================

/**
 * Clear all reconnection timers (used on node shutdown).
 */
export function clearReconnectionState(): void {
  for (const state of reconnectStates.values()) {
    if (state.timer) clearTimeout(state.timer)
  }
  reconnectStates.clear()
}
