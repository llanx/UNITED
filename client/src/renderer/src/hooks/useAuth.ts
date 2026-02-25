import { useCallback, useState } from 'react'
import { useStore } from '../stores'

/**
 * Orchestrates identity unlock -> server connection -> challenge-response auth -> store updates.
 * Handles error states per severity-based UX from user decisions.
 */
export function useAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setUnlocked = useStore((s) => s.setUnlocked)
  const setOwner = useStore((s) => s.setOwner)

  /**
   * Full login flow for returning users:
   * 1. Unlock identity with passphrase
   * 2. Connect to last server
   * 3. Challenge-response authentication
   * 4. Update stores
   */
  const loginWithPassphrase = useCallback(async (passphrase: string): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      // Step 1: Unlock identity locally
      const unlockResult = await window.united.unlockIdentity(passphrase)
      setUnlocked(unlockResult.fingerprint, unlockResult.publicKey)

      // Step 2: Check for active server
      const activeServer = await window.united.storage.getActiveServer()
      if (!activeServer) {
        // No server cached — user needs to join one
        return true
      }

      // Step 3: Connect to server
      try {
        await window.united.connectToServer(activeServer.url)

        useStore.setState({
          serverId: activeServer.id,
          serverUrl: activeServer.url,
          name: activeServer.name,
          description: activeServer.description,
          registrationMode: activeServer.registrationMode,
          displayName: activeServer.displayName,
        })
      } catch (connErr) {
        // Connection failed — still unlocked, user can retry or join different server
        console.warn('Auto-connect failed:', connErr)
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      setError(message)
      return false
    } finally {
      setLoading(false)
    }
  }, [setUnlocked, setOwner])

  /**
   * Register on the current server.
   */
  const register = useCallback(async (
    displayName: string,
    setupToken?: string
  ): Promise<boolean> => {
    setLoading(true)
    setError(null)

    try {
      const result = await window.united.register(displayName, setupToken)
      setOwner(result.isOwner)
      useStore.setState({ displayName })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      setError(message)
      return false
    } finally {
      setLoading(false)
    }
  }, [setOwner])

  const clearError = useCallback(() => setError(null), [])

  return {
    loading,
    error,
    loginWithPassphrase,
    register,
    clearError
  }
}
