/**
 * IPC handlers for voice channel operations.
 *
 * Handles voice join/leave, SDP/ICE forwarding, PTT control,
 * mic permission checking, and voice mode switching.
 * Voice signaling messages are sent as protobuf binary over WS.
 */

import { type IpcMain, systemPreferences } from 'electron'
import { create, toBinary } from '@bufbuild/protobuf'
import {
  VoiceJoinRequestSchema,
  VoiceLeaveRequestSchema,
  VoiceSdpOfferSchema,
  VoiceSdpAnswerSchema,
  VoiceIceCandidateSchema,
  VoiceStateUpdateSchema,
  VoiceSpeakingEventSchema,
} from '@shared/generated/voice_pb'
import { EnvelopeSchema } from '@shared/generated/ws_pb'
import { IPC } from './channels'
import { wsClient } from '../ws/client'
import { startPTT, stopPTT, changePTTKey, getCurrentPTTKey } from '../voice/ptt'

/** Current voice mode: 'vad' or 'ptt' */
let voiceMode: 'vad' | 'ptt' = 'vad'

/**
 * Helper: wrap a voice protobuf message in an Envelope and send via WS.
 */
function sendVoiceMessage(
  payloadCase: string,
  payloadValue: unknown
): void {
  const envelope = create(EnvelopeSchema, {
    requestId: crypto.randomUUID(),
    payload: {
      case: payloadCase as 'voiceJoinRequest',
      value: payloadValue as never,
    },
  })
  const data = toBinary(EnvelopeSchema, envelope)
  wsClient.send(data)
}

/**
 * Register all voice IPC handlers.
 */
export function registerVoiceHandlers(ipcMain: IpcMain): void {
  // Join a voice channel
  ipcMain.handle(IPC.VOICE_JOIN, async (_event, channelId: string): Promise<void> => {
    const joinReq = create(VoiceJoinRequestSchema, { channelId })
    sendVoiceMessage('voiceJoinRequest', joinReq)

    // Start PTT if voice mode is PTT
    if (voiceMode === 'ptt') {
      startPTT()
    }
  })

  // Leave voice channel
  ipcMain.handle(IPC.VOICE_LEAVE, async (): Promise<void> => {
    const leaveReq = create(VoiceLeaveRequestSchema, { channelId: '' })
    sendVoiceMessage('voiceLeaveRequest', leaveReq)

    // Stop PTT
    stopPTT()
  })

  // Forward SDP offer to WS
  ipcMain.handle(
    IPC.VOICE_SEND_SDP_OFFER,
    async (_event, targetUserId: string, sdp: string, channelId: string): Promise<void> => {
      const offer = create(VoiceSdpOfferSchema, {
        targetUserId,
        sdp,
        channelId,
      })
      sendVoiceMessage('voiceSdpOffer', offer)
    }
  )

  // Forward SDP answer to WS
  ipcMain.handle(
    IPC.VOICE_SEND_SDP_ANSWER,
    async (_event, targetUserId: string, sdp: string, channelId: string): Promise<void> => {
      const answer = create(VoiceSdpAnswerSchema, {
        targetUserId,
        sdp,
        channelId,
      })
      sendVoiceMessage('voiceSdpAnswer', answer)
    }
  )

  // Forward ICE candidate to WS
  ipcMain.handle(
    IPC.VOICE_SEND_ICE_CANDIDATE,
    async (_event, targetUserId: string, candidateJson: string, channelId: string): Promise<void> => {
      const candidate = create(VoiceIceCandidateSchema, {
        targetUserId,
        candidateJson,
        channelId,
      })
      sendVoiceMessage('voiceIceCandidate', candidate)
    }
  )

  // Forward mute/deafen state to WS
  ipcMain.handle(
    IPC.VOICE_SEND_STATE_UPDATE,
    async (_event, channelId: string, muted: boolean, deafened: boolean): Promise<void> => {
      const update = create(VoiceStateUpdateSchema, {
        channelId,
        muted,
        deafened,
      })
      sendVoiceMessage('voiceStateUpdate', update)
    }
  )

  // Forward speaking state to WS
  ipcMain.handle(
    IPC.VOICE_SEND_SPEAKING,
    async (_event, channelId: string, speaking: boolean): Promise<void> => {
      const evt = create(VoiceSpeakingEventSchema, {
        channelId,
        speaking,
      })
      sendVoiceMessage('voiceSpeakingEvent', evt)
    }
  )

  // Set PTT key
  ipcMain.handle(IPC.VOICE_SET_PTT_KEY, async (_event, key: number): Promise<void> => {
    changePTTKey(key)
  })

  // Get current PTT key
  ipcMain.handle(IPC.VOICE_GET_PTT_KEY, async (): Promise<number> => {
    return getCurrentPTTKey()
  })

  // Set voice mode (vad or ptt)
  ipcMain.handle(IPC.VOICE_SET_MODE, async (_event, mode: 'vad' | 'ptt'): Promise<void> => {
    voiceMode = mode

    // If switching to PTT while in a voice channel, start PTT hook
    if (mode === 'ptt') {
      startPTT()
    } else {
      stopPTT()
    }
  })

  // Check microphone permission (macOS-specific)
  ipcMain.handle(IPC.VOICE_CHECK_MIC_PERMISSION, async (): Promise<string> => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      if (status !== 'granted') {
        // Request permission (only works on macOS)
        const granted = await systemPreferences.askForMediaAccess('microphone')
        return granted ? 'granted' : 'denied'
      }
      return status
    }
    // On non-macOS platforms, permission is handled by getUserMedia prompt
    return 'granted'
  })
}
