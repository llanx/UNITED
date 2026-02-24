import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores'
import type { ConnectionStatus } from '@shared/ws-protocol'

/**
 * Manages WebSocket lifecycle and connection status.
 * Maps WS close codes to severity-based UX:
 *   4001 -> silent refresh attempt (handled in main process)
 *   4002 -> redirect to login with explanation
 *   4003 -> full-screen ban message
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
          // Token expired — main process handles silent refresh
          // No UI action needed unless refresh fails (which triggers 4002)
          break
        case 4002:
          // Token invalid — redirect to login
          useStore.setState({
            isUnlocked: false,
            status: 'disconnected'
          })
          navigate('/welcome')
          break
        case 4003:
          // Banned — show ban screen
          useStore.setState({
            status: 'disconnected',
            activePanel: 'chat' // reset panel
          })
          // Navigate could go to a dedicated ban page; for now, welcome with error
          navigate('/welcome')
          break
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
