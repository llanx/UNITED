/**
 * WS event forwarder for DM push events.
 *
 * Listens for incoming WebSocket messages, decodes protobuf envelopes,
 * and forwards DM events to all renderer windows via IPC push channels.
 * Mirrors the pattern in chat-events.ts: fromBinary(EnvelopeSchema, data)
 * with switch on envelope.payload.case.
 */

import { BrowserWindow, Notification } from 'electron'
import { fromBinary } from '@bufbuild/protobuf'
import { EnvelopeSchema } from '@shared/generated/ws_pb'
import { IPC } from '../ipc/channels'
import { wsClient } from './client'
import {
  getOrComputeSharedSecret,
  decryptDmMessage,
  clearSharedSecretCache
} from '../ipc/dm-crypto'
import { getAccessToken, getServerUrl } from '../ipc/auth'
import { putBlock } from '../blocks/index'
import { ContentTier } from '../blocks/types'
import type { DmEvent, DecryptedDmMessage, DmConversation } from '@shared/ipc-bridge'

/**
 * Set up the WS listener for DM push events.
 * Must be called once during app initialization.
 */
export function setupDmEventListener(): void {
  wsClient.on('message', async (data: Uint8Array) => {
    try {
      const envelope = fromBinary(EnvelopeSchema, data)
      const payload = envelope.payload

      switch (payload.case) {
        case 'dmMessageEvent': {
          const msg = payload.value.message
          if (!msg) break

          await handleDmMessage(msg)
          break
        }

        case 'dmConversationCreatedEvent': {
          const conv = payload.value.conversation
          if (!conv) break

          // Map protobuf DmConversation (bigint timestamps) to ipc-bridge DmConversation (number timestamps)
          const conversation: DmConversation = {
            id: conv.id,
            participantAPubkey: conv.participantAPubkey,
            participantBPubkey: conv.participantBPubkey,
            participantADisplayName: conv.participantADisplayName,
            participantBDisplayName: conv.participantBDisplayName,
            createdAt: Number(conv.createdAt),
            lastMessageAt: Number(conv.lastMessageAt)
          }

          const dmEvent: DmEvent = {
            type: 'conversation-created',
            conversation
          }
          broadcastToRenderers(IPC.PUSH_DM_EVENT, dmEvent)
          break
        }

        case 'dmKeyRotatedEvent': {
          // Clear shared secret cache so next message triggers fresh key exchange
          clearSharedSecretCache()
          broadcastToRenderers(IPC.PUSH_DM_KEY_ROTATED, payload.value.userPubkey)
          break
        }

        default:
          // Not a DM event -- other listeners handle it
          break
      }
    } catch {
      // Not a protobuf message we care about, ignore
      // (allows chat-events.ts and dm-events.ts to coexist on same 'message' event)
    }
  })
}

async function handleDmMessage(msg: {
  id: string
  conversationId: string
  senderPubkey: string
  senderDisplayName: string
  encryptedPayload: Uint8Array
  nonce: Uint8Array
  timestamp: bigint
  serverSequence: bigint
}): Promise<void> {
  const url = getServerUrl()
  const token = getAccessToken()
  if (!url || !token) return

  let decryptedMessage: DecryptedDmMessage

  try {
    const sharedSecret = await getOrComputeSharedSecret(
      msg.conversationId, msg.senderPubkey, url, token
    )

    if (sharedSecret) {
      // Convert Uint8Array to Buffer for sodium-native decryption
      const encrypted = Buffer.from(msg.encryptedPayload)
      const nonce = Buffer.from(msg.nonce)
      const content = decryptDmMessage(encrypted, nonce, sharedSecret)

      decryptedMessage = {
        id: msg.id,
        conversationId: msg.conversationId,
        senderPubkey: msg.senderPubkey,
        senderDisplayName: msg.senderDisplayName,
        content,
        timestamp: Number(msg.timestamp),
        serverSequence: Number(msg.serverSequence),
        decryptionFailed: false
      }
    } else {
      decryptedMessage = {
        id: msg.id,
        conversationId: msg.conversationId,
        senderPubkey: msg.senderPubkey,
        senderDisplayName: msg.senderDisplayName,
        content: '[Unable to decrypt]',
        timestamp: Number(msg.timestamp),
        serverSequence: Number(msg.serverSequence),
        decryptionFailed: true
      }
    }
  } catch {
    decryptedMessage = {
      id: msg.id,
      conversationId: msg.conversationId,
      senderPubkey: msg.senderPubkey,
      senderDisplayName: msg.senderDisplayName,
      content: '[Unable to decrypt]',
      timestamp: Number(msg.timestamp),
      serverSequence: Number(msg.serverSequence),
      decryptionFailed: true
    }
  }

  // Persist received DM as P1_NEVER_EVICT block (fire-and-forget)
  if (!decryptedMessage.decryptionFailed) {
    try {
      putBlock(
        Buffer.from(decryptedMessage.content, 'utf-8'),
        ContentTier.P1_NEVER_EVICT,
        { mimeType: 'text/plain', filename: `dm-${msg.id}` }
      )
    } catch {
      // Block store may not be initialized -- don't fail the DM flow
    }
  }

  const dmEvent: DmEvent = {
    type: 'new',
    message: decryptedMessage
  }

  broadcastToRenderers(IPC.PUSH_DM_EVENT, dmEvent)

  // Send desktop notification (do NOT include content -- it's E2E encrypted)
  if (Notification.isSupported()) {
    new Notification({
      title: 'New direct message',
      body: `${msg.senderDisplayName} sent you a message`
    }).show()
  }
}

function broadcastToRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
}
