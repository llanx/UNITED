/**
 * Gossipsub topic subscription, message publish/receive, and envelope handling.
 *
 * Uses GossipEnvelope protobuf for wire format with Ed25519 signature verification
 * via sodium-native. Maintains Lamport counter for offline ordering hints.
 *
 * Supports inline vs deferred content: small content (<50KB) is inlined with
 * gossip messages; larger content is stored as blocks with hash references.
 */

import sodium from 'sodium-native'
import { create, toBinary, fromBinary } from '@bufbuild/protobuf'
import {
  GossipEnvelopeSchema,
  MessageType,
  type GossipEnvelope
} from '@shared/generated/p2p_pb'
import type { TopicStats, GossipMessage } from './types'
import type { Libp2p, PubSub } from '@libp2p/interface'
import { putBlock } from '../blocks/index'
import { ContentTier } from '../blocks/types'
import { generateMicroThumbnail, isImageMime } from '../blocks/thumbnails'
import { computeBlockHash } from '../blocks/crypto'

// ============================================================
// Lamport counter for offline ordering
// ============================================================

let lamportCounter = 0

export function getLamportCounter(): number {
  return lamportCounter
}

// ============================================================
// Topic subscription state
// ============================================================

const topicStatsMap = new Map<string, TopicStats>()

export function getTopicStats(): TopicStats[] {
  return Array.from(topicStatsMap.values())
}

/**
 * Compute the gossipsub topic string for a channel.
 * Format: {serverFingerprint first 16 chars}/{channelId}
 */
export function computeTopic(serverFingerprint: string, channelId: string): string {
  return `${serverFingerprint.slice(0, 16)}/${channelId}`
}

/**
 * Subscribe to gossipsub topics for all joined channels.
 */
export function subscribeToChannels(
  node: Libp2p<{ pubsub: PubSub }>,
  channelIds: string[],
  serverFingerprint: string
): void {
  for (const channelId of channelIds) {
    const topic = computeTopic(serverFingerprint, channelId)
    node.services.pubsub.subscribe(topic)

    if (!topicStatsMap.has(topic)) {
      topicStatsMap.set(topic, {
        topic,
        messageCount: 0,
        lastReceived: undefined
      })
    }
  }
}

/**
 * Subscribe to a single channel topic.
 */
export function subscribeToChannel(
  node: Libp2p<{ pubsub: PubSub }>,
  channelId: string,
  serverFingerprint: string
): void {
  const topic = computeTopic(serverFingerprint, channelId)
  node.services.pubsub.subscribe(topic)

  if (!topicStatsMap.has(topic)) {
    topicStatsMap.set(topic, {
      topic,
      messageCount: 0,
      lastReceived: undefined
    })
  }
}

/**
 * Unsubscribe from a single channel topic.
 */
export function unsubscribeFromChannel(
  node: Libp2p<{ pubsub: PubSub }>,
  channelId: string,
  serverFingerprint: string
): void {
  const topic = computeTopic(serverFingerprint, channelId)
  node.services.pubsub.unsubscribe(topic)
  topicStatsMap.delete(topic)
}

/**
 * Publish a GossipEnvelope to a gossipsub topic.
 *
 * Signs the envelope fields 3-7 with the provided secret key, then encodes
 * as protobuf and publishes to the topic.
 */
export async function publishMessage(
  node: Libp2p<{ pubsub: PubSub }>,
  topic: string,
  messageType: MessageType,
  payload: Uint8Array,
  publicKey: Buffer,
  secretKey: Buffer
): Promise<void> {
  // Increment Lamport counter for this send
  lamportCounter++

  const timestamp = BigInt(Date.now())
  const sequenceHint = BigInt(lamportCounter)

  // Create the envelope for signing (fields 3-7)
  const envelopeForSigning = create(GossipEnvelopeSchema, {
    senderPubkey: new Uint8Array(0),
    signature: new Uint8Array(0),
    topic,
    messageType,
    timestamp,
    sequenceHint,
    payload
  })

  // Serialize the signing fields: encode full envelope then extract fields 3-7
  // The Ed25519 signature covers the binary encoding of the envelope with empty sender_pubkey and signature
  const signingBytes = toBinary(GossipEnvelopeSchema, envelopeForSigning)

  // Sign with Ed25519
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, Buffer.from(signingBytes), secretKey)

  // Build the complete envelope
  const envelope = create(GossipEnvelopeSchema, {
    senderPubkey: new Uint8Array(publicKey),
    signature: new Uint8Array(signature),
    topic,
    messageType,
    timestamp,
    sequenceHint,
    payload
  })

  const encoded = toBinary(GossipEnvelopeSchema, envelope)

  // Guard: reject envelopes that exceed safe gossipsub limit
  validateEnvelopeSize(encoded)

  await node.services.pubsub.publish(topic, encoded)
}

/**
 * Set up the gossipsub message handler.
 *
 * Listens for incoming messages, decodes GossipEnvelope, verifies Ed25519
 * signature, updates topic stats, and forwards valid messages to the callback.
 */
