/**
 * Full-mesh WebRTC voice connection manager.
 *
 * Creates and manages RTCPeerConnection instances for each voice participant.
 * Uses lexicographic user_id comparison to determine offer/answer roles,
 * preventing duplicate connections. Handles ICE candidate queueing,
 * connection recovery, speaking detection, and stats polling.
 */

import type { SignalingClient } from './SignalingClient'
import type { AudioPipeline } from './AudioPipeline'

export type ConnectionQuality = 'good' | 'degraded' | 'poor'

export interface VoiceQualityMetrics {
  rttMs: number
  packetLoss: number
  jitter: number
  quality: ConnectionQuality
}

interface PeerConnection {
  pc: RTCPeerConnection
  userId: string
  pendingCandidates: RTCIceCandidateInit[]
  remoteDescriptionSet: boolean
  disconnectTimer: ReturnType<typeof setTimeout> | null
}

/** Max bitrate for Opus voice codec (40kbps per CONTEXT research) */
const OPUS_MAX_BITRATE = 40_000

/** Interval for speaking detection loop (ms) */
const SPEAKING_INTERVAL_MS = 50

/** Interval for stats polling (ms) */
const STATS_POLL_INTERVAL_MS = 2000

/** Disconnect timeout before removing peer (ms) */
const DISCONNECT_TIMEOUT_MS = 15_000

/** Quality thresholds */
const QUALITY_THRESHOLDS = {
  poor: { rtt: 0.3, loss: 0.05 },
  degraded: { rtt: 0.15, loss: 0.02 },
}

export class VoiceManager {
  private signaling: SignalingClient
  private audio: AudioPipeline
  private peers: Map<string, PeerConnection> = new Map()
  private localUserId: string = ''
  private channelId: string = ''
  private iceConfig: RTCConfiguration = {}
  private speakingInterval: ReturnType<typeof setInterval> | null = null
  private statsInterval: ReturnType<typeof setInterval> | null = null
  private previousSpeakingState: Map<string, boolean> = new Map()
  private localSpeaking: boolean = false

  // Callbacks for state updates
  onSpeakingChange: ((userId: string, speaking: boolean) => void) | null = null
  onLocalSpeakingChange: ((speaking: boolean) => void) | null = null
  onQualityChange: ((userId: string, metrics: VoiceQualityMetrics) => void) | null = null
  onOverallQualityChange: ((quality: ConnectionQuality, metrics: VoiceQualityMetrics) => void) | null = null

  constructor(signaling: SignalingClient, audio: AudioPipeline) {
    this.signaling = signaling
    this.audio = audio
  }

  /**
   * Join a voice channel with existing participants and ICE server config.
   * Captures local mic, creates peer connections for each existing participant.
   */
  async joinChannel(
    channelId: string,
    localUserId: string,
    existingParticipants: Array<{ userId: string; displayName: string; pubkey: string; muted: boolean; deafened: boolean }>,
    iceServers: Array<{ urls: string[]; username: string; credential: string }>
  ): Promise<void> {
    this.channelId = channelId
    this.localUserId = localUserId
    this.iceConfig = {
      iceServers: iceServers.map(s => ({
        urls: s.urls,
        username: s.username,
        credential: s.credential,
      })),
    }

    // Capture local mic
    await this.audio.captureLocalMic()

    // Create peer connections for each existing participant
    for (const participant of existingParticipants) {
      if (participant.userId === localUserId) continue
      await this.createPeerConnection(participant.userId, this.shouldOffer(participant.userId))
    }

    // Start speaking detection loop
    this.startSpeakingDetection()

    // Start stats polling loop
    this.startStatsPolling()
  }

  /**
   * Handle a new participant joining the voice channel.
   */
  async handleNewParticipant(participant: { userId: string }): Promise<void> {
    if (participant.userId === this.localUserId) return
    if (this.peers.has(participant.userId)) return
    await this.createPeerConnection(participant.userId, this.shouldOffer(participant.userId))
  }

  /**
   * Handle a participant leaving the voice channel.
   */
  handleParticipantLeft(userId: string): void {
    this.closePeerConnection(userId)
  }

