import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface AuthSlice {
  /** null = unchecked, true/false = known */
  hasIdentity: boolean | null
  isUnlocked: boolean
  fingerprint: string | null
  publicKey: Uint8Array | null
}

export const createAuthSlice: StateCreator<RootStore, [], [], AuthSlice> = () => ({
  hasIdentity: null,
  isUnlocked: false,
  fingerprint: null,
  publicKey: null,
})
