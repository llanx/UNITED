/**
 * WS event forwarder for DM push events.
 *
 * Listens for incoming WebSocket messages related to DMs,
 * decrypts message content using the shared secret cache,
 * and forwards to all renderer windows via IPC push channels.
 */

import { BrowserWindow, Notification } from 'electron'
import { IPC } from '../ipc/channels'
import { wsClient } from './client'
import {
  getOrComputeSharedSecret,
  decryptDmMessage,
  clearSharedSecretCache
} from '../ipc/dm-crypto'
import { getAccessToken, getServerUrl } from '../ipc/auth'
import type { DmEvent, DecryptedDmMessage, DmConversation } from '@shared/ipc-bridge'

// Wire format for DM push events from server
interface WsDmMessagePayload {
  type: 'dm_message'
  id: string
  conversation_id: string
  sender_pubkey: string
  sender_display_name: string
  encrypted_payload: string  // base64
  nonce: string              // base64
  timestamp: number
  server_sequence: number
}

interface WsDmConversationPayload {
  type: 'dm_conversation_created'
  conversation: DmConversation
}

interface WsDmKeyRotatedPayload {
  type: 'dm_key_rotated'
  user_pubkey: string
}

type WsDmPayload = WsDmMessagePayload | WsDmConversationPayload | WsDmKeyRotatedPayload

/**
 * Set up the WS listener for DM push events.
 * Must be called once during app initialization.
 */
export function setupDmEventListener(): void {
  wsClient.on('message', async (data: Uint8Array) => {
    // DM events come as JSON text messages (not protobuf)
    // Try to parse as JSON -- if it fails, it's a protobuf message handled elsewhere
    let payload: WsDmPayload
    try {
      const text = new TextDecoder().decode(data)
      const parsed = JSON.parse(text)
      // Only handle DM-typed payloads
      if (!parsed.type || !parsed.type.startsWith('dm_')) return
      payload = parsed as WsDmPayload
    } catch {
      // Not a JSON message -- ignore (probably protobuf handled by chat-events.ts)
      return
    }

    switch (payload.type) {
      case 'dm_message': {
        await handleDmMessage(payload)
        break
      }

      case 'dm_conversation_created': {
        const dmEvent: DmEvent = {
          type: 'conversation-created',
          conversation: payload.conversation
        }
        broadcastToRenderers(IPC.PUSH_DM_EVENT, dmEvent)
        break
      }

      case 'dm_key_rotated': {
        // Clear shared secret cache for this user's conversations
        clearSharedSecretCache()
        broadcastToRenderers(IPC.PUSH_DM_KEY_ROTATED, payload.user_pubkey)
        break
      }
    }
  })
}

async function handleDmMessage(msg: WsDmMessagePayload): Promise<void> {
  const url = getServerUrl()
  const token = getAccessToken()
  if (!url || !token) return

  let decryptedMessage: DecryptedDmMessage

  try {
    const sharedSecret = await getOrComputeSharedSecret(
      msg.conversation_id, msg.sender_pubkey, url, token
    )

    if (sharedSecret) {
      const encrypted = Buffer.from(msg.encrypted_payload, 'base64')
      const nonce = Buffer.from(msg.nonce, 'base64')
      const content = decryptDmMessage(encrypted, nonce, sharedSecret)

      decryptedMessage = {
        id: msg.id,
        conversationId: msg.conversation_id,
        senderPubkey: msg.sender_pubkey,
        senderDisplayName: msg.sender_display_name,
        content,
        timestamp: msg.timestamp,
        serverSequence: msg.server_sequence,
        decryptionFailed: false
      }
    } else {
      decryptedMessage = {
        id: msg.id,
        conversationId: msg.conversation_id,
        senderPubkey: msg.sender_pubkey,
        senderDisplayName: msg.sender_display_name,
        content: '[Unable to decrypt]',
        timestamp: msg.timestamp,
        serverSequence: msg.server_sequence,
        decryptionFailed: true
      }
    }
  } catch {
    decryptedMessage = {
      id: msg.id,
      conversationId: msg.conversation_id,
      senderPubkey: msg.sender_pubkey,
      senderDisplayName: msg.sender_display_name,
      content: '[Unable to decrypt]',
      timestamp: msg.timestamp,
      serverSequence: msg.server_sequence,
      decryptionFailed: true
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
      body: `${msg.sender_display_name} sent you a message`
    }).show()
  }
}

function broadcastToRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
}
