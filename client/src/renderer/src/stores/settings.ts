import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface SettingsSlice {
  theme: 'dark'
  displayName: string | null

  /** Storage budget in GB (1-50, default 5) */
  storageBudgetGb: number
  /** Warm tier TTL in days (3-30, default 7) */
  warmTtlDays: number

  /** Update storage budget and persist to block store config */
  setStorageBudget: (gb: number) => void
  /** Update warm TTL and persist to block store config */
  setWarmTtl: (days: number) => void
}

export const createSettingsSlice: StateCreator<RootStore, [], [], SettingsSlice> = (set) => ({
  theme: 'dark',
  displayName: null,
  storageBudgetGb: 5,
  warmTtlDays: 7,

  setStorageBudget: (gb: number) => {
    const budgetBytes = gb * 1024 * 1024 * 1024
    set({ storageBudgetGb: gb })
    window.united.blocks.setConfig({ budgetBytes }).catch((err) => {
      console.error('[Settings] Failed to persist storage budget:', err)
    })
  },

  setWarmTtl: (days: number) => {
    set({ warmTtlDays: days })
    window.united.blocks.setConfig({ warmTtlDays: days }).catch((err) => {
      console.error('[Settings] Failed to persist warm TTL:', err)
    })
  },
})
