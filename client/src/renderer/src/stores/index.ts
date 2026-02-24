import { create } from 'zustand'
import { createAuthSlice, type AuthSlice } from './auth'
import { createConnectionSlice, type ConnectionSlice } from './connection'
import { createServerSlice, type ServerSlice } from './server'
import { createChannelsSlice, type ChannelsSlice } from './channels'
import { createSettingsSlice, type SettingsSlice } from './settings'
import { createUiSlice, type UiSlice } from './ui'

export type RootStore =
  AuthSlice &
  ConnectionSlice &
  ServerSlice &
  ChannelsSlice &
  SettingsSlice &
  UiSlice

export const useStore = create<RootStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createConnectionSlice(...a),
  ...createServerSlice(...a),
  ...createChannelsSlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
}))

/**
 * Hydrate stores from SQLite cache via preload bridge.
 * Called fire-and-forget before render — stores update reactively,
 * components re-render via Zustand subscriptions.
 */
export async function hydrate(): Promise<void> {
  const { storage } = window.united

  const [hasIdentity, activeServer] = await Promise.all([
    storage.hasIdentity(),
    storage.getActiveServer(),
  ])

  useStore.setState({ hasIdentity })

  if (activeServer) {
    useStore.setState({
      serverId: activeServer.id,
      serverUrl: activeServer.url,
      name: activeServer.name,
      description: activeServer.description,
      registrationMode: activeServer.registrationMode,
      displayName: activeServer.displayName,
    })

    const channels = await storage.getChannels(activeServer.id)
    const activeChannelId = await storage.getCachedState<string>('active_channel_id')
    useStore.setState({ channels, activeChannelId })
  }
}
