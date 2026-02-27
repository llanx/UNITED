import { useEffect } from 'react'
import ServerRail from '../components/ServerRail'
import ChannelSidebar from '../components/ChannelSidebar'
import DmConversationList from '../components/DmConversationList'
import MainContent from '../components/MainContent'
import WelcomeOverlay from '../components/WelcomeOverlay'
import ModerationNotice from '../components/ModerationNotice'
import { useConnection } from '../hooks/useConnection'
import { usePresence } from '../hooks/usePresence'
import { useStore } from '../stores'

export default function Main() {
  // Initialize connection status listener and auth error handling
  useConnection()

  // Subscribe to presence + typing events from main process
  usePresence()

  // Connect WebSocket on mount — both returning-user and new-user flows
  // have a valid JWT by the time /app mounts (Plan 01 ensures this)
  useEffect(() => {
    window.united.connectWs().catch((err) => {
      console.error('[WS] Connection failed:', err)
    })
  }, [])

  const moderationNotice = useStore((s) => s.moderationNotice)
  const serverName = useStore((s) => s.name)
  const dmView = useStore((s) => s.dmView)

  return (
    <div className="flex h-screen w-screen">
      <ServerRail />
      {dmView ? <DmConversationList /> : <ChannelSidebar />}
      <MainContent />

      {/* Welcome overlay shown on first visit when admin has enabled it */}
      <WelcomeOverlay />

      {/* Moderation notice overlays (kick/ban) */}
      {moderationNotice && (
        <ModerationNotice
          type={moderationNotice.type}
          reason={moderationNotice.reason}
          serverName={serverName || undefined}
        />
      )}
    </div>
  )
}
