import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

// ============================================================
// Block resolution state
// ============================================================

export interface BlockState {
  status: 'loading' | 'loaded' | 'error'
  /** Base64-encoded block data (when loaded) */
  data?: string
  /** Error message (when failed) */
  error?: string
  /** Timestamp when resolution started */
  startedAt: number
}

export interface BlocksSlice {
  /** Block resolution states keyed by content hash */
  blockStates: Map<string, BlockState>

  /** Mark a block as loading */
  requestBlock: (hash: string) => void

  /** Mark a block as loaded with base64 data */
  blockLoaded: (hash: string, data: string) => void

  /** Mark a block as failed */
  blockFailed: (hash: string, error: string) => void

  /** Reset a block to loading state for retry */
  retryBlock: (hash: string) => void
}

export const createBlocksSlice: StateCreator<RootStore, [], [], BlocksSlice> = (set, get) => ({
  blockStates: new Map(),

  requestBlock: (hash: string) => {
    const current = get().blockStates
    const next = new Map(current)
    next.set(hash, { status: 'loading', startedAt: Date.now() })
    set({ blockStates: next })
  },

  blockLoaded: (hash: string, data: string) => {
    const current = get().blockStates
    const next = new Map(current)
    next.set(hash, { status: 'loaded', data, startedAt: current.get(hash)?.startedAt ?? Date.now() })
    set({ blockStates: next })
  },

  blockFailed: (hash: string, error: string) => {
    const current = get().blockStates
    const next = new Map(current)
    next.set(hash, { status: 'error', error, startedAt: current.get(hash)?.startedAt ?? Date.now() })
    set({ blockStates: next })
  },

  retryBlock: (hash: string) => {
    const current = get().blockStates
    const next = new Map(current)
    next.set(hash, { status: 'loading', startedAt: Date.now() })
    set({ blockStates: next })
  },
})
