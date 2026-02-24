import type { StateCreator } from 'zustand'
import type { CachedChannel } from '@shared/ipc-bridge'
import type { RootStore } from './index'

export interface ChannelsSlice {
  channels: CachedChannel[]
  activeChannelId: string | null
}

export const createChannelsSlice: StateCreator<RootStore, [], [], ChannelsSlice> = () => ({
  channels: [],
  activeChannelId: null,
})
