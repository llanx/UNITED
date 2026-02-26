/**
 * WS event forwarder for Phase 4 real-time chat events.
 *
 * Listens for incoming WebSocket messages, decodes protobuf envelopes,
 * and forwards chat, presence, and typing events to all renderer windows
 * via IPC push channels.
 */

import { BrowserWindow } from 'electron'
import { fromBinary } from '@bufbuild/protobuf'
import { EnvelopeSchema } from '@shared/generated/ws_pb'
import { IPC } from '../ipc/channels'
import { wsClient } from './client'
import { showMessageNotification } from '../ipc/notifications'
import type { ChatEvent, PresenceUpdate, TypingEvent } from '@shared/ipc-bridge'

/**
 * Set up the WS listener for Phase 4 chat/presence/typing events.
 * Must be called once during app initialization.
 */
export function setupChatEventListener(): void {
  wsClient.on('message', (data: Uint8Array) => {
    try {
      const envelope = fromBinary(EnvelopeSchema, data)
      const payload = envelope.payload

      switch (payload.case) {
        case 'newMessageEvent': {
          const msg = payload.value.message
          if (!msg) break

          const chatEvent: ChatEvent = {
            type: 'new',
            message: {
              id: msg.id,
              channel_id: msg.channelId,
              sender_pubkey: msg.senderPubkey,
              sender_display_name: msg.senderDisplayName,
              content: msg.content,
              timestamp: String(msg.timestamp),
              server_sequence: Number(msg.serverSequence),
              reply_to_id: msg.replyToId ?? null,
              reply_to_preview: null,
              edited_at: null,
              reactions: []
            }
          }

          broadcastToRenderers(IPC.PUSH_CHAT_EVENT, chatEvent)

          // Trigger notification for mentions (check mention_user_ids)
          // Notification logic is handled by the renderer checking mention state
          break
        }

        case 'messageEditedEvent': {
          const evt = payload.value
          const chatEvent: ChatEvent = {
            type: 'edited',
            messageId: evt.messageId,
            channelId: evt.channelId,
            newContent: evt.newContent,
            editTimestamp: String(evt.editTimestamp)
          }
          broadcastToRenderers(IPC.PUSH_CHAT_EVENT, chatEvent)
          break
        }

        case 'messageDeletedEvent': {
          const evt = payload.value
          const chatEvent: ChatEvent = {
            type: 'deleted',
            messageId: evt.messageId,
            channelId: evt.channelId
          }
          broadcastToRenderers(IPC.PUSH_CHAT_EVENT, chatEvent)
          break
        }

        case 'reactionAddedEvent': {
          const reaction = payload.value.reaction
          if (!reaction) break
          const chatEvent: ChatEvent = {
            type: 'reaction-added',
            messageId: reaction.messageId,
            userPubkey: reaction.userPubkey,
            emoji: reaction.emoji
          }
          broadcastToRenderers(IPC.PUSH_CHAT_EVENT, chatEvent)
          break
        }

        case 'reactionRemovedEvent': {
          const evt = payload.value
          const chatEvent: ChatEvent = {
            type: 'reaction-removed',
            messageId: evt.messageId,
            userPubkey: evt.userPubkey,
            emoji: evt.emoji
          }
          broadcastToRenderers(IPC.PUSH_CHAT_EVENT, chatEvent)
          break
        }

        case 'presenceUpdateEvent': {
          const update = payload.value.update
          if (!update) break

          // Map protobuf PresenceStatus enum to string
          const statusMap: Record<number, 'online' | 'away' | 'dnd' | 'offline'> = {
            1: 'online',
            2: 'away',
            3: 'dnd',
            4: 'offline'
          }

          const presenceEvent: PresenceUpdate = {
            userPubkey: update.userPubkey,
            displayName: '',
            status: statusMap[update.status] ?? 'offline'
          }
          broadcastToRenderers(IPC.PUSH_PRESENCE_EVENT, presenceEvent)
          break
        }

        case 'typingEvent': {
          const indicator = payload.value.indicator
          if (!indicator) break

          const typingEvent: TypingEvent = {
            channelId: indicator.channelId,
            userId: indicator.userPubkey,
            displayName: indicator.displayName
          }
          broadcastToRenderers(IPC.PUSH_TYPING_EVENT, typingEvent)
          break
        }

        default:
          // Not a chat/presence event -- other listeners handle it
          break
      }
    } catch {
      // Not a protobuf message we care about, ignore
    }
  })
}

function broadcastToRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
}
