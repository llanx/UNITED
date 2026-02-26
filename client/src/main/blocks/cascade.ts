/**
 * 5-layer cache cascade for content resolution.
 *
 * resolveBlock(hash) transparently tries these layers in order:
 *   L0: Memory cache (microseconds)
 *   L1: Local encrypted block store (milliseconds)
 *   L2: Hot peers - parallel fetch from connected peers (seconds)
 *   L3: Peer directory discovery - find new peers via server directory (seconds)
 *   L4: Server fallback - authenticated HTTP GET (reliable)
 *
 * Each layer that successfully finds a block persists it locally for
 * future L0/L1 cache hits. Returns null if all layers fail (content unavailable).
 */

import { getBlockCache } from './cache'
import { getLocalBlock, putBlock, touchAccess } from './store'
import { fetchFromHotPeers } from './protocol'
import { ContentTier } from './types'
import { getP2PNode } from '../p2p/node'
import { discoverAndConnectPeers } from '../p2p/discovery'
import { getAccessToken, getServerUrl } from '../ipc/auth'

// ============================================================
// Constants
// ============================================================

/** L2 hot peer fetch timeout in milliseconds */
const L2_TIMEOUT_MS = 3000

/** L3 peer directory fetch timeout in milliseconds */
const L3_TIMEOUT_MS = 5000

/** L4 server fetch timeout in milliseconds */
const L4_TIMEOUT_MS = 10000

// ============================================================
// 5-layer cascade resolver
// ============================================================

/**
 * Resolve a block through the 5-layer cache cascade.
 *
 * L0: Memory cache -> L1: Local store -> L2: Hot peers (parallel) ->
 * L3: Peer directory discovery -> L4: Server fallback
 *
 * @param hash - SHA-256 hex hash of the block
 * @returns Block data as Buffer, or null if unavailable
 */
export async function resolveBlock(hash: string): Promise<Buffer | null> {
  // ── L0: Memory cache (microseconds) ──
  const cache = getBlockCache()
  if (cache) {
    const cached = cache.get(hash)
    if (cached) {
      touchAccess(hash)
      return cached
    }
  }

  // ── L1: Local encrypted block store (milliseconds) ──
  const local = getLocalBlock(hash)
  if (local) {
    // Already updates L0 cache and touches access time internally
    return local
  }

  // ── L2: Hot peers - parallel fetch (seconds) ──
  const node = getP2PNode()
  if (node) {
    try {
      const peerData = await fetchFromHotPeers(node, hash, { timeout: L2_TIMEOUT_MS })
      if (peerData) {
        // Persist locally as warm-tier content
        putBlock(peerData, ContentTier.P3_WARM)
        return peerData
      }
    } catch (err) {
      console.debug('[Cascade] L2 hot peers failed:', err)
    }
  }

  // ── L3: DHT/swarm discovery via peer directory ──
  if (node) {
    try {
      // Query the server's peer directory for additional peers
      const peers = await discoverAndConnectPeers(node, [])
      if (peers.length > 0) {
        // Now try fetching from the expanded peer set
        const discoveredData = await fetchFromHotPeers(node, hash, { timeout: L3_TIMEOUT_MS })
        if (discoveredData) {
          putBlock(discoveredData, ContentTier.P3_WARM)
          return discoveredData
        }
      }
    } catch (err) {
      console.debug('[Cascade] L3 peer directory failed:', err)
    }
  }

  // ── L4: Server fallback (reliable) ──
  const serverUrl = getServerUrl()
  const accessToken = getAccessToken()

  if (serverUrl && accessToken) {
    try {
      const response = await fetch(`${serverUrl}/api/blocks/${hash}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        signal: AbortSignal.timeout(L4_TIMEOUT_MS)
      })

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        const data = Buffer.from(arrayBuffer)

        // Server returns plaintext block data (server decrypts before sending)
        // Persist locally as altruistic-tier (server-fetched content)
        putBlock(data, ContentTier.P4_ALTRUISTIC)
        return data
      }

      if (response.status !== 404) {
        console.debug(`[Cascade] L4 server returned ${response.status} for block ${hash}`)
      }
    } catch (err) {
      console.debug('[Cascade] L4 server fallback failed:', err)
    }
  }

  // All layers failed — content unavailable
  return null
}

// ============================================================
// Cascade with progress callback
// ============================================================

/**
 * Resolve a block through the cascade with progress callbacks.
 *
 * Same cascade logic as resolveBlock, but calls onProgress with
 * the current layer name as each layer is attempted. Supports the
 * progressive timeout UI feedback (shimmer -> "Fetching..." -> unavailable).
 *
 * @param hash - SHA-256 hex hash of the block
 * @param onProgress - Callback invoked with layer name ('L0', 'L1', etc.)
 * @returns Block data as Buffer, or null if unavailable
 */
export async function resolveBlockWithProgress(
  hash: string,
  onProgress: (layer: string) => void
): Promise<Buffer | null> {
  // ── L0: Memory cache ──
  onProgress('L0')
  const cache = getBlockCache()
  if (cache) {
    const cached = cache.get(hash)
    if (cached) {
      touchAccess(hash)
      return cached
    }
  }

  // ── L1: Local encrypted block store ──
  onProgress('L1')
  const local = getLocalBlock(hash)
  if (local) {
    return local
  }

  // ── L2: Hot peers ──
  onProgress('L2')
  const node = getP2PNode()
  if (node) {
    try {
      const peerData = await fetchFromHotPeers(node, hash, { timeout: L2_TIMEOUT_MS })
      if (peerData) {
        putBlock(peerData, ContentTier.P3_WARM)
        return peerData
      }
    } catch (err) {
      console.debug('[Cascade] L2 hot peers failed:', err)
    }
  }

  // ── L3: Peer directory discovery ──
  onProgress('L3')
  if (node) {
    try {
      const peers = await discoverAndConnectPeers(node, [])
      if (peers.length > 0) {
        const discoveredData = await fetchFromHotPeers(node, hash, { timeout: L3_TIMEOUT_MS })
        if (discoveredData) {
          putBlock(discoveredData, ContentTier.P3_WARM)
          return discoveredData
        }
      }
    } catch (err) {
      console.debug('[Cascade] L3 peer directory failed:', err)
    }
  }

  // ── L4: Server fallback ──
  onProgress('L4')
  const serverUrl = getServerUrl()
  const accessToken = getAccessToken()

  if (serverUrl && accessToken) {
    try {
      const response = await fetch(`${serverUrl}/api/blocks/${hash}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        signal: AbortSignal.timeout(L4_TIMEOUT_MS)
      })

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        const data = Buffer.from(arrayBuffer)
        putBlock(data, ContentTier.P4_ALTRUISTIC)
        return data
      }
    } catch (err) {
      console.debug('[Cascade] L4 server fallback failed:', err)
    }
  }

  return null
}
