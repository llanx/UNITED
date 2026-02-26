/**
 * Custom libp2p block exchange protocol.
 *
 * Protocol: /united/block/1.0.0
 *
 * Wire format: length-prefixed messages over a libp2p stream.
 * - Request: LP(hash_hex_utf8)
 * - Response: LP(block_data) or LP(empty) if not found
 *
 * Security: All received blocks are verified by SHA-256 hash before acceptance.
 * Performance: fetchFromHotPeers sends parallel requests to all connected peers,
 * first response wins via Promise.any, remaining requests are cancelled.
 */

import { lpStream } from 'it-length-prefixed-stream'
import { createHash } from 'crypto'
import type { Libp2p, PeerId } from '@libp2p/interface'
import { getLocalBlock } from './store'

// ============================================================
// Constants
// ============================================================

/** Custom block exchange protocol identifier */
export const BLOCK_PROTOCOL = '/united/block/1.0.0'

// ============================================================
// Network stats tracking
// ============================================================

/** Cumulative bytes uploaded (served to peers) */
let bytesUploaded = 0
/** Cumulative bytes downloaded (received from peers) */
let bytesDownloaded = 0
/** Total blocks served to peers */
let blocksSeeded = 0

/** Rolling window entries for speed calculation */
const recentUploads: Array<{ time: number; size: number }> = []
const recentDownloads: Array<{ time: number; size: number }> = []

/** Rolling window duration in ms */
const SPEED_WINDOW_MS = 10_000

export interface NetworkStatsSnapshot {
  bytesUploaded: number
  bytesDownloaded: number
  blocksSeeded: number
  uploadSpeed: number
  downloadSpeed: number
}

/**
 * Get current network stats snapshot.
 * Upload/download speed is calculated from a rolling 10-second window.
 */
export function getNetworkStats(): NetworkStatsSnapshot {
  const now = Date.now()
  const cutoff = now - SPEED_WINDOW_MS

  // Prune old entries
  while (recentUploads.length > 0 && recentUploads[0].time < cutoff) {
    recentUploads.shift()
  }
  while (recentDownloads.length > 0 && recentDownloads[0].time < cutoff) {
    recentDownloads.shift()
  }

  const uploadBytes = recentUploads.reduce((sum, e) => sum + e.size, 0)
  const downloadBytes = recentDownloads.reduce((sum, e) => sum + e.size, 0)

  return {
    bytesUploaded,
    bytesDownloaded,
    blocksSeeded,
    uploadSpeed: uploadBytes / (SPEED_WINDOW_MS / 1000),
    downloadSpeed: downloadBytes / (SPEED_WINDOW_MS / 1000),
  }
}

/** Reset all network stats (for testing). */
export function resetNetworkStats(): void {
  bytesUploaded = 0
  bytesDownloaded = 0
  blocksSeeded = 0
  recentUploads.length = 0
  recentDownloads.length = 0
}

// ============================================================
// Protocol handler (serving blocks to peers)
// ============================================================

/**
 * Register the block exchange protocol handler on the libp2p node.
 *
 * When a remote peer opens a stream with /united/block/1.0.0, this handler:
 * 1. Reads the requested block hash (UTF-8 text, length-prefixed)
 * 2. Looks up the block in the local encrypted store
 * 3. Writes the block data (or empty response if not found)
 * 4. Closes the stream
 */
export function registerBlockProtocol(node: Libp2p): void {
  node.handle(BLOCK_PROTOCOL, async ({ stream }) => {
    try {
      const lp = lpStream(stream)

      // Read the requested hash (UTF-8 encoded)
      const hashBytes = await lp.read()
      const hash = new TextDecoder().decode(hashBytes.subarray())

      // Look up the block in local store
      const data = getLocalBlock(hash)

      if (data) {
        // Found: write block data and track stats
        await lp.write(new Uint8Array(data))
        bytesUploaded += data.length
        blocksSeeded++
        recentUploads.push({ time: Date.now(), size: data.length })
      } else {
        // Not found: write zero-length response
        await lp.write(new Uint8Array(0))
      }

      // Close the stream
      await stream.close()
    } catch (err) {
      // Suppress handler errors to avoid crashing the node
      console.debug('[BlockProtocol] Handler error:', err)
      try {
        stream.abort(err instanceof Error ? err : new Error(String(err)))
      } catch {
        // Ignore abort errors
      }
    }
  })

  console.log('[BlockProtocol] Registered /united/block/1.0.0 handler')
}

