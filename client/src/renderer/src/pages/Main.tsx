import ServerRail from '../components/ServerRail'
import ChannelSidebar from '../components/ChannelSidebar'
import MainContent from '../components/MainContent'

export default function Main() {
  return (
    <div className="flex h-screen w-screen">
      <ServerRail />
      <ChannelSidebar />
      <MainContent />
    </div>
  )
}
