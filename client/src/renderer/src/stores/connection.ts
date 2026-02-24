import type { StateCreator } from 'zustand'
import type { ConnectionStatus } from '@shared/ws-protocol'
import type { RootStore } from './index'

export interface ConnectionSlice {
  status: ConnectionStatus
  serverUrl: string | null
}

export const createConnectionSlice: StateCreator<RootStore, [], [], ConnectionSlice> = () => ({
  status: 'disconnected',
  serverUrl: null,
})
