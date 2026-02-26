/**
 * P2P Debug Panel — floating overlay for P2P mesh observability.
 *
 * Activated by Ctrl+Shift+D. Shows connected peers, gossipsub topics,
 * and 3 test actions: send test message, ping peer, force reconnect.
 * Auto-refreshes at ~2 seconds via push events from the main process.
 *
 * This is the primary verification tool for Phase 3 P2P networking.
 * The IPC data pipeline is permanent infrastructure; the UI evolves
 * into a user-facing feature in v2.
 */

import { useState, useRef, useCallback, type MouseEvent } from 'react'
import { useP2P } from '../hooks/useP2P'
import { useStore } from '../stores'

// ============================================================
// Styles (inline — dev tool, not polished UI)
// ============================================================

const PANEL_WIDTH = 520
const PANEL_HEIGHT = 440

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9999,
  width: PANEL_WIDTH,
  height: PANEL_HEIGHT,
  backgroundColor: 'rgba(24, 25, 28, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 8,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 12,
  color: '#dcddde',
  overflow: 'hidden',
  userSelect: 'none',
}

const titleBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  backgroundColor: 'rgba(32, 34, 37, 0.9)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  cursor: 'grab',
  flexShrink: 0,
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#8e9297',
  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 11,
}

const cellStyle: React.CSSProperties = {
  padding: '3px 12px',
  fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
  fontSize: 11,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const badgeStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  backgroundColor: color,
  color: '#fff',
})

const btnStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 11,
  fontWeight: 500,
  backgroundColor: 'rgba(88, 101, 242, 0.8)',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 4,
  color: '#dcddde',
  fontFamily: 'inherit',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

// ============================================================
// Helper functions
// ============================================================

function truncateId(id: string, chars = 8): string {
  if (id.length <= chars) return id
  return id.slice(0, chars) + '...'
}

