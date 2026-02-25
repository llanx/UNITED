import ServerRail from '../components/ServerRail'
import ChannelSidebar from '../components/ChannelSidebar'
import MainContent from '../components/MainContent'
import { useConnection } from '../hooks/useConnection'

export default function Main() {
  // Initialize connection status listener and auth error handling
  useConnection()

  return (
    <div className="flex h-screen w-screen">
      <ServerRail />
      <ChannelSidebar />
      <MainContent />
    </div>
  )
}
