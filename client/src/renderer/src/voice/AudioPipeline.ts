/**
 * Web Audio API pipeline for voice chat.
 *
 * Manages AudioContext, local microphone capture, remote stream routing,
 * per-user volume (GainNode), speaking detection (AnalyserNode), master
 * gain for deafen, and output device selection.
 */

interface PeerAudioState {
  source: MediaStreamAudioSourceNode
  gain: GainNode
  analyser: AnalyserNode
  stream: MediaStream
}

/** RMS threshold for voice activity detection (0.0 - 1.0) */
const DEFAULT_VAD_THRESHOLD = 0.01

export class AudioPipeline {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private localStream: MediaStream | null = null
  private localAnalyser: AnalyserNode | null = null
  private localSource: MediaStreamAudioSourceNode | null = null
  private peerAudio: Map<string, PeerAudioState> = new Map()
  private audioElements: Map<string, HTMLAudioElement> = new Map()

  /**
   * Initialize AudioContext. Must be called on user gesture (e.g., join click)
   * to satisfy browser autoplay policy.
   */
  async init(): Promise<void> {
    this.audioContext = new AudioContext()
    // Resume immediately to handle autoplay policy (Pitfall 1)
    await this.audioContext.resume()

    this.masterGain = this.audioContext.createGain()
    this.masterGain.connect(this.audioContext.destination)
  }

  /**
   * Capture local microphone with echo cancellation, noise suppression, and AGC.
   * On macOS, checks mic permission first via IPC.
   */
  async captureLocalMic(constraints?: MediaTrackConstraints): Promise<MediaStream> {
    // Check mic permission on macOS via IPC
    try {
      const permission = await window.united.voice.checkMicPermission()
      if (permission === 'denied') {
        throw new Error('Microphone permission denied. Please allow microphone access in System Settings.')
      }
    } catch {
      // Non-macOS or IPC not available -- proceed with getUserMedia which will prompt
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...constraints,
      },
    })

    this.localStream = stream

    // Set up local analyser for local VAD / settings indicator
    if (this.audioContext) {
      this.localSource = this.audioContext.createMediaStreamSource(stream)
      this.localAnalyser = this.audioContext.createAnalyser()
      this.localAnalyser.fftSize = 256
      this.localSource.connect(this.localAnalyser)
      // Do NOT connect localAnalyser to destination -- local mic audio is not played locally
    }

    return stream
  }

  /**
   * Route a remote peer's audio stream through the Web Audio graph.
   * Creates: MediaStreamSource -> GainNode -> masterGain -> destination
   * Also creates an AnalyserNode for per-peer speaking detection.
   */
  addRemoteStream(peerId: string, stream: MediaStream): void {
    if (!this.audioContext || !this.masterGain) return

    // Clean up existing if re-adding
    this.removeRemoteStream(peerId)

    const source = this.audioContext.createMediaStreamSource(stream)
    const gain = this.audioContext.createGain()
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 256

    // Route: source -> gain -> analyser -> masterGain -> destination
    source.connect(gain)
    gain.connect(analyser)
    analyser.connect(this.masterGain)

    this.peerAudio.set(peerId, { source, gain, analyser, stream })
  }

  /**
   * Remove and clean up audio nodes for a peer.
   */
  removeRemoteStream(peerId: string): void {
    const peer = this.peerAudio.get(peerId)
    if (!peer) return

    try {
      peer.source.disconnect()
      peer.gain.disconnect()
      peer.analyser.disconnect()
    } catch {
      // Nodes may already be disconnected
    }

    // Clean up any audio element used for output device routing
    const audioEl = this.audioElements.get(peerId)
    if (audioEl) {
      audioEl.pause()
      audioEl.srcObject = null
      audioEl.remove()
      this.audioElements.delete(peerId)
    }

    this.peerAudio.delete(peerId)
  }

  /**
   * Set per-user volume. Volume is 0-200 (100 = normal).
   */
  setUserVolume(peerId: string, volume: number): void {
    const peer = this.peerAudio.get(peerId)
    if (!peer) return
    peer.gain.gain.value = volume / 100
  }

  /**
   * Set master output volume (0-100).
   */
  setMasterVolume(volume: number): void {
    if (!this.masterGain) return
    this.masterGain.gain.value = volume / 100
  }

  /**
   * Deafen: set master gain to 0 (deafened) or restore to 1 (not deafened).
   */
  deafen(deafened: boolean): void {
    if (!this.masterGain) return
    this.masterGain.gain.value = deafened ? 0 : 1
  }

  /**
   * Mute local microphone by toggling MediaStreamTrack.enabled.
   */
  muteLocalMic(muted: boolean): void {
    if (!this.localStream) return
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted
    }
  }

  /**
   * Check if a remote peer is speaking using AnalyserNode RMS.
   */
  isSpeaking(peerId: string, threshold: number = DEFAULT_VAD_THRESHOLD): boolean {
    const peer = this.peerAudio.get(peerId)
    if (!peer) return false
    return this.computeRMS(peer.analyser) > threshold
  }

  /**
   * Check if the local user is speaking (for local VAD and settings indicator).
   */
  getLocalRMS(threshold: number = DEFAULT_VAD_THRESHOLD): boolean {
    if (!this.localAnalyser) return false
    return this.computeRMS(this.localAnalyser) > threshold
  }

  /**
   * Set output device using AudioContext.setSinkId if supported.
   * Falls back to creating <audio> elements with setSinkId.
   */
  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this.audioContext) return

    // Try AudioContext.setSinkId (Chrome 110+)
    if ('setSinkId' in this.audioContext && typeof (this.audioContext as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId === 'function') {
      await (this.audioContext as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId)
      return
    }

    // Fallback: create <audio> elements per peer with setSinkId
    for (const [peerId, peer] of this.peerAudio) {
      let audioEl = this.audioElements.get(peerId)
      if (!audioEl) {
        audioEl = document.createElement('audio')
        audioEl.autoplay = true
        this.audioElements.set(peerId, audioEl)
      }
      audioEl.srcObject = peer.stream
      if ('setSinkId' in audioEl && typeof (audioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId === 'function') {
        await (audioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId)
      }
    }
  }

  /**
   * Get the local MediaStream (for adding to RTCPeerConnection).
   */
  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /**
   * Compute RMS (root mean square) from an AnalyserNode.
   * Returns a value from 0.0 to ~1.0 representing audio level.
   */
  private computeRMS(analyser: AnalyserNode): number {
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)

    let sumSquares = 0
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i]
    }

    return Math.sqrt(sumSquares / data.length)
  }

  /**
   * Clean up everything. CRITICAL: must call track.stop() for ALL tracks.
   * pc.close() is not enough (Pitfall 6).
   */
  dispose(): void {
    // Stop all local tracks
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }

    // Disconnect local audio nodes
    try {
      this.localSource?.disconnect()
      this.localAnalyser?.disconnect()
    } catch {
      // May already be disconnected
    }
    this.localSource = null
    this.localAnalyser = null

    // Clean up all peer audio
    for (const [peerId] of this.peerAudio) {
      this.removeRemoteStream(peerId)
    }
    this.peerAudio.clear()

    // Disconnect master gain
    try {
      this.masterGain?.disconnect()
    } catch {
      // May already be disconnected
    }
    this.masterGain = null

    // Close AudioContext
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {
        // Best effort close
      })
    }
    this.audioContext = null
  }
}