export function setupMessageHandler(
  node: Libp2p<{ pubsub: PubSub }>,
  onMessage: (msg: GossipMessage) => void
): void {
  node.services.pubsub.addEventListener('message', (event) => {
    const { topic, data } = event.detail

    let envelope: GossipEnvelope
    try {
      envelope = fromBinary(GossipEnvelopeSchema, data)
    } catch (err) {
      console.warn('[P2P] Failed to decode GossipEnvelope:', err)
      return
    }

    // Verify Ed25519 signature over fields 3-7
    const envelopeForVerify = create(GossipEnvelopeSchema, {
      senderPubkey: new Uint8Array(0),
      signature: new Uint8Array(0),
      topic: envelope.topic,
      messageType: envelope.messageType,
      timestamp: envelope.timestamp,
      sequenceHint: envelope.sequenceHint,
      payload: envelope.payload
    })
    const verifyBytes = toBinary(GossipEnvelopeSchema, envelopeForVerify)

    if (envelope.senderPubkey.length !== 32 || envelope.signature.length !== 64) {
      console.warn('[P2P] Invalid sender pubkey or signature length')
      return
    }

    const valid = sodium.crypto_sign_verify_detached(
      Buffer.from(envelope.signature),
      Buffer.from(verifyBytes),
      Buffer.from(envelope.senderPubkey)
    )

    if (!valid) {
      console.warn('[P2P] Invalid Ed25519 signature on gossipsub message, discarding')
      return
    }

    // Update Lamport counter: max(local, received) + 1
    const receivedHint = Number(envelope.sequenceHint)
    lamportCounter = Math.max(lamportCounter, receivedHint) + 1

    // Update topic stats
    const stats = topicStatsMap.get(topic)
    if (stats) {
      stats.messageCount++
      stats.lastReceived = Date.now()
    }

    // Forward valid message
    onMessage({
      senderPubkey: envelope.senderPubkey,
      signature: envelope.signature,
      topic: envelope.topic,
      messageType: envelope.messageType,
      timestamp: Number(envelope.timestamp),
      sequenceHint: receivedHint,
      payload: envelope.payload
    })
  })
}

/**
 * Clear all topic stats (used on node shutdown).
 */
export function clearTopicStats(): void {
  topicStatsMap.clear()
  lamportCounter = 0
}

// ============================================================
// Inline vs deferred content preparation
// ============================================================

/** Maximum raw content size for inline gossip (50KB) */
const INLINE_SIZE_LIMIT = 50 * 1024

/** Maximum encoded gossip envelope size (safety margin below 64KB gossipsub limit) */
const MAX_ENVELOPE_SIZE = 60 * 1024

/** Block reference data for deferred content */
export interface BlockRefData {
  /** SHA-256 content hash */
  hash: string
  /** Block size in bytes */
  size: number
  /** MIME type */
  mimeType: string
  /** Original image width (0 for non-images) */
  width: number
  /** Original image height (0 for non-images) */
  height: number
  /** Micro-thumbnail JPEG buffer (images only) */
  microThumbnail?: Buffer
  /** Original filename */
  filename: string
}

/** Result of preparing content for gossip publication */
export interface GossipContentResult {
  /** Whether content is inlined (true) or deferred as block reference (false) */
  inline: boolean
  /** For inline: the raw content data. For deferred: unused. */
  payload: Buffer
  /** Block reference for deferred content */
  blockRef?: BlockRefData
}

/**
 * Prepare content for gossip publication.
 *
 * Content under 50KB is returned for inline embedding in the gossip message.
 * Images over 50KB are stored as blocks with a micro-thumbnail generated.
 * Non-image files over 50KB are stored as blocks with metadata only.
 *
 * @param data - Raw content buffer
 * @param filename - Original filename (for MIME detection and metadata)
 * @param mimeType - MIME type of the content
 * @returns Inline payload or block reference with metadata
 */
export async function prepareContentForGossip(
  data: Buffer,
  filename: string,
  mimeType: string
): Promise<GossipContentResult> {
  // Small content: inline with gossip
  if (data.length <= INLINE_SIZE_LIMIT) {
    return { inline: true, payload: data }
  }

  // Large content: store as block and return reference
  const hash = computeBlockHash(data)

  if (isImageMime(mimeType)) {
    // Image: store block + generate micro-thumbnail
    putBlock(data, ContentTier.P2_HOT, {
      mimeType,
      filename,
    })

    try {
      const { thumbnail, width, height } = await generateMicroThumbnail(data)

      return {
        inline: false,
        payload: Buffer.alloc(0),
        blockRef: { hash, size: data.length, mimeType, width, height, microThumbnail: thumbnail, filename },
      }
    } catch {
      // Thumbnail generation failed -- fall back to metadata-only
      return {
        inline: false,
        payload: Buffer.alloc(0),
        blockRef: { hash, size: data.length, mimeType, width: 0, height: 0, filename },
      }
    }
  }

  // Non-image: store block with metadata only (no thumbnail)
  putBlock(data, ContentTier.P2_HOT, {
    mimeType,
    filename,
  })

  return {
    inline: false,
    payload: Buffer.alloc(0),
    blockRef: { hash, size: data.length, mimeType, width: 0, height: 0, filename },
  }
}

/**
 * Validate that a gossip envelope does not exceed the safe size limit.
 * Call this after protobuf encoding but before publishing.
 *
 * @param encoded - Protobuf-encoded envelope bytes
 * @throws Error if envelope exceeds 60KB safety limit (64KB gossipsub max)
 */
export function validateEnvelopeSize(encoded: Uint8Array): void {
  if (encoded.length > MAX_ENVELOPE_SIZE) {
    throw new Error(
      `Gossip envelope size ${encoded.length} bytes exceeds ${MAX_ENVELOPE_SIZE} byte limit ` +
      `(gossipsub max_transmit_size is 65536). Reduce payload or use block reference.`
    )
  }
}
