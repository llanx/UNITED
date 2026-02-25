import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface AuthSlice {
  /** null = unchecked, true/false = known */
  hasIdentity: boolean | null
  isUnlocked: boolean
  fingerprint: string | null
  publicKey: Uint8Array | null
  mnemonic: string[] | null
  isOwner: boolean

  setIdentity: (fingerprint: string, publicKey: Uint8Array, mnemonic?: string[]) => void
  setUnlocked: (fingerprint: string, publicKey: Uint8Array) => void
  setOwner: (isOwner: boolean) => void
  clearMnemonic: () => void
}

export const createAuthSlice: StateCreator<RootStore, [], [], AuthSlice> = (set) => ({
  hasIdentity: null,
  isUnlocked: false,
  fingerprint: null,
  publicKey: null,
  mnemonic: null,
  isOwner: false,

  setIdentity: (fingerprint, publicKey, mnemonic) =>
    set({
      hasIdentity: true,
      isUnlocked: true,
      fingerprint,
      publicKey,
      mnemonic: mnemonic ?? null
    }),

  setUnlocked: (fingerprint, publicKey) =>
    set({
      isUnlocked: true,
      fingerprint,
      publicKey,
      mnemonic: null
    }),

  setOwner: (isOwner) =>
    set({ isOwner }),

  clearMnemonic: () =>
    set({ mnemonic: null }),
})
