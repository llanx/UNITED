import type { StateCreator } from 'zustand'
import type { RootStore } from './index'

export interface UiSlice {
  sidebarCollapsed: boolean
  activePanel: 'chat' | 'settings' | 'members' | 'channel-management' | 'role-management'
}

export const createUiSlice: StateCreator<RootStore, [], [], UiSlice> = () => ({
  sidebarCollapsed: false,
  activePanel: 'chat',
})
