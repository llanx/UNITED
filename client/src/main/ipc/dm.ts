/**
 * IPC handlers for Direct Message operations.
 *
 * Handles key publishing, conversation management, encrypted message
 * send/receive, offline message retrieval, and peer key status.
 * All REST calls go through the main process (CSP blocks renderer HTTP).
 */

import type { IpcMain } from 'electron'
import { IPC } from './channels'
import { getAccessToken, getServerUrl } from './auth'
import {
  getOrPublishDmKey,
  getOrComputeSharedSecret,
  encryptDmMessage,
  decryptDmMessage,
  fetchPeerDmKey
} from './dm-crypto'
import type {
  DmConversation,
  DecryptedDmMessage
} from '@shared/ipc-bridge'

// ============================================================
// HTTP helpers (main process only -- CSP blocks renderer HTTP)
// ============================================================

async function apiGet<T>(url: string, path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${url}${path}`, { method: 'GET', headers })
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API ${path} failed (${response.status}): ${errorText}`)
  }
  return response.json() as Promise<T>
}

async function apiPost<T>(url: string, path: string, body: Record<string, unknown>, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(`${url}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`API ${path} failed (${response.status}): ${errorText}`)
  }
  return response.json() as Promise<T>
}

// ============================================================
// Server response types (wire format)
// ============================================================

interface EncryptedDmMessage {
  id: string
  conversation_id: string
  sender_pubkey: string
  sender_display_name: string
  encrypted_payload: string  // base64
  nonce: string              // base64
  timestamp: number
  server_sequence: number
}

interface DmHistoryResponse {
  messages: EncryptedDmMessage[]
  has_more: boolean
}

interface DmOfflineResponse {
  messages: EncryptedDmMessage[]
}

// ============================================================
// Helpers
// ============================================================

function requireAuth(): { url: string; token: string } {
  const url = getServerUrl()
  const token = getAccessToken()
  if (!url || !token) throw new Error('Not connected or not authenticated')
  return { url, token }
}

/**
 * Decrypt a single encrypted DM message from the server wire format.
 * Returns a DecryptedDmMessage with plaintext content.
 * On decryption failure: returns the message with "[Unable to decrypt]" content.
 */
function decryptServerMessage(
  msg: EncryptedDmMessage,
  sharedSecret: Buffer
): DecryptedDmMessage {
  try {
    const encrypted = Buffer.from(msg.encrypted_payload, 'base64')
    const nonce = Buffer.from(msg.nonce, 'base64')
    const content = decryptDmMessage(encrypted, nonce, sharedSecret)

    return {
      id: msg.id,
      conversationId: msg.conversation_id,
      senderPubkey: msg.sender_pubkey,
      senderDisplayName: msg.sender_display_name,
      content,
      timestamp: msg.timestamp,
      serverSequence: msg.server_sequence,
      decryptionFailed: false
    }
  } catch {
    return {
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
}

// ============================================================
// IPC handlers
// ============================================================

export function registerDmHandlers(ipcMain: IpcMain): void {
  // Publish X25519 key to server (called on startup after auth)
  ipcMain.handle(IPC.DM_PUBLISH_KEY, async (): Promise<string> => {
    const { url, token } = requireAuth()
    return getOrPublishDmKey(url, token)
  })

  // List DM conversations
  ipcMain.handle(IPC.DM_LIST_CONVERSATIONS, async (): Promise<DmConversation[]> => {
    const { url, token } = requireAuth()
    return apiGet<DmConversation[]>(url, '/api/dm/conversations', token)
  })

  // Create a new DM conversation
  ipcMain.handle(IPC.DM_CREATE_CONVERSATION, async (
    _event,
    recipientPubkey: string
  ): Promise<DmConversation> => {
    const { url, token } = requireAuth()
    return apiPost<DmConversation>(
      url,
      '/api/dm/conversations',
      { recipient_pubkey: recipientPubkey },
      token
    )
  })

  // Send an encrypted DM message
  ipcMain.handle(IPC.DM_SEND_MESSAGE, async (
    _event,
    conversationId: string,
    recipientPubkey: string,
    content: string
  ): Promise<DecryptedDmMessage | { error: string; message: string }> => {
    const { url, token } = requireAuth()

    // Get shared secret (may need to fetch peer key and compute)
    const sharedSecret = await getOrComputeSharedSecret(
      conversationId, recipientPubkey, url, token
    )

    if (!sharedSecret) {
      return {
        error: 'key_unavailable',
        message: 'Recipient has not published encryption keys'
      }
    }

    // Encrypt the message
    const { encrypted, nonce } = encryptDmMessage(content, sharedSecret)

    // Send to server
    const serverMsg = await apiPost<EncryptedDmMessage>(
      url,
      '/api/dm/messages',
      {
        conversation_id: conversationId,
        encrypted_payload: encrypted.toString('base64'),
        nonce: nonce.toString('base64'),
        timestamp: Date.now()
      },
      token
    )

    // Return decrypted message so sender's UI can display immediately
    return {
      id: serverMsg.id,
      conversationId: serverMsg.conversation_id,
      senderPubkey: serverMsg.sender_pubkey,
      senderDisplayName: serverMsg.sender_display_name,
      content, // Original plaintext, no need to re-decrypt
      timestamp: serverMsg.timestamp,
      serverSequence: serverMsg.server_sequence,
      decryptionFailed: false
    }
  })

  // Fetch and decrypt DM message history
  ipcMain.handle(IPC.DM_FETCH_HISTORY, async (
    _event,
    conversationId: string,
    recipientPubkey: string,
    beforeSequence?: number,
    limit?: number
  ): Promise<{ messages: DecryptedDmMessage[]; hasMore: boolean }> => {
    const { url, token } = requireAuth()

    const params = new URLSearchParams()
    if (beforeSequence !== undefined) params.set('before', String(beforeSequence))
    if (limit !== undefined) params.set('limit', String(limit))
    const qs = params.toString()
    const path = `/api/dm/messages/${conversationId}${qs ? `?${qs}` : ''}`

    const result = await apiGet<DmHistoryResponse>(url, path, token)

    // Get shared secret for decryption
    const sharedSecret = await getOrComputeSharedSecret(
      conversationId, recipientPubkey, url, token
    )

    if (!sharedSecret) {
      // Cannot decrypt -- return all as failed
      return {
        messages: result.messages.map(msg => ({
          id: msg.id,
          conversationId: msg.conversation_id,
          senderPubkey: msg.sender_pubkey,
          senderDisplayName: msg.sender_display_name,
          content: '[Unable to decrypt]',
          timestamp: msg.timestamp,
          serverSequence: msg.server_sequence,
          decryptionFailed: true
        })),
        hasMore: result.has_more
      }
    }

    // Decrypt each message individually (graceful failure per message)
    const decrypted = result.messages.map(msg =>
      decryptServerMessage(msg, sharedSecret)
    )

    return { messages: decrypted, hasMore: result.has_more }
  })

  // Fetch and decrypt offline DM messages
  ipcMain.handle(IPC.DM_FETCH_OFFLINE, async (): Promise<Record<string, DecryptedDmMessage[]>> => {
    const { url, token } = requireAuth()

    const result = await apiGet<DmOfflineResponse>(url, '/api/dm/offline', token)

    // Group by conversation_id and decrypt
    const grouped: Record<string, DecryptedDmMessage[]> = {}

    for (const msg of result.messages) {
      const convId = msg.conversation_id
      if (!grouped[convId]) grouped[convId] = []

      // Get shared secret for this conversation's sender
      const sharedSecret = await getOrComputeSharedSecret(
        convId, msg.sender_pubkey, url, token
      )

      if (sharedSecret) {
        grouped[convId].push(decryptServerMessage(msg, sharedSecret))
      } else {
        grouped[convId].push({
          id: msg.id,
          conversationId: msg.conversation_id,
          senderPubkey: msg.sender_pubkey,
          senderDisplayName: msg.sender_display_name,
          content: '[Unable to decrypt]',
          timestamp: msg.timestamp,
          serverSequence: msg.server_sequence,
          decryptionFailed: true
        })
      }
    }

    return grouped
  })

  // Delete a local DM message (local SQLite only, no server call)
  ipcMain.handle(IPC.DM_DELETE_LOCAL, async (
    _event,
    _conversationId: string,
    _messageId: string
  ): Promise<void> => {
    // Local-only delete: per CONTEXT.md "Delete for self only"
    // The DM store in the renderer handles removing from state.
    // Future: persist DM messages in local SQLite and delete from there.
    // For now this is a no-op on the main process side since DM history
    // is kept in renderer memory and fetched from server on reload.
  })

  // Check if a peer has published an X25519 key
  ipcMain.handle(IPC.DM_GET_PEER_KEY_STATUS, async (
    _event,
    peerPubkey: string
  ): Promise<{ available: boolean }> => {
    const { url, token } = requireAuth()
    const key = await fetchPeerDmKey(url, token, peerPubkey)
    return { available: key !== null }
  })

  // Block a user (DM-level blocking)
  ipcMain.handle(IPC.DM_BLOCK_USER, async (
    _event,
    userPubkey: string
  ): Promise<void> => {
    const { url, token } = requireAuth()
    await apiPost<unknown>(
      url,
      '/api/dm/block',
      { user_pubkey: userPubkey },
      token
    )
  })

  // Unblock a user
  ipcMain.handle(IPC.DM_UNBLOCK_USER, async (
    _event,
    userPubkey: string
  ): Promise<void> => {
    const { url, token } = requireAuth()
    await apiPost<unknown>(
      url,
      '/api/dm/unblock',
      { user_pubkey: userPubkey },
      token
    )
  })
}
