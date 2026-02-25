import type { StateCreator } from 'zustand'
import type {
  ChannelResponse,
  CategoryResponse,
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

  // CRUD actions
  createChannel: (name: string, channelType: string, categoryId: string) => Promise<ChannelResponse>
  renameChannel: (id: string, name: string) => Promise<ChannelResponse>
  deleteChannel: (id: string) => Promise<void>
  reorderChannels: (positions: Array<{ id: string; position: number }>) => Promise<void>
  createCategory: (name: string) => Promise<CategoryResponse>
  renameCategory: (id: string, name: string) => Promise<CategoryResponse>
  deleteCategory: (id: string) => Promise<void>
  reorderCategories: (positions: Array<{ id: string; position: number }>) => Promise<void>
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

  // CRUD actions — call IPC, then re-fetch to get consistent state
  createChannel: async (name, channelType, categoryId) => {
    const channel = await window.united.channels.create(name, channelType, categoryId)
    await get().fetchChannels()
    return channel
  },

  renameChannel: async (id, name) => {
    const channel = await window.united.channels.update(id, name)
    await get().fetchChannels()
    return channel
  },

  deleteChannel: async (id) => {
    await window.united.channels.delete(id)
    if (get().activeChannelId === id) {
      set({ activeChannelId: null })
    }
    await get().fetchChannels()
  },

  reorderChannels: async (positions) => {
    await window.united.channels.reorder(positions)
    await get().fetchChannels()
  },

  createCategory: async (name) => {
    const category = await window.united.categories.create(name)
    await get().fetchChannels()
    return category
  },

  renameCategory: async (id, name) => {
    const category = await window.united.categories.update(id, name)
    await get().fetchChannels()
    return category
  },

  deleteCategory: async (id) => {
    await window.united.categories.delete(id)
    await get().fetchChannels()
  },

  reorderCategories: async (positions) => {
    await window.united.categories.reorder(positions)
    await get().fetchChannels()
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
