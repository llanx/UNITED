import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface SettingsSlice {
  theme: 'dark'
  displayName: string | null
}

export const createSettingsSlice: StateCreator<RootStore, [], [], SettingsSlice> = () => ({
  theme: 'dark',
  displayName: null,
})
