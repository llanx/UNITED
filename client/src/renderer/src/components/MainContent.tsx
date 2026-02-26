import { useStore } from '../stores'
import ServerIcon from './ServerIcon'
import ServerSettings from './ServerSettings'
import TotpEnrollment from './TotpEnrollment'
import ChannelManagement from './ChannelManagement'
import RoleManagement from './RoleManagement'
import MemberList from './MemberList'
import MemberListSidebar from './MemberListSidebar'
import DevPanel from './DevPanel'
import ChatView from './ChatView'
import DmChatView from './DmChatView'
import NetworkStatsPanel from './NetworkStats'
import StatusBarIndicator from './StatusBarIndicator'
import { useNetworkStats } from '../hooks/useNetworkStats'
import { useState, useEffect } from 'react'

export default function MainContent() {
  const name = useStore((s) => s.name)
  const description = useStore((s) => s.description)
  const activePanel = useStore((s) => s.activePanel)
  const activeChannelId = useStore((s) => s.activeChannelId)
  const isOwner = useStore((s) => s.isOwner)
  const devPanelOpen = useStore((s) => s.devPanelOpen)
  const toggleDevPanel = useStore((s) => s.toggleDevPanel)

  // Subscribe to network stats push events
  useNetworkStats()

  // DM state
  const dmView = useStore((s) => s.dmView)
  const activeDmConversationId = useStore((s) => s.activeDmConversationId)

  // Member list sidebar visibility (default: visible when channel selected)
  const [memberListVisible, setMemberListVisible] = useState(true)

  // Ctrl+Shift+D to toggle dev panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        toggleDevPanel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggleDevPanel])

  // Show TOTP enrollment once after first registration (dismissible)
  const [showTotp, setShowTotp] = useState(false)
  const [totpDismissed, setTotpDismissed] = useState(false)

  useEffect(() => {
    // Check if we should show TOTP enrollment
    // Show once when user first registers (isOwner is set after registration)
    const checkTotp = async () => {
      const dismissed = await window.united.storage.getCachedState<boolean>('totp_dismissed')
      if (!dismissed) {
        setShowTotp(true)
      }
    }
    checkTotp()
  }, [])

  const handleTotpDismiss = async () => {
    setShowTotp(false)
    setTotpDismissed(true)
    await window.united.storage.setCachedState('totp_dismissed', true)
  }

  const handleTotpComplete = async () => {
    setShowTotp(false)
    setTotpDismissed(true)
    await window.united.storage.setCachedState('totp_dismissed', true)
  }

  // Determine which panel content to render
  const renderPanel = () => {
    // DM View: full-width DM chat or empty state
    if (dmView) {
      if (activeDmConversationId) {
        return <DmChatView />
      }

      // No conversation selected: DM welcome state
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[var(--color-bg-primary)] p-8">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--color-text-muted)]"
          >
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Direct Messages
          </h2>
          <p className="max-w-sm text-center text-sm text-[var(--color-text-muted)]">
            Select a conversation or click a user&apos;s name to start a new DM.
          </p>
        </div>
      )
    }

    // Server Settings panel (admin only)
    if (activePanel === 'settings' && isOwner) {
      return <ServerSettings />
    }

    // Channel Management panel (admin only)
    if (activePanel === 'channel-management' && isOwner) {
      return <ChannelManagement />
    }

    // Role Management panel (admin only)
    if (activePanel === 'role-management' && isOwner) {
      return <RoleManagement />
    }

    // Network Stats panel
    if (activePanel === 'network-stats') {
      return <NetworkStatsPanel />
    }

    // Members panel (full-screen view from sidebar nav)
    if (activePanel === 'members') {
      return (
        <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
          <div className="flex h-12 items-center justify-between border-b border-white/5 px-4">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
              Members
            </span>
            <button
              onClick={() => useStore.setState({ activePanel: 'chat' })}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-lg">
              <MemberList />
            </div>
          </div>
        </div>
      )
    }

    // Default: Chat view (if channel selected) with member sidebar, or Welcome screen
    if (activeChannelId) {
      return (
        <div className="flex flex-1">
          <ChatView
            memberListVisible={memberListVisible}
            onToggleMemberList={() => setMemberListVisible((v) => !v)}
          />
          {memberListVisible && <MemberListSidebar />}
        </div>
      )
    }

    // No channel selected: Welcome screen
    return (
      <div className="flex flex-1 flex-col bg-[var(--color-bg-primary)]">
        {/* Channel header bar */}
        <div className="flex h-12 items-center border-b border-white/5 px-4">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Welcome
          </span>
        </div>

        {/* Content area -- welcome message + TOTP enrollment */}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          {name && <ServerIcon name={name} size={80} />}
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {name ? `Welcome to ${name}` : 'Welcome to UNITED'}
          </h1>
          {description && (
            <p className="max-w-md text-center text-sm text-[var(--color-text-muted)]">
              {description}
            </p>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">
            This is the beginning of your server.
          </p>

          {/* TOTP enrollment (shown once, dismissible) */}
          {showTotp && !totpDismissed && (
            <div className="mt-6 w-full max-w-sm">
              <TotpEnrollment
                onDismiss={handleTotpDismiss}
                onComplete={handleTotpComplete}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {renderPanel()}
      </div>
      <StatusBarIndicator />
      {devPanelOpen && <DevPanel />}
    </div>
  )
}
