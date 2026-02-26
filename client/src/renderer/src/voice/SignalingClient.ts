/**
 * Voice signaling client for WebRTC SDP/ICE exchange via WS.
 *
 * All send methods call window.united.voice.* (IPC to main, which forwards to WS).
 * All receive callbacks are registered via window.united.onVoiceEvent (push from main).
 */

export interface VoiceEventData {
  type: 'join_response' | 'participant_joined' | 'participant_left' |
        'sdp_offer' | 'sdp_answer' | 'ice_candidate' | 'state_update' | 'speaking'
  data: unknown
}

export interface JoinResponseData {
  participants: Array<{
    userId: string
    displayName: string
    pubkey: string
    muted: boolean
    deafened: boolean
  }>
  iceServers: Array<{ urls: string[]; username: string; credential: string }>
}

export interface ParticipantJoinedData {
  channelId: string
  participant: {
    userId: string
    displayName: string
    pubkey: string
    muted: boolean
    deafened: boolean
  }
}

export interface ParticipantLeftData {
  channelId: string
  userId: string
  displayName: string
}

export interface SdpData {
  senderUserId: string
  sdp: string
  channelId: string
}

export interface IceCandidateData {
  senderUserId: string
  candidateJson: string
  channelId: string
}

export interface StateUpdateData {
  channelId: string
  userId: string
  muted: boolean
  deafened: boolean
}

export interface SpeakingData {
  channelId: string
  userId: string
  speaking: boolean
}

export type VoiceEventCallback = (event: VoiceEventData) => void

export class SignalingClient {
  private cleanupVoiceEvent: (() => void) | null = null
  private cleanupPttState: (() => void) | null = null

  // Callbacks for each event type
  onJoinResponse: ((data: JoinResponseData) => void) | null = null
  onParticipantJoined: ((data: ParticipantJoinedData) => void) | null = null
  onParticipantLeft: ((data: ParticipantLeftData) => void) | null = null
  onSdpOffer: ((data: SdpData) => void) | null = null
  onSdpAnswer: ((data: SdpData) => void) | null = null
  onIceCandidate: ((data: IceCandidateData) => void) | null = null
  onStateUpdate: ((data: StateUpdateData) => void) | null = null
  onSpeaking: ((data: SpeakingData) => void) | null = null
  onPttState: ((active: boolean) => void) | null = null

  /**
   * Start listening for voice events from main process.
   */
  start(): void {
    this.cleanupVoiceEvent = window.united.onVoiceEvent((event: VoiceEventData) => {
      this.handleEvent(event)
    })

    this.cleanupPttState = window.united.onPttState((active: boolean) => {
      this.onPttState?.(active)
    })
  }

  // ---- Send methods (renderer -> main -> WS) ----

  sendJoin(channelId: string): Promise<void> {
    return window.united.voice.join(channelId)
  }

  sendLeave(): Promise<void> {
    return window.united.voice.leave()
  }

  sendSdpOffer(targetUserId: string, sdp: string, channelId: string): Promise<void> {
    return window.united.voice.sendSdpOffer(targetUserId, sdp, channelId)
  }

  sendSdpAnswer(targetUserId: string, sdp: string, channelId: string): Promise<void> {
    return window.united.voice.sendSdpAnswer(targetUserId, sdp, channelId)
  }

  sendIceCandidate(targetUserId: string, candidateJson: string, channelId: string): Promise<void> {
    return window.united.voice.sendIceCandidate(targetUserId, candidateJson, channelId)
  }

  sendStateUpdate(channelId: string, muted: boolean, deafened: boolean): Promise<void> {
    return window.united.voice.sendStateUpdate(channelId, muted, deafened)
  }

  sendSpeaking(channelId: string, speaking: boolean): Promise<void> {
    return window.united.voice.sendSpeaking(channelId, speaking)
  }

  // ---- Internal event dispatch ----

  private handleEvent(event: VoiceEventData): void {
    switch (event.type) {
      case 'join_response':
        this.onJoinResponse?.(event.data as JoinResponseData)
        break
      case 'participant_joined':
        this.onParticipantJoined?.(event.data as ParticipantJoinedData)
        break
      case 'participant_left':
        this.onParticipantLeft?.(event.data as ParticipantLeftData)
        break
      case 'sdp_offer':
        this.onSdpOffer?.(event.data as SdpData)
        break
      case 'sdp_answer':
        this.onSdpAnswer?.(event.data as SdpData)
        break
      case 'ice_candidate':
        this.onIceCandidate?.(event.data as IceCandidateData)
        break
      case 'state_update':
        this.onStateUpdate?.(event.data as StateUpdateData)
        break
      case 'speaking':
        this.onSpeaking?.(event.data as SpeakingData)
        break
    }
  }

  /**
   * Remove all listeners and callbacks.
   */
  dispose(): void {
    this.cleanupVoiceEvent?.()
    this.cleanupPttState?.()
    this.cleanupVoiceEvent = null
    this.cleanupPttState = null
    this.onJoinResponse = null
    this.onParticipantJoined = null
    this.onParticipantLeft = null
    this.onSdpOffer = null
    this.onSdpAnswer = null
    this.onIceCandidate = null
    this.onStateUpdate = null
    this.onSpeaking = null
    this.onPttState = null
  }
}
