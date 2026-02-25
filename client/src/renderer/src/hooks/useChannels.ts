import { useEffect } from 'react'
import { useStore } from '../stores'

export function useChannels() {
  const categoriesWithChannels = useStore((s) => s.categoriesWithChannels)
  const activeChannelId = useStore((s) => s.activeChannelId)
  const loading = useStore((s) => s.channelsLoading)
  const fetchChannels = useStore((s) => s.fetchChannels)
  const setActiveChannel = useStore((s) => s.setActiveChannel)

  useEffect(() => {
    fetchChannels()
    const cleanup = window.united.onChannelEvent((event) => {
      useStore.getState().handleChannelEvent(event)
    })
    return cleanup
  }, [fetchChannels])

  return { categoriesWithChannels, activeChannelId, loading, setActiveChannel }
}
