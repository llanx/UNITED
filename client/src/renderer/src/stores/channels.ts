import type { StateCreator } from 'zustand'
import type {
  CategoryWithChannelsResponse,
  ChannelEvent
} from '@shared/ipc-bridge'
import type { RootStore } from './index'

export interface ChannelsSlice {
  categoriesWithChannels: CategoryWithChannelsResponse[]
  activeChannelId: string | null
  channelsLoading: boolean
  fetchChannels: () => Promise<void>
  setActiveChannel: (id: string) => void
  handleChannelEvent: (event: ChannelEvent) => void
}

export const createChannelsSlice: StateCreator<RootStore, [], [], ChannelsSlice> = (set, get) => ({
  categoriesWithChannels: [],
  activeChannelId: null,
  channelsLoading: false,

  fetchChannels: async () => {
    set({ channelsLoading: true })
    try {
      const result = await window.united.channels.fetch()
      set({
        categoriesWithChannels: result.categories,
        channelsLoading: false
      })
    } catch (err) {
      console.error('Failed to fetch channels:', err)
      set({ channelsLoading: false })
    }
  },

  setActiveChannel: (id: string) => {
    set({ activeChannelId: id })
    // Persist to cache
    window.united.storage.setCachedState('active_channel_id', id).catch(() => {})
  },

  handleChannelEvent: (event: ChannelEvent) => {
    const current = get().categoriesWithChannels

    switch (event.type) {
      case 'created': {
        if (event.channel) {
          const updated = current.map((cwc) => {
            if (cwc.category.id === event.channel!.category_id) {
              return {
                ...cwc,
                channels: [...cwc.channels, event.channel!]
              }
            }
            return cwc
          })
          set({ categoriesWithChannels: updated })
        } else if (event.category) {
          set({
            categoriesWithChannels: [
              ...current,
              { category: event.category, channels: [] }
            ]
          })
        }
        break
      }

      case 'updated': {
        if (event.channel) {
          const updated = current.map((cwc) => ({
            ...cwc,
            channels: cwc.channels.map((ch) =>
              ch.id === event.channel!.id ? event.channel! : ch
            )
          }))
          set({ categoriesWithChannels: updated })
        }
        break
      }

      case 'deleted': {
        if (event.id) {
          // Could be a channel or category deletion
          const filteredCategories = current
            .filter((cwc) => cwc.category.id !== event.id)
            .map((cwc) => ({
              ...cwc,
              channels: cwc.channels.filter((ch) => ch.id !== event.id)
            }))
          set({ categoriesWithChannels: filteredCategories })

          // Clear active channel if it was deleted
          if (get().activeChannelId === event.id) {
            set({ activeChannelId: null })
          }
        }
        break
      }

      case 'reordered': {
        // Re-fetch to get updated positions
        get().fetchChannels()
        break
      }
    }
  }
})
