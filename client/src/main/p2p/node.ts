/**
 * Client libp2p node factory and lifecycle management.
 *
 * Creates a libp2p node with WebSocket (to server), WebRTC (peer-to-peer),
 * and Circuit Relay transports. Gossipsub v1.1 with chat-tuned parameters.
 * Noise encryption for all connections, Yamux stream muxing.
 */

import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { ping } from '@libp2p/ping'
import { multiaddr } from '@multiformats/multiaddr'
import type { Ed25519PrivateKey, PubSub } from '@libp2p/interface'

import { unitedKeysToLibp2p, getIdentityKeySeed } from './identity'
import { clearTopicStats } from './gossipsub'
import { registerBlockProtocol } from '../blocks/protocol'

// ============================================================
// Module-level state
// ============================================================

let p2pNode: Libp2p<{ pubsub: PubSub }> | null = null
let serverPeerIdStr: string | null = null

export function getP2PNode(): Libp2p<{ pubsub: PubSub }> | null {
  return p2pNode
}

export function getServerPeerId(): string | null {
  return serverPeerIdStr
}

// ============================================================
// P2P info from server
// ============================================================

interface ServerP2PInfo {
  peer_id: string
  multiaddr: string
  libp2p_port: number
}

/**
 * Fetch the server's P2P connection info via REST API.
 * This is called from the main process (not renderer) so fetch is available.
 */
async function fetchServerP2PInfo(serverUrl: string): Promise<ServerP2PInfo> {
  const response = await fetch(`${serverUrl}/api/p2p/info`)
  if (!response.ok) {
    throw new Error(`Failed to fetch P2P info: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<ServerP2PInfo>
}

// ============================================================
// Node creation
// ============================================================

/**
 * Create a libp2p node with UNITED configuration.
 *
 * @param privateKey - Ed25519 private key from identity bridge
 * @param serverMultiaddr - Server's libp2p multiaddr string
 * @returns Configured libp2p node (already started)
 */
export async function createUnitedP2PNode(
  privateKey: Ed25519PrivateKey,
  serverMultiaddr: string
): Promise<Libp2p<{ pubsub: PubSub }>> {
  const node = await createLibp2p({
    privateKey,
    transports: [
      webSockets(),
      webRTC(),
      circuitRelayTransport()
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      pubsub: gossipsub({
        // Chat-tuned gossipsub parameters matching server config (03-01)
        D: 4,
        Dlo: 3,
        Dhi: 8,
        emitSelf: false,
        allowPublishToZeroTopicPeers: true,
        // Flood publish for reliability during early mesh formation
        floodPublish: true,
        // Message signing handled by UNITED's GossipEnvelope, not gossipsub
        globalSignaturePolicy: 'StrictNoSign'
      }),
      identify: identify(),
      dcutr: dcutr(),
      ping: ping()
    }
  })

  return node as Libp2p<{ pubsub: PubSub }>
}

// ============================================================
// Lifecycle
// ============================================================

/**
 * Start the P2P node and connect to the server.
 *
 * @param serverUrl - Server HTTP URL (e.g., "http://localhost:1984")
 * @returns The PeerId string of the started node
 */
export async function startP2PNode(serverUrl: string): Promise<string> {
  if (p2pNode) {
    console.warn('[P2P] Node already running, stopping first')
    await stopP2PNode()
  }

  // 1. Get identity seed from stored identity
  const seed = getIdentityKeySeed()
  if (!seed) {
    throw new Error('Cannot start P2P node: identity not unlocked')
  }

  // 2. Convert to libp2p identity
  const { privateKey, peerId } = await unitedKeysToLibp2p(seed)
  console.log(`[P2P] Local PeerId: ${peerId.toString()}`)

  // 3. Fetch server's P2P info
  const serverInfo = await fetchServerP2PInfo(serverUrl)
  serverPeerIdStr = serverInfo.peer_id
  console.log(`[P2P] Server PeerId: ${serverPeerIdStr}`)

  // 4. Construct server multiaddr
  // Parse the server URL to get host, then build libp2p multiaddr
  const url = new URL(serverUrl)
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname
  const serverMultiaddrStr = `/ip4/${host}/tcp/${serverInfo.libp2p_port}/ws/p2p/${serverPeerIdStr}`
  console.log(`[P2P] Server multiaddr: ${serverMultiaddrStr}`)

  // 5. Create and start node
  p2pNode = await createUnitedP2PNode(privateKey, serverMultiaddrStr)
  console.log(`[P2P] Node started`)

  // 5b. Register block exchange protocol handler
  registerBlockProtocol(p2pNode)

  // 6. Dial the server to establish initial connection
  try {
    const ma = multiaddr(serverMultiaddrStr)
    await p2pNode.dial(ma)
    console.log(`[P2P] Connected to server`)
  } catch (err) {
    console.error('[P2P] Failed to connect to server:', err)
    // Node is still running, can retry later
  }

  return peerId.toString()
}

/**
 * Stop the P2P node and clean up resources.
 */
export async function stopP2PNode(): Promise<void> {
  if (p2pNode) {
    try {
      await p2pNode.stop()
    } catch (err) {
      console.error('[P2P] Error stopping node:', err)
    }
    p2pNode = null
    serverPeerIdStr = null
    clearTopicStats()
    console.log('[P2P] Node stopped')
  }
}
