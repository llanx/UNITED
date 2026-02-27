/**
 * WS event forwarder for voice channel events.
 *
 * Listens for incoming WebSocket messages, decodes protobuf envelopes,
 * and forwards voice events to all renderer windows via IPC push channels.
 * Mirrors the pattern in chat-events.ts: fromBinary(EnvelopeSchema, data)
 * with switch on envelope.payload.case.
 */

import { BrowserWindow } from 'electron'
import { fromBinary } from '@bufbuild/protobuf'
import { EnvelopeSchema } from '@shared/generated/ws_pb'
import { IPC } from '../ipc/channels'
import { wsClient } from './client'

interface VoiceEvent {
  type: string
  data: unknown
}

/**
 * Set up the WS listener for voice signaling and state events.
 * Must be called once during app initialization.
 */
export function setupVoiceEventListener(): void {
  wsClient.on('message', (data: Uint8Array) => {
    try {
      const envelope = fromBinary(EnvelopeSchema, data)
      const payload = envelope.payload

      switch (payload.case) {
        case 'voiceJoinResponse': {
          const resp = payload.value
          const event: VoiceEvent = {
            type: 'join_response',
            data: {
              participants: resp.participants.map(p => ({
                userId: p.userId,
                displayName: p.displayName,
                pubkey: p.pubkey,
                muted: p.muted,
                deafened: p.deafened,
              })),
              iceServers: resp.iceServers.map(s => ({
                urls: s.urls,
                username: s.username,
                credential: s.credential,
              })),
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        case 'voiceParticipantJoinedEvent': {
          const evt = payload.value
          const participant = evt.participant
          if (!participant) break

          const event: VoiceEvent = {
            type: 'participant_joined',
            data: {
              channelId: evt.channelId,
              participant: {
                userId: participant.userId,
                displayName: participant.displayName,
                pubkey: participant.pubkey,
                muted: participant.muted,
                deafened: participant.deafened,
              },
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        case 'voiceLeaveEvent': {
          const evt = payload.value
          const event: VoiceEvent = {
            type: 'participant_left',
            data: {
              channelId: evt.channelId,
              userId: evt.userId,
              displayName: evt.displayName,
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        case 'voiceSdpOffer': {
          const evt = payload.value
          const event: VoiceEvent = {
            type: 'sdp_offer',
            data: {
              senderUserId: evt.senderUserId,
              sdp: evt.sdp,
              channelId: evt.channelId,
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        case 'voiceSdpAnswer': {
          const evt = payload.value
          const event: VoiceEvent = {
            type: 'sdp_answer',
            data: {
              senderUserId: evt.senderUserId,
              sdp: evt.sdp,
              channelId: evt.channelId,
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        case 'voiceIceCandidate': {
          const evt = payload.value
          const event: VoiceEvent = {
            type: 'ice_candidate',
            data: {
              senderUserId: evt.senderUserId,
              candidateJson: evt.candidateJson,
              channelId: evt.channelId,
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        case 'voiceStateUpdate': {
          const evt = payload.value
          const event: VoiceEvent = {
            type: 'state_update',
            data: {
              channelId: evt.channelId,
              userId: evt.userId,
              muted: evt.muted,
              deafened: evt.deafened,
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        case 'voiceSpeakingEvent': {
          const evt = payload.value
          const event: VoiceEvent = {
            type: 'speaking',
            data: {
              channelId: evt.channelId,
              userId: evt.userId,
              speaking: evt.speaking,
            },
          }
          broadcastToRenderers(IPC.PUSH_VOICE_EVENT, event)
          break
        }

        default:
          // Not a voice event -- other listeners handle it
          break
      }
    } catch {
      // Not a protobuf message we care about, ignore
      // (allows chat-events.ts, dm-events.ts, and voice-events.ts to coexist)
    }
  })
}

function broadcastToRenderers(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, data)
  }
}
