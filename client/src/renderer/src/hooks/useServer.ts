import { useCallback, useState } from 'react'
import { useStore } from '../stores'
import type { ServerInfo, ServerSettings } from '@shared/ipc-bridge'

/**
 * Fetches and caches server info. Manages admin state detection.
 */
export function useServer() {
  const isOwner = useStore((s) => s.isOwner)
  const serverName = useStore((s) => s.name)
  const serverDescription = useStore((s) => s.description)
  const registrationMode = useStore((s) => s.registrationMode)

  const [refreshing, setRefreshing] = useState(false)

  /**
   * Fetch fresh server info from the server.
   */
  const refreshServerInfo = useCallback(async (): Promise<ServerInfo | null> => {
    setRefreshing(true)
    try {
      const info = await window.united.getServerInfo()
      useStore.setState({
        name: info.name,
        description: info.description,
        registrationMode: info.registrationMode,
      })
      return info
    } catch (err) {
      console.error('Failed to refresh server info:', err)
      return null
    } finally {
      setRefreshing(false)
    }
  }, [])

  /**
   * Update server settings (admin only).
   */
  const updateSettings = useCallback(async (settings: ServerSettings): Promise<boolean> => {
    try {
      const updated = await window.united.updateServerSettings(settings)
      useStore.setState({
        name: updated.name,
        description: updated.description,
        registrationMode: updated.registrationMode,
      })
      return true
    } catch (err) {
      console.error('Failed to update server settings:', err)
      return false
    }
  }, [])

  return {
    isAdmin: isOwner,
    serverName,
    serverDescription,
    registrationMode,
    refreshing,
    refreshServerInfo,
    updateSettings
  }
}
