import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface UiSlice {
  sidebarCollapsed: boolean
  activePanel: 'chat' | 'settings' | 'members'
}

export const createUiSlice: StateCreator<RootStore, [], [], UiSlice> = () => ({
  sidebarCollapsed: false,
  activePanel: 'chat',
})
