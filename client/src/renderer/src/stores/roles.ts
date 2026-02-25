import type { StateCreator } from 'zustand'
import type { RoleResponse, RoleEvent } from '@shared/ipc-bridge'
import type { RootStore } from './index'

export interface RolesSlice {
  roles: RoleResponse[]
  rolesLoading: boolean
  fetchRoles: () => Promise<void>
  handleRoleEvent: (event: RoleEvent) => void
}

export const createRolesSlice: StateCreator<RootStore, [], [], RolesSlice> = (set, get) => ({
  roles: [],
  rolesLoading: false,

  fetchRoles: async () => {
    set({ rolesLoading: true })
    try {
      const roles = await window.united.roles.fetch()
      set({ roles, rolesLoading: false })
    } catch (err) {
      console.error('Failed to fetch roles:', err)
      set({ rolesLoading: false })
    }
  },

  handleRoleEvent: (event: RoleEvent) => {
    const current = get().roles

    switch (event.type) {
      case 'created': {
        if (event.role) {
          set({ roles: [...current, event.role] })
        }
        break
      }

      case 'updated': {
        if (event.role) {
          set({
            roles: current.map((r) =>
              r.id === event.role!.id ? event.role! : r
            )
          })
        }
        break
      }

      case 'deleted': {
        if (event.roleId) {
          set({ roles: current.filter((r) => r.id !== event.roleId) })
        }
        break
      }

      case 'assigned':
      case 'removed': {
        // Role assignment/removal doesn't change the role list itself
        // Components that need user-role data should re-fetch as needed
        break
      }
    }
  }
})
