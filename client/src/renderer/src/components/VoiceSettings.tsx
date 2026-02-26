/**
 * Settings > Voice panel.
 *
 * Sections:
 * - Voice Mode (VAD / PTT radio buttons)
 * - VAD Sensitivity slider (shown when mode = 'vad')
 * - Push to Talk key config (shown when mode = 'ptt')
 * - Input Device dropdown
 * - Output Device dropdown
 * - Output Volume slider
 * - Mic Test button
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../stores'

export default function VoiceSettings() {
  const voiceMode = useStore((s) => s.voiceMode)
  const vadSensitivity = useStore((s) => s.vadSensitivity)
  const inputDeviceId = useStore((s) => s.inputDeviceId)
  const outputDeviceId = useStore((s) => s.outputDeviceId)
  const outputVolume = useStore((s) => s.outputVolume)
  const setVoiceMode = useStore((s) => s.setVoiceMode)
  const setVadSensitivity = useStore((s) => s.setVadSensitivity)
  const setInputDevice = useStore((s) => s.setInputDevice)
  const setOutputDevice = useStore((s) => s.setOutputDevice)
  const setOutputVolume = useStore((s) => s.setOutputVolume)

  // Device enumeration
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputDevices(devices.filter((d) => d.kind === 'audioinput'))
      setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'))
    } catch {
      // Permission denied or unavailable
    }
  }, [])

  useEffect(() => {
    enumerateDevices()
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices)
    }
  }, [enumerateDevices])

  // PTT key config
  const [pttKeyName, setPttKeyName] = useState('Backtick (`)')
  const [listeningForKey, setListeningForKey] = useState(false)

  useEffect(() => {
    // Load current PTT key name
    window.united.voice.getPttKey().then((keyCode: number) => {
      setPttKeyName(keyCodeToName(keyCode))
    }).catch(() => {
      // Default
    })
  }, [])

  useEffect(() => {
    if (!listeningForKey) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setPttKeyName(e.key === '`' ? 'Backtick (`)' : e.key)
      // We store keyCode via the main process PTT module
      // For now, map common keys. The actual uiohook key code is set by the main process.
      setListeningForKey(false)
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [listeningForKey])

  // Mic test
  const [micTesting, setMicTesting] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const micTestRef = useRef<{
    stream: MediaStream
    ctx: AudioContext
    analyser: AnalyserNode
    interval: ReturnType<typeof setInterval>
  } | null>(null)

  const startMicTest = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      // Also play back through output device
      const dest = ctx.createMediaStreamDestination()
      source.connect(dest)
      const audioEl = new Audio()
      audioEl.srcObject = dest.stream
      if (outputDeviceId && 'setSinkId' in audioEl) {
        await (audioEl as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(outputDeviceId)
      }
      audioEl.play().catch(() => {
        // Autoplay may be blocked
      })

      const dataArray = new Float32Array(analyser.frequencyBinCount)
      const interval = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)
        setMicLevel(Math.min(1, rms * 10))
      }, 50)

      micTestRef.current = { stream, ctx, analyser, interval }
      setMicTesting(true)

      // Auto-stop after 5 seconds
      setTimeout(() => stopMicTest(), 5000)
    } catch {
      // Permission denied
    }
  }

  const stopMicTest = () => {
    const ref = micTestRef.current
    if (ref) {
      clearInterval(ref.interval)
      ref.stream.getTracks().forEach((t) => t.stop())
      ref.ctx.close().catch(() => {})
      micTestRef.current = null
    }
    setMicTesting(false)
    setMicLevel(0)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicTest()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // VAD sensitivity live indicator
  const [vadLevel, setVadLevel] = useState(0)
  const vadRef = useRef<{
    stream: MediaStream
    ctx: AudioContext
    analyser: AnalyserNode
    interval: ReturnType<typeof setInterval>
  } | null>(null)

  useEffect(() => {
    if (voiceMode !== 'vad') {
      // Clean up VAD monitor
      if (vadRef.current) {
        clearInterval(vadRef.current.interval)
        vadRef.current.stream.getTracks().forEach((t) => t.stop())
        vadRef.current.ctx.close().catch(() => {})
        vadRef.current = null
        setVadLevel(0)
      }
      return
    }

    // Start VAD level monitoring
    let mounted = true
    const startMonitor = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return }

        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        const dataArray = new Float32Array(analyser.frequencyBinCount)
        const interval = setInterval(() => {
          analyser.getFloatTimeDomainData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i]
          }
          const rms = Math.sqrt(sum / dataArray.length)
          setVadLevel(Math.min(1, rms * 10))
        }, 50)

        vadRef.current = { stream, ctx, analyser, interval }
      } catch {
        // Permission denied -- can't show level
      }
    }
    startMonitor()

    return () => {
      mounted = false
      if (vadRef.current) {
        clearInterval(vadRef.current.interval)
        vadRef.current.stream.getTracks().forEach((t) => t.stop())
        vadRef.current.ctx.close().catch(() => {})
        vadRef.current = null
      }
    }
  }, [voiceMode, inputDeviceId])

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-white/5 px-4">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          Voice Settings
        </span>
        <button
          onClick={() => useStore.setState({ activePanel: 'chat' })}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-lg space-y-6">
          {/* Voice Mode */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Voice Mode
            </h3>
            <div className="flex gap-3">
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                voiceMode === 'vad'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]'
                  : 'border-white/10 text-[var(--color-text-muted)] hover:border-white/20'
              }`}>
                <input
                  type="radio"
                  name="voiceMode"
                  value="vad"
                  checked={voiceMode === 'vad'}
                  onChange={() => setVoiceMode('vad')}
                  className="sr-only"
                />
                Voice Activity
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                voiceMode === 'ptt'
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)]'
                  : 'border-white/10 text-[var(--color-text-muted)] hover:border-white/20'
              }`}>
                <input
                  type="radio"
                  name="voiceMode"
                  value="ptt"
                  checked={voiceMode === 'ptt'}
                  onChange={() => setVoiceMode('ptt')}
                  className="sr-only"
                />
                Push to Talk
              </label>
            </div>
          </section>

          {/* VAD Sensitivity (shown when mode = 'vad') */}
          {voiceMode === 'vad' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                VAD Sensitivity
              </h3>
              <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                <span>Sensitive</span>
                <span>Aggressive</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={vadSensitivity}
                onChange={(e) => setVadSensitivity(parseInt(e.target.value, 10))}
                className="w-full accent-[var(--color-accent)]"
              />
              {/* Live mic level indicator */}
              <div className="mt-2">
                <div className="text-[10px] text-[var(--color-text-muted)]">Mic Level</div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-75"
                    style={{
                      width: `${vadLevel * 100}%`,
                      backgroundColor: vadLevel > 0.5 ? '#43b581' : vadLevel > 0.2 ? '#faa61a' : '#43b581',
                    }}
                  />
                </div>
              </div>
            </section>
          )}

          {/* PTT Key Config (shown when mode = 'ptt') */}
          {voiceMode === 'ptt' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Push to Talk Key
              </h3>
              <div className="flex items-center gap-3">
                <div className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-[var(--color-text-primary)]">
                  {listeningForKey ? 'Press a key...' : pttKeyName}
                </div>
                <button
                  onClick={() => setListeningForKey(!listeningForKey)}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    listeningForKey
                      ? 'bg-[#f04747] text-white'
                      : 'bg-white/10 text-[var(--color-text-muted)] hover:bg-white/15 hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {listeningForKey ? 'Cancel' : 'Change'}
                </button>
              </div>
            </section>
          )}

          {/* Input Device */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Input Device
            </h3>
            <select
              value={inputDeviceId ?? ''}
              onChange={(e) => setInputDevice(e.target.value)}
              className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Default</option>
              {inputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
                </option>
              ))}
            </select>
          </section>

          {/* Output Device */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Output Device
            </h3>
            <select
              value={outputDeviceId ?? ''}
              onChange={(e) => setOutputDevice(e.target.value)}
              className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Default</option>
              {outputDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Speaker (${d.deviceId.slice(0, 8)})`}
                </option>
              ))}
            </select>
          </section>

          {/* Output Volume */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Output Volume: {outputVolume}%
            </h3>
            <input
              type="range"
              min={0}
              max={100}
              value={outputVolume}
              onChange={(e) => setOutputVolume(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--color-accent)]"
            />
          </section>

          {/* Mic Test */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Mic Test
            </h3>
            <button
              onClick={micTesting ? stopMicTest : startMicTest}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                micTesting
                  ? 'bg-[#f04747] text-white hover:bg-[#f04747]/80'
                  : 'bg-[var(--color-accent)] text-white hover:opacity-90'
              }`}
            >
              {micTesting ? 'Stop Test' : 'Test Microphone'}
            </button>
            {micTesting && (
              <div className="mt-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-75"
                    style={{
                      width: `${micLevel * 100}%`,
                      backgroundColor: '#43b581',
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">
                  Speak into your microphone. You should hear yourself. Stops in 5 seconds.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/** Map a keyboard key to a human-readable name */
function keyCodeToName(code: number): string {
  // uiohook key codes -- just handle the default
  // 41 = Backtick/Grave in uiohook-napi
  if (code === 41) return 'Backtick (`)'
  return `Key ${code}`
}