// ============================================================
// Block fetching from a single peer
// ============================================================

/**
 * Fetch a block from a specific peer via the block exchange protocol.
 *
 * @param node - The libp2p node
 * @param peerId - The peer to request from
 * @param hash - The SHA-256 hex hash of the requested block
 * @param timeout - Request timeout in milliseconds
 * @returns The block data as a Buffer
 * @throws If peer doesn't have the block, hash mismatch, or timeout
 */
export async function fetchBlockFromPeer(
  node: Libp2p,
  peerId: PeerId,
  hash: string,
  timeout: number
): Promise<Buffer> {
  // Open a stream to the peer with the block protocol
  const stream = await node.dialProtocol(peerId, BLOCK_PROTOCOL, {
    signal: AbortSignal.timeout(timeout)
  })

  const lp = lpStream(stream)

  try {
    // Write the hash as UTF-8 bytes
    const hashBytes = new TextEncoder().encode(hash)
    await lp.write(hashBytes)

    // Read the response
    const response = await lp.read()
    const responseBytes = response.subarray()

    // Empty response means not found
    if (responseBytes.length === 0) {
      throw new Error(`Block ${hash} not found on peer ${peerId.toString()}`)
    }

    // Convert to Buffer
    const data = Buffer.from(responseBytes)

    // CRITICAL: Verify SHA-256 hash matches the requested hash
    const computedHash = createHash('sha256').update(data).digest('hex')
    if (computedHash !== hash) {
      throw new Error(
        `Block hash mismatch from peer ${peerId.toString()}: expected ${hash}, got ${computedHash}`
      )
    }

    // Track download stats
    bytesDownloaded += data.length
    recentDownloads.push({ time: Date.now(), size: data.length })

    // Close the stream
    await stream.close()

    return data
  } catch (err) {
    // Abort the stream on any error
    try {
      stream.abort(err instanceof Error ? err : new Error(String(err)))
    } catch {
      // Ignore abort errors
    }
    throw err
  }
}

// ============================================================
// Parallel peer fetching (first-responder-wins)
// ============================================================

/**
 * Fetch a block from all connected peers in parallel.
 *
 * Uses Promise.any to return the first successful response.
 * Remaining requests are cancelled via AbortController on first success.
 *
 * @param node - The libp2p node
 * @param hash - The SHA-256 hex hash of the requested block
 * @param options - Configuration (timeout per request)
 * @returns The block data, or null if no peer has it
 */
export async function fetchFromHotPeers(
  node: Libp2p,
  hash: string,
  options: { timeout: number }
): Promise<Buffer | null> {
  // Get connected peers (unique PeerIds)
  const connections = node.getConnections()
  const seenPeerIds = new Set<string>()
  const uniquePeerIds: PeerId[] = []

  for (const conn of connections) {
    const peerIdStr = conn.remotePeer.toString()
    if (!seenPeerIds.has(peerIdStr)) {
      seenPeerIds.add(peerIdStr)
      uniquePeerIds.push(conn.remotePeer)
    }
  }

  if (uniquePeerIds.length === 0) {
    return null
  }

  // Create abort controller to cancel remaining requests on first success
  const controller = new AbortController()

  // Create a fetch promise for each peer
  const requests = uniquePeerIds.map(async (peerId) => {
    // Check if already aborted
    if (controller.signal.aborted) {
      throw new Error('Cancelled')
    }

    return fetchBlockFromPeer(node, peerId, hash, options.timeout)
  })

  try {
    // First successful response wins
    const data = await Promise.any(requests)

    // Cancel remaining requests
    controller.abort()

    return data
  } catch (err) {
    // AggregateError: all requests failed
    if (err instanceof AggregateError) {
      console.debug(
        `[BlockProtocol] Block ${hash} not found on any of ${uniquePeerIds.length} peers`
      )
      return null
    }
    // Unexpected error
    console.debug('[BlockProtocol] fetchFromHotPeers error:', err)
    return null
  }
}
