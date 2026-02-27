/**
 * Thin status banner shown above message input when WebSocket is disconnected.
 *
 * Appears after a 500ms delay to avoid flicker on fast reconnections.
 * Disappears immediately when connection is re-established.
 */

import { useState, useEffect, useRef } from 'react'
import { useStore } from '../stores'

export default function ConnectionBanner() {
  const status = useStore((s) => s.status)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (status !== 'connected') {
      // 500ms delay threshold to avoid flicker on fast connections (CONTEXT.md decision)
      timerRef.current = setTimeout(() => setVisible(true), 500)
    } else {
      // Connected — hide immediately
      if (timerRef.current) clearTimeout(timerRef.current)
      setVisible(false)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [status])

  if (!visible) return null

  return (
    <div className="flex items-center justify-center bg-yellow-600/90 px-3 py-1 text-xs font-medium text-white">
      {status === 'reconnecting' ? 'Reconnecting...' : 'Connecting...'}
    </div>
  )
}
