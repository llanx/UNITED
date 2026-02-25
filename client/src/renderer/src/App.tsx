import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useStore } from './stores'
import Welcome from './pages/Welcome'
import Main from './pages/Main'
import CreateIdentity from './pages/CreateIdentity'
import RecoverIdentity from './pages/RecoverIdentity'
import JoinServer from './pages/JoinServer'
import DeviceProvisioning from './pages/DeviceProvisioning'

/**
 * Inner component that has access to router context for deep link navigation.
 */
function AppRoutes() {
  const hasIdentity = useStore((s) => s.hasIdentity)
  const isUnlocked = useStore((s) => s.isUnlocked)
  const navigate = useNavigate()

  // Listen for deep link invite events from main process
  useEffect(() => {
    const cleanup = window.united.onDeepLinkInvite((inviteCode, serverUrl) => {
      const params = new URLSearchParams()
      params.set('code', inviteCode)
      if (serverUrl) params.set('server', serverUrl)
      navigate(`/join-server?${params.toString()}`)
    })
    return cleanup
  }, [navigate])

  // Still checking SQLite -- show nothing (< 1 frame)
  if (hasIdentity === null) return null

  const showMain = hasIdentity && isUnlocked

  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/create-identity" element={<CreateIdentity />} />
      <Route path="/recover-identity" element={<RecoverIdentity />} />
      <Route path="/join-server" element={<JoinServer />} />
      <Route path="/device-provisioning" element={<DeviceProvisioning />} />
      <Route path="/app" element={<Main />} />
      <Route path="*" element={<Navigate to={showMain ? '/app' : '/welcome'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
