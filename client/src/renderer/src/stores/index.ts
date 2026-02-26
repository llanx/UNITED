import { create } from 'zustand'
import { createAuthSlice, type AuthSlice } from './auth'
import { createConnectionSlice, type ConnectionSlice } from './connection'
import { createServerSlice, type ServerSlice } from './server'
import { createChannelsSlice, type ChannelsSlice } from './channels'
import { createSettingsSlice, type SettingsSlice } from './settings'
import { createUiSlice, type UiSlice } from './ui'
import { createRolesSlice, type RolesSlice } from './roles'
import { createP2PSlice, type P2PSlice } from './p2p'
import { createMessagesSlice, type MessagesSlice } from './messages'
import { createPresenceSlice, type PresenceSlice } from './presence'
import { createNotificationsSlice, type NotificationsSlice } from './notifications'
import { createDmSlice, type DmSlice } from './dm'
import { createBlocksSlice, type BlocksSlice } from './blocks'
import { createNetworkSlice, type NetworkSlice } from './network'

export type RootStore =
  AuthSlice &
  ConnectionSlice &
  ServerSlice &
  ChannelsSlice &
  SettingsSlice &
  UiSlice &
  RolesSlice &
  P2PSlice &
  MessagesSlice &
  PresenceSlice &
  NotificationsSlice &
  DmSlice &
  BlocksSlice &
  NetworkSlice

export const useStore = create<RootStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createConnectionSlice(...a),
  ...createServerSlice(...a),
  ...createChannelsSlice(...a),
  ...createSettingsSlice(...a),
  ...createUiSlice(...a),
  ...createRolesSlice(...a),
  ...createP2PSlice(...a),
  ...createMessagesSlice(...a),
  ...createPresenceSlice(...a),
  ...createNotificationsSlice(...a),
  ...createDmSlice(...a),
  ...createBlocksSlice(...a),
  ...createNetworkSlice(...a),
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

    const [activeChannelId, welcomeDismissed, dmBannerDismissed] = await Promise.all([
      storage.getCachedState<string>('active_channel_id'),
      storage.getCachedState<Record<string, boolean>>('welcome_dismissed'),
      storage.getCachedState<boolean>('dm_banner_dismissed'),
    ])

    if (activeChannelId) {
      useStore.setState({ activeChannelId })
    }

    if (welcomeDismissed) {
      useStore.setState({ welcomeDismissed })
    }

    if (dmBannerDismissed) {
      useStore.setState({ dmEncryptionBannerDismissed: true })
    }
  }

  // Hydrate block store settings
  try {
    const config = await window.united.blocks.getConfig()
    const budgetGb = Math.round(config.budgetBytes / (1024 * 1024 * 1024))
    useStore.setState({
      storageBudgetGb: budgetGb || 5,
      warmTtlDays: config.warmTtlDays || 7,
    })
  } catch {
    // Block store may not be initialized yet -- use defaults
  }
}
