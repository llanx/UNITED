import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface ServerSlice {
  serverId: string | null
  name: string | null
  description: string | null
  registrationMode: string | null
  isAdmin: boolean
}

export const createServerSlice: StateCreator<RootStore, [], [], ServerSlice> = () => ({
  serverId: null,
  name: null,
  description: null,
  registrationMode: null,
  isAdmin: false,
})
