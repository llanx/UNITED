import type { StateCreator } from 'zustand'
import type { RoleResponse, RoleEvent } from '@shared/ipc-bridge'
import type { RootStore } from './index'

// Permission flags — must match server-side bitfield values
export const PERMISSIONS = {
  SEND_MESSAGES:   1 << 0,  // 1
  MANAGE_CHANNELS: 1 << 1,  // 2
  KICK_MEMBERS:    1 << 2,  // 4
  BAN_MEMBERS:     1 << 3,  // 8
  ADMIN:           1 << 4,  // 16
} as const

export type PermissionName = keyof typeof PERMISSIONS

export function hasPermission(permissions: number, flag: number): boolean {
  // Admin flag grants all permissions
  if (permissions & PERMISSIONS.ADMIN) return true
  return (permissions & flag) !== 0
}

export function computeEffectivePermissions(roles: RoleResponse[]): number {
  // Union resolution: bitwise OR of all role permission flags
  return roles.reduce((acc, role) => acc | role.permissions, 0)
}

export interface RolesSlice {
  roles: RoleResponse[]
  rolesLoading: boolean
  fetchRoles: () => Promise<void>
  handleRoleEvent: (event: RoleEvent) => void

  // CRUD actions
  createRole: (name: string, permissions: number, color?: string) => Promise<RoleResponse>
  updateRole: (id: string, name?: string, permissions?: number, color?: string) => Promise<RoleResponse>
  deleteRole: (id: string) => Promise<void>
  assignRole: (userId: string, roleId: string) => Promise<void>
  removeRole: (userId: string, roleId: string) => Promise<void>
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

  // CRUD actions
  createRole: async (name, permissions, color) => {
    const role = await window.united.roles.create(name, permissions, color)
    await get().fetchRoles()
    return role
  },

  updateRole: async (id, name, permissions, color) => {
    const role = await window.united.roles.update(id, name, permissions, color)
    await get().fetchRoles()
    return role
  },

  deleteRole: async (id) => {
    await window.united.roles.delete(id)
    await get().fetchRoles()
  },

  assignRole: async (userId, roleId) => {
    await window.united.roles.assign(userId, roleId)
  },

  removeRole: async (userId, roleId) => {
    await window.united.roles.remove(userId, roleId)
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
