import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './stores'
import Welcome from './pages/Welcome'
import Main from './pages/Main'

export default function App() {
  const hasIdentity = useStore((s) => s.hasIdentity)
  const isUnlocked = useStore((s) => s.isUnlocked)

  // Still checking SQLite — show nothing (< 1 frame)
  if (hasIdentity === null) return null

  const showMain = hasIdentity && isUnlocked

  return (
    <HashRouter>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/app" element={<Main />} />
        <Route path="*" element={<Navigate to={showMain ? '/app' : '/welcome'} replace />} />
      </Routes>
    </HashRouter>
  )
}