function relativeTime(timestamp?: number): string {
  if (!timestamp) return 'never'
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

// ============================================================
// Component
// ============================================================

export default function DevPanel() {
  const {
    peers,
    topics,
    natType,
    isConnected,
    serverPeerId,
    sendTestMessage,
    pingPeer,
    forceReconnect,
  } = useP2P()
  const toggleDevPanel = useStore((s) => s.toggleDevPanel)

  // Drag state
  const [position, setPosition] = useState({
    x: window.innerWidth - PANEL_WIDTH - 20,
    y: window.innerHeight - PANEL_HEIGHT - 20,
  })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Test action states
  const [selectedTopic, setSelectedTopic] = useState('')
  const [testText, setTestText] = useState('Hello P2P!')
  const [selectedPeer, setSelectedPeer] = useState('')
  const [actionStatus, setActionStatus] = useState('')
  const [pingResult, setPingResult] = useState<string | null>(null)
  const [isReconnecting, setIsReconnecting] = useState(false)

  // Drag handlers
  const onTitleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: position.x,
      origY: position.y,
    }

    const onMouseMove = (ev: globalThis.MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - PANEL_WIDTH, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - PANEL_HEIGHT, dragRef.current.origY + dy)),
      })
    }

    const onMouseUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [position])

  // Action handlers
  const handleSendTest = useCallback(async () => {
    if (!selectedTopic) {
      setActionStatus('Select a topic first')
      return
    }
    try {
      await sendTestMessage(selectedTopic, testText)
      setActionStatus('Message sent')
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
    setTimeout(() => setActionStatus(''), 3000)
  }, [selectedTopic, testText, sendTestMessage])

  const handlePing = useCallback(async () => {
    if (!selectedPeer) {
      setPingResult('Select a peer first')
      return
    }
    try {
      const result = await pingPeer(selectedPeer)
      setPingResult(`${result.rttMs}ms`)
    } catch (err) {
      setPingResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
    setTimeout(() => setPingResult(null), 5000)
  }, [selectedPeer, pingPeer])

  const handleReconnect = useCallback(async () => {
    setIsReconnecting(true)
    try {
      await forceReconnect()
    } catch (err) {
      setActionStatus(`Reconnect error: ${err instanceof Error ? err.message : String(err)}`)
    }
    setTimeout(() => setIsReconnecting(false), 2000)
  }, [forceReconnect])

  // Set defaults for dropdowns when data arrives
  if (!selectedTopic && topics.length > 0) {
    setSelectedTopic(topics[0].topic)
  }
  if (!selectedPeer && peers.length > 0) {
    setSelectedPeer(peers[0].peerId)
  }

  return (
    <div
      style={{
        ...panelStyle,
        left: position.x,
        top: position.y,
      }}
    >
      {/* Title bar (draggable) */}
      <div style={titleBarStyle} onMouseDown={onTitleMouseDown}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: isConnected ? '#43b581' : '#f04747',
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 12 }}>P2P Debug Panel</span>
          <span style={{ color: '#72767d', fontSize: 10 }}>
            {peers.length} peer{peers.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={toggleDevPanel}
          style={{
            background: 'none',
            border: 'none',
            color: '#8e9297',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 4px',
          }}
          title="Close (Ctrl+Shift+D)"
        >
          x
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* Section 1: Peers */}
        <div style={sectionHeaderStyle}>
          Peers ({peers.length})
        </div>
        {peers.length === 0 ? (
          <div style={{ padding: '8px 12px', color: '#72767d', fontStyle: 'italic' }}>
            No peers connected
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ color: '#72767d', fontSize: 10 }}>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>PeerId</th>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>Type</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>Latency</th>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>NAT</th>
              </tr>
            </thead>
            <tbody>
              {peers.map((peer) => (
                <tr
                  key={peer.peerId}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                >
                  <td style={cellStyle} title={peer.peerId}>
                    {truncateId(peer.peerId)}
                    {peer.peerId === serverPeerId && (
                      <span style={{ ...badgeStyle('#5865f2'), marginLeft: 4, fontSize: 9 }}>
                        server
                      </span>
                    )}
                  </td>
                  <td style={cellStyle}>
                    <span
                      style={badgeStyle(
                        peer.connectionType === 'direct' ? '#43b581' : '#faa61a'
                      )}
                    >
                      {peer.connectionType || 'unknown'}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    {peer.latencyMs != null ? `${peer.latencyMs}ms` : '\u2014'}
                  </td>
                  <td style={cellStyle}>{peer.natType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Section 2: Gossipsub Topics */}
        <div style={sectionHeaderStyle}>
          Gossipsub Topics ({topics.length})
        </div>
        {topics.length === 0 ? (
          <div style={{ padding: '8px 12px', color: '#72767d', fontStyle: 'italic' }}>
            No subscriptions
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ color: '#72767d', fontSize: 10 }}>
                <th style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>Topic</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>Messages</th>
                <th style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>Last Received</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr
                  key={topic.topic}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                >
                  <td style={cellStyle} title={topic.topic}>
                    {truncateId(topic.topic, 24)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    {topic.messageCount}
                  </td>
                  <td style={{ ...cellStyle, textAlign: 'right' }}>
                    {relativeTime(topic.lastReceived)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Section 3: Test Actions */}
        <div style={sectionHeaderStyle}>Test Actions</div>
        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Send Test Message */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              style={{ ...selectStyle, flex: '0 0 180px' }}
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
            >
              {topics.length === 0 && <option value="">No topics</option>}
              {topics.map((t) => (
                <option key={t.topic} value={t.topic}>
                  {truncateId(t.topic, 24)}
                </option>
              ))}
            </select>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Test message"
            />
            <button style={btnStyle} onClick={handleSendTest}>
              Send
            </button>
          </div>

          {/* Ping Peer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              style={{ ...selectStyle, flex: '0 0 180px' }}
              value={selectedPeer}
              onChange={(e) => setSelectedPeer(e.target.value)}
            >
              {peers.length === 0 && <option value="">No peers</option>}
              {peers.map((p) => (
                <option key={p.peerId} value={p.peerId}>
                  {truncateId(p.peerId)}
                  {p.peerId === serverPeerId ? ' (server)' : ''}
                </option>
              ))}
            </select>
            <button style={btnStyle} onClick={handlePing}>
              Ping
            </button>
            {pingResult && (
              <span style={{ fontFamily: 'monospace', color: '#43b581' }}>
                {pingResult}
              </span>
            )}
          </div>

          {/* Force Reconnect */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              style={{
                ...btnStyle,
                backgroundColor: isReconnecting
                  ? 'rgba(250, 166, 26, 0.8)'
                  : 'rgba(88, 101, 242, 0.8)',
              }}
              onClick={handleReconnect}
              disabled={isReconnecting}
            >
              {isReconnecting ? 'Reconnecting...' : 'Force Reconnect'}
            </button>
          </div>

          {/* Action status toast */}
          {actionStatus && (
            <div
              style={{
                padding: '4px 8px',
                fontSize: 11,
                color: actionStatus.startsWith('Error') ? '#f04747' : '#43b581',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 4,
              }}
            >
              {actionStatus}
            </div>
          )}
        </div>
      </div>

      {/* Info footer */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#72767d',
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
          flexShrink: 0,
        }}
      >
        <span>NAT: {natType}</span>
        <span>Server: {truncateId(serverPeerId || 'N/A')}</span>
      </div>
    </div>
  )
}
