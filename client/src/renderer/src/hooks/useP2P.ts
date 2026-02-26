/**
 * Hook subscribing to P2P stats push events and providing test actions.
 *
 * Subscribes to PUSH_P2P_STATS events from the main process and writes
 * updates into the P2P Zustand slice. Returns action functions for
 * interactive P2P testing: send test message, ping peer, force reconnect.
 *
 * Pattern follows useConnection.ts — IPC listener setup in useEffect
 * with cleanup returned.
 */

import { useEffect, useCallback } from 'react'
import { useStore } from '../stores'
import type { P2PStats } from '@shared/ipc-bridge'

export function useP2P() {
  const setP2PStats = useStore((s) => s.setP2PStats)
  const peers = useStore((s) => s.peers)
  const topics = useStore((s) => s.topics)
  const natType = useStore((s) => s.natType)
  const isConnected = useStore((s) => s.isConnected)
  const serverPeerId = useStore((s) => s.serverPeerId)
  const devPanelOpen = useStore((s) => s.devPanelOpen)

  // Subscribe to P2P stats push events from main process
  useEffect(() => {
    const cleanup = window.united.p2p.onStatsUpdate((stats: P2PStats) => {
      setP2PStats(stats)
    })

    return cleanup
  }, [setP2PStats])

  // Test action: send a gossipsub message to a topic
  const sendTestMessage = useCallback(async (topic: string, text: string) => {
    await window.united.p2p.sendTestMessage(topic, text)
  }, [])

  // Test action: ping a specific peer and return RTT
  const pingPeer = useCallback(async (peerId: string): Promise<{ rttMs: number }> => {
    return window.united.p2p.pingPeer(peerId)
  }, [])

  // Test action: force disconnect and reconnect
  const forceReconnect = useCallback(async () => {
    await window.united.p2p.forceReconnect()
  }, [])

  return {
    peers,
    topics,
    natType,
    isConnected,
    serverPeerId,
    devPanelOpen,
    sendTestMessage,
    pingPeer,
    forceReconnect
  }
}
