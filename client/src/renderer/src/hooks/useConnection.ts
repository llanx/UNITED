import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores'
import type { ConnectionStatus } from '@shared/ws-protocol'

/**
 * Manages WebSocket lifecycle and connection status.
 * Maps WS close codes to severity-based UX:
 *   4001 -> silent refresh attempt (handled in main process)
 *   4002 -> redirect to login with explanation
 *   4003 -> full-screen ban message (prevent auto-reconnect)
 *   4004 -> kick notice with rejoin option (no auto-reconnect)
 */
export function useConnection() {
  const status = useStore((s) => s.status)
  const navigate = useNavigate()

  // Subscribe to connection status push events
  useEffect(() => {
    const cleanupStatus = window.united.onConnectionStatus((newStatus: ConnectionStatus) => {
      useStore.setState({ status: newStatus })
    })

    const cleanupAuthError = window.united.onAuthError((code: number, message: string) => {
      switch (code) {
        case 4001:
          // Token expired -- main process handles silent refresh
          // No UI action needed unless refresh fails (which triggers 4002)
          break
        case 4002:
          // Token invalid -- redirect to login
          useStore.setState({
            isUnlocked: false,
            status: 'disconnected'
          })
          navigate('/welcome')
          break
        case 4003: {
          // Banned -- show full-screen ban notice
          // Extract reason from message (format: "Banned: <reason>" or just "Banned")
          const reason = message.startsWith('Banned:')
            ? message.slice('Banned:'.length).trim()
            : message !== 'Banned' ? message : undefined

          useStore.setState({
            status: 'disconnected',
            activePanel: 'chat'
          })
          useStore.getState().setModerationNotice({
            type: 'ban',
            reason
          })
          break
        }
        case 4004: {
          // Kicked -- show kick notice (warning severity, not full-screen)
          const kickReason = message.startsWith('Kicked:')
            ? message.slice('Kicked:'.length).trim()
            : message !== 'Kicked' ? message : undefined

          useStore.setState({
            status: 'disconnected',
            activePanel: 'chat'
          })
          useStore.getState().setModerationNotice({
            type: 'kick',
            reason: kickReason
          })
          break
        }
        default:
          console.warn(`Unhandled auth error code ${code}: ${message}`)
      }
    })

    const cleanupServerInfo = window.united.onServerInfoUpdate((info) => {
      useStore.setState({
        name: info.name,
        description: info.description,
        registrationMode: info.registrationMode,
      })
    })

    return () => {
      cleanupStatus()
      cleanupAuthError()
      cleanupServerInfo()
    }
  }, [navigate])

  const reconnect = useCallback(async () => {
    // Do not auto-reconnect if there is an active moderation notice
    const notice = useStore.getState().moderationNotice
    if (notice) {
      if (notice.type === 'ban') {
        // Never auto-reconnect for bans
        return
      }
      // For kicks, clear notice before reconnecting (user chose to reconnect)
      useStore.getState().clearModerationNotice()
    }

    const serverUrl = useStore.getState().serverUrl
    if (serverUrl) {
      try {
        await window.united.connectToServer(serverUrl)
      } catch (err) {
        console.error('Reconnect failed:', err)
      }
    }
  }, [])

  return { status, reconnect }
}