  /**
   * Handle an incoming SDP offer.
   */
  async handleSdpOffer(fromUserId: string, sdp: string): Promise<void> {
    let peerConn = this.peers.get(fromUserId)
    if (!peerConn) {
      // Peer sent offer before we knew about them; create connection as answerer
      await this.createPeerConnection(fromUserId, false)
      peerConn = this.peers.get(fromUserId)
    }
    if (!peerConn) return

    const { pc } = peerConn

    await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }))
    peerConn.remoteDescriptionSet = true

    // Process queued ICE candidates (Pitfall 3)
    await this.processQueuedCandidates(fromUserId)

    // Create and send answer
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    if (answer.sdp) {
      this.signaling.sendSdpAnswer(fromUserId, answer.sdp, this.channelId)
    }
  }

  /**
   * Handle an incoming SDP answer.
   */
  async handleSdpAnswer(fromUserId: string, sdp: string): Promise<void> {
    const peerConn = this.peers.get(fromUserId)
    if (!peerConn) return

    await peerConn.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }))
    peerConn.remoteDescriptionSet = true

    // Process queued ICE candidates (Pitfall 3)
    await this.processQueuedCandidates(fromUserId)
  }

  /**
   * Handle an incoming ICE candidate.
   * If remote description not yet set, queue it (Pitfall 3 -- ICE candidate race).
   */
  async handleIceCandidate(fromUserId: string, candidateJson: string): Promise<void> {
    const peerConn = this.peers.get(fromUserId)
    if (!peerConn) return

    const candidate: RTCIceCandidateInit = JSON.parse(candidateJson)

    if (peerConn.remoteDescriptionSet) {
      await peerConn.pc.addIceCandidate(new RTCIceCandidate(candidate))
    } else {
      // Queue candidate until remote description is set
      peerConn.pendingCandidates.push(candidate)
    }
  }

  /**
   * Get stats for a specific peer connection.
   */
  async getStats(peerId: string): Promise<VoiceQualityMetrics | null> {
    const peerConn = this.peers.get(peerId)
    if (!peerConn) return null

    try {
      const stats = await peerConn.pc.getStats()
      let rtt = 0
      let loss = 0
      let jitter = 0

      stats.forEach((report) => {
        if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
          rtt = report.roundTripTime ?? 0
          loss = report.fractionLost ?? 0
          jitter = report.jitter ?? 0
        }
      })

      const quality = this.classifyQuality(rtt, loss)

      return {
        rttMs: Math.round(rtt * 1000),
        packetLoss: loss,
        jitter,
        quality,
      }
    } catch {
      return null
    }
  }

  /**
   * Leave the voice channel. Close all peer connections, stop all tracks,
   * clean up AudioPipeline.
   */
  async leaveChannel(): Promise<void> {
    // Stop detection loops
    this.stopSpeakingDetection()
    this.stopStatsPolling()

    // Close all peer connections
    for (const [userId] of this.peers) {
      this.closePeerConnection(userId)
    }
    this.peers.clear()

    // Clear speaking state
    this.previousSpeakingState.clear()
    this.localSpeaking = false

    // Send leave request
    try {
      await this.signaling.sendLeave()
    } catch {
      // Best effort -- may already be disconnected
    }

    // Clear callbacks
    this.onSpeakingChange = null
    this.onLocalSpeakingChange = null
    this.onQualityChange = null
    this.onOverallQualityChange = null
  }

  // ---- Private helpers ----

  /**
   * Determine if we should send the offer (vs. wait for the other peer's offer).
   * The peer with the lexicographically smaller user_id sends the offer.
   * Prevents duplicate connections (Pitfall 4).
   */
  private shouldOffer(remoteUserId: string): boolean {
    return this.localUserId < remoteUserId
  }

  /**
   * Create a new RTCPeerConnection for a peer and set up event handlers.
   */
  private async createPeerConnection(remoteUserId: string, isOfferer: boolean): Promise<void> {
    const pc = new RTCPeerConnection(this.iceConfig)

    const peerConn: PeerConnection = {
      pc,
      userId: remoteUserId,
      pendingCandidates: [],
      remoteDescriptionSet: false,
      disconnectTimer: null,
    }

    this.peers.set(remoteUserId, peerConn)

    // Add local audio track to the connection
    const localStream = this.audio.getLocalStream()
    if (localStream) {
      for (const track of localStream.getAudioTracks()) {
        pc.addTrack(track, localStream)
      }
    }

    // ontrack: route remote stream through AudioPipeline
    pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.audio.addRemoteStream(remoteUserId, event.streams[0])
      }
    }

    // onicecandidate: send via signaling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate(
          remoteUserId,
          JSON.stringify(event.candidate.toJSON()),
          this.channelId
        )
      }
    }

    // oniceconnectionstatechange: handle reconnection and disconnection
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState

      if (state === 'failed') {
        // Attempt ICE restart
        pc.restartIce()
        this.createAndSendOffer(remoteUserId, pc)
      } else if (state === 'disconnected') {
        // Start 15s timer; if not recovered, remove peer
        peerConn.disconnectTimer = setTimeout(() => {
          this.closePeerConnection(remoteUserId)
          this.onSpeakingChange?.(remoteUserId, false)
        }, DISCONNECT_TIMEOUT_MS)
      } else if (state === 'connected' || state === 'completed') {
        // Clear disconnect timer
        if (peerConn.disconnectTimer) {
          clearTimeout(peerConn.disconnectTimer)
          peerConn.disconnectTimer = null
        }

        // Set Opus max bitrate
        this.setOpusBitrate(pc)
      }
    }

    // If we're the offerer, create and send the offer
    if (isOfferer) {
      await this.createAndSendOffer(remoteUserId, pc)
    }
  }

  /**
   * Create an SDP offer and send it via signaling.
   */
  private async createAndSendOffer(remoteUserId: string, pc: RTCPeerConnection): Promise<void> {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    if (offer.sdp) {
      this.signaling.sendSdpOffer(remoteUserId, offer.sdp, this.channelId)
    }
  }

  /**
   * Process queued ICE candidates after remote description is set.
   */
  private async processQueuedCandidates(peerId: string): Promise<void> {
    const peerConn = this.peers.get(peerId)
    if (!peerConn) return

    for (const candidate of peerConn.pendingCandidates) {
      try {
        await peerConn.pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch {
        // Invalid candidate, skip
      }
    }
    peerConn.pendingCandidates = []
  }

  /**
   * Set Opus max bitrate to 40kbps after connection is established.
   */
  private async setOpusBitrate(pc: RTCPeerConnection): Promise<void> {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === 'audio') {
        try {
          const params = sender.getParameters()
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = OPUS_MAX_BITRATE
            await sender.setParameters(params)
          }
        } catch {
          // May not be supported in all browsers
        }
      }
    }
  }

  /**
   * Close and clean up a peer connection.
   */
  private closePeerConnection(userId: string): void {
    const peerConn = this.peers.get(userId)
    if (!peerConn) return

    if (peerConn.disconnectTimer) {
      clearTimeout(peerConn.disconnectTimer)
    }

    try {
      peerConn.pc.close()
    } catch {
      // Already closed
    }

    this.audio.removeRemoteStream(userId)
    this.peers.delete(userId)
    this.previousSpeakingState.delete(userId)
  }

  /**
   * Classify connection quality based on RTT and packet loss thresholds.
   */
  private classifyQuality(rtt: number, loss: number): ConnectionQuality {
    if (rtt > QUALITY_THRESHOLDS.poor.rtt || loss > QUALITY_THRESHOLDS.poor.loss) {
      return 'poor'
    }
    if (rtt > QUALITY_THRESHOLDS.degraded.rtt || loss > QUALITY_THRESHOLDS.degraded.loss) {
      return 'degraded'
    }
    return 'good'
  }

  // ---- Speaking detection loop ----

  private startSpeakingDetection(): void {
    this.speakingInterval = setInterval(() => {
      // Check local speaking state
      const localNowSpeaking = this.audio.getLocalRMS()
      if (localNowSpeaking !== this.localSpeaking) {
        this.localSpeaking = localNowSpeaking
        this.onLocalSpeakingChange?.(localNowSpeaking)
        // Broadcast local speaking state to other participants
        this.signaling.sendSpeaking(this.channelId, localNowSpeaking)
      }

      // Check remote peer speaking states
      for (const [peerId] of this.peers) {
        const nowSpeaking = this.audio.isSpeaking(peerId)
        const wasSpeaking = this.previousSpeakingState.get(peerId) ?? false

        if (nowSpeaking !== wasSpeaking) {
          this.previousSpeakingState.set(peerId, nowSpeaking)
          this.onSpeakingChange?.(peerId, nowSpeaking)
        }
      }
    }, SPEAKING_INTERVAL_MS)
  }

  private stopSpeakingDetection(): void {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval)
      this.speakingInterval = null
    }
  }

  // ---- Stats polling loop ----

  private startStatsPolling(): void {
    this.statsInterval = setInterval(async () => {
      let worstQuality: ConnectionQuality = 'good'
      let worstMetrics: VoiceQualityMetrics = { rttMs: 0, packetLoss: 0, jitter: 0, quality: 'good' }

      for (const [peerId] of this.peers) {
        const metrics = await this.getStats(peerId)
        if (metrics) {
          this.onQualityChange?.(peerId, metrics)

          // Track worst quality across all peers
          const qualityOrder: Record<ConnectionQuality, number> = { good: 0, degraded: 1, poor: 2 }
          if (qualityOrder[metrics.quality] > qualityOrder[worstQuality]) {
            worstQuality = metrics.quality
            worstMetrics = metrics
          }
        }
      }

      this.onOverallQualityChange?.(worstQuality, worstMetrics)
    }, STATS_POLL_INTERVAL_MS)
  }

  private stopStatsPolling(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
  }
}
