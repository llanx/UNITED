/**
 * Shared TypeScript types used across all P2P modules.
 */

export interface PeerInfo {
  unitedId: string        // UNITED fingerprint
  peerId: string          // libp2p PeerId string
  multiaddrs: string[]    // Advertised multiaddresses
  channels: string[]      // Subscribed channel UUIDs
  natType: 'public' | 'private' | 'unknown'
  latencyMs?: number      // Last measured RTT
  connectionType?: 'direct' | 'relayed'
}

export interface TopicStats {
  topic: string           // Channel UUID topic
  messageCount: number    // Messages received since subscription
  lastReceived?: number   // Timestamp of last message
}

export interface P2PStats {
  peers: PeerInfo[]
  topics: TopicStats[]
  natType: string
  isConnected: boolean
  serverPeerId: string
}

export interface GossipMessage {
  senderPubkey: Uint8Array
  signature: Uint8Array
  topic: string
  messageType: number
  timestamp: number
  sequenceHint: number
  payload: Uint8Array
}
