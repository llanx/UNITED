/**
 * Persistent bottom-left voice bar, shown when connected to a voice channel.
 *
 * Displays channel name, connection quality icon, mute/deafen/disconnect buttons.
 * Positioned above the user panel in ChannelSidebar.
 */

import { useStore } from '../stores'

/** Signal strength icon colored by connection quality */
function QualityIcon({ quality, metrics }: {
  quality: 'good' | 'degraded' | 'poor'
  metrics: { rttMs: number; packetLoss: number } | null
}) {
  const color = quality === 'good' ? '#43b581' : quality === 'degraded' ? '#faa61a' : '#f04747'
  const bars = quality === 'good' ? 4 : quality === 'degraded' ? 3 : 1
  const tooltip = metrics
    ? `${metrics.rttMs.toFixed(0)}ms RTT, ${(metrics.packetLoss * 100).toFixed(1)}% loss`
    : 'Measuring...'

  return (
    <div className="flex items-end gap-[2px]" title={tooltip} style={{ height: 14 }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: 3 + i * 2.5,
            borderRadius: 1,
            backgroundColor: i <= bars ? color : 'rgba(255,255,255,0.15)',
            transition: 'background-color 300ms ease',
          }}
        />
      ))}
    </div>
  )
}

/** Microphone icon */
function MicIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 19L5 5m0 0l14 14M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z" />
        <line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" strokeWidth={2} strokeLinecap="round" />
      <line x1="8" y1="23" x2="16" y2="23" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

/** Headphones icon */
function HeadphonesIcon({ deafened }: { deafened: boolean }) {
  if (deafened) {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 18v-6a9 9 0 0118 0v6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
        <line x1="3" y1="3" x2="21" y2="21" strokeWidth={2} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 18v-6a9 9 0 0118 0v6" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
    </svg>
  )
}

/** Disconnect icon (phone/X) */
function DisconnectIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
    </svg>
  )
}

export default function VoiceBar() {
  const voiceChannelId = useStore((s) => s.voiceChannelId)
  const localMuted = useStore((s) => s.localMuted)
  const localDeafened = useStore((s) => s.localDeafened)
  const connectionQuality = useStore((s) => s.connectionQuality)
  const qualityMetrics = useStore((s) => s.qualityMetrics)
  const toggleMute = useStore((s) => s.toggleMute)
  const toggleDeafen = useStore((s) => s.toggleDeafen)
  const leaveVoiceChannel = useStore((s) => s.leaveVoiceChannel)

  // Look up channel name from channels store
  const categoriesWithChannels = useStore((s) => s.categoriesWithChannels)
  const channelName = (() => {
    if (!voiceChannelId) return 'Voice'
    for (const cwc of categoriesWithChannels) {
      for (const ch of cwc.channels) {
        if (ch.id === voiceChannelId) return ch.name
      }
    }
    return 'Voice'
  })()

  if (!voiceChannelId) return null

  return (
    <div className="flex items-center gap-1 border-t border-white/5 px-3 py-2">
      {/* Channel name + quality */}
      <div className="mr-auto flex items-center gap-2 overflow-hidden">
        <QualityIcon quality={connectionQuality} metrics={qualityMetrics} />
        <span className="truncate text-xs font-medium text-[var(--color-text-primary)]">
          {channelName}
        </span>
      </div>

      {/* Mute button */}
      <button
        onClick={toggleMute}
        className={`rounded p-1 transition-colors ${
          localMuted
            ? 'text-[#f04747] hover:bg-[#f04747]/10'
            : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]'
        }`}
        title={localMuted ? 'Unmute' : 'Mute'}
      >
        <MicIcon muted={localMuted} />
      </button>

      {/* Deafen button */}
      <button
        onClick={toggleDeafen}
        className={`rounded p-1 transition-colors ${
          localDeafened
            ? 'text-[#f04747] hover:bg-[#f04747]/10'
            : 'text-[var(--color-text-muted)] hover:bg-white/5 hover:text-[var(--color-text-primary)]'
        }`}
        title={localDeafened ? 'Undeafen' : 'Deafen'}
      >
        <HeadphonesIcon deafened={localDeafened} />
      </button>

      {/* Disconnect button */}
      <button
        onClick={leaveVoiceChannel}
        className="rounded p-1 text-[#f04747] transition-colors hover:bg-[#f04747]/10"
        title="Disconnect"
      >
        <DisconnectIcon />
      </button>
    </div>
  )
}
